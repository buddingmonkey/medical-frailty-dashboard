import {
  ccsrGroupsCovered,
  mappingKey,
  type PlacementBasis,
  unifiedOf,
  type UnifiedOfContext,
} from '@mfcd/shared'
import { and, eq, isNotNull, type SQL, sql } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'

import { loadCcsrIndex } from './ccsr'
import type { Db } from './client'
import { bumpDataVersion } from './meta'
import {
  datasetVersions,
  entries,
  entryUnified,
  states,
  unifiedCategories,
  unifiedCcsr,
  unifiedMappings,
  unifiedUniverse,
} from './schema'

// Precomputed coverage data (roadmap M5 step 4; docs/data-model.md, "Coverage summary").
// Public pages must not place thousands of entries in Worker JavaScript (10 ms of CPU on the
// Free plan), so admin writes do it once here and public routes read the rows with SQL.
//
// - `entry_unified`: where each entry of a published version counts among the published unified
//   categories (`unifiedOf`). Recomputed for a state after publish, rollback or a mapping
//   approval, and for every state after a category's CCSR set or status changes.
// - `unified_universe`: each category's billable ICD-10-CM codes, rewritten in SQL when its CCSR
//   set changes (`universeStatements`).

/** Rows per write statement: one bound JSON parameter each (D1 binds at most 100). */
const ROWS_PER_STATEMENT = 1000

export type PlacementScope = { stateIds: readonly string[] } | 'all'

export interface RecomputeResult {
  /** Published entries read. */
  entries: number
  /** Placements after the recompute. */
  placements: number
  inserted: number
  updated: number
  deleted: number
  /** Wall time, D1 included (Date.now() only moves on I/O in a Worker). */
  ms: number
}

/** `IN (SELECT value FROM json_each(?))`: one bound parameter for a whole list. */
const inList = (values: readonly string[]) =>
  sql`(SELECT value FROM json_each(${JSON.stringify(values)}))`

/**
 * Write statements per D1 batch (each batch is one transaction): 4 × ROWS_PER_STATEMENT rows,
 * so no batch is heavy for D1 (docs/deployment.md, "Preview data": one batch for every state
 * hit D1's CPU limit, 2026-11-04).
 */
const STATEMENTS_PER_BATCH = 4

/**
 * Places every entry of the published versions in scope and writes only the difference: rows
 * that moved are deleted, new or changed rows upserted, with a `data_version` bump when anything
 * changed. Rows of a state's other versions are deleted.
 *
 * It works one state at a time ('all' is every state), and writes each state's difference in
 * batches of at most STATEMENTS_PER_BATCH statements, so no D1 query or batch grows with the
 * number of states. A failure part way leaves the states and batches before it written; calling
 * it again finishes the job, because only the difference is written.
 */
export async function recomputePlacements(
  db: Db,
  scope: PlacementScope,
  options: { categories?: PlacementCategories } = {},
): Promise<RecomputeResult> {
  const started = Date.now()
  const stateIds =
    scope === 'all'
      ? (await db.select({ id: states.id }).from(states).orderBy(states.id)).map((s) => s.id)
      : scope.stateIds
  // Read once for every state in scope, not once per state.
  const categories = options.categories ?? (await loadPlacementCategories(db))
  const total = { entries: 0, placements: 0, inserted: 0, updated: 0, deleted: 0 }
  for (const stateId of stateIds) {
    const one = await recomputeState(db, stateId, categories)
    total.entries += one.entries
    total.placements += one.placements
    total.inserted += one.inserted
    total.updated += one.updated
    total.deleted += one.deleted
  }
  const result: RecomputeResult = { ...total, ms: Date.now() - started }
  // Counts only: no codes, no names.
  console.log(
    JSON.stringify({
      event: 'placements.recompute',
      scope: scope === 'all' ? 'all' : scope.stateIds,
      ...result,
    }),
  )
  return result
}

/** Every unified category with its status and CCSR groups, as `unifiedOf` reads them. */
export type PlacementCategories = UnifiedOfContext['categories']

/**
 * The categories' part of the placement context: the same for every state, so a caller placing
 * several states in one request (Rebuild coverage) reads it once and passes it in.
 */
export async function loadPlacementCategories(db: Db): Promise<PlacementCategories> {
  const [categories, groups] = await db.batch([
    db
      .select({ id: unifiedCategories.id, status: unifiedCategories.status })
      .from(unifiedCategories),
    db.select().from(unifiedCcsr),
  ])
  return new Map(
    categories.map((c) => [
      c.id,
      {
        status: c.status,
        ccsr: new Set(groups.filter((g) => g.unifiedId === c.id).map((g) => g.ccsrCategory)),
      },
    ]),
  )
}

/** One state's part of `recomputePlacements`. */
async function recomputeState(
  db: Db,
  stateId: string,
  ctxCategories: PlacementCategories,
): Promise<Omit<RecomputeResult, 'ms'>> {
  const stateFilter = (column: SQLiteColumn) => sql`${column} IN ${inList([stateId])}`

  // Promise.all, not db.batch: D1 batches return rows as objects, which loses one of two
  // joined columns with the same name (entries.id, states.id).
  const [published, mappings, existing] = await Promise.all([
    db
      .select({
        id: entries.id,
        stateId: states.id,
        codeSystem: entries.codeSystem,
        codeNorm: entries.codeNorm,
        matchKind: entries.matchKind,
        rangeEndNorm: entries.rangeEndNorm,
        includesChildren: entries.includesChildren,
        stateCategory: entries.stateCategory,
        stateSubcategory: entries.stateSubcategory,
      })
      .from(states)
      .innerJoin(entries, eq(entries.versionId, states.publishedVersionId))
      .where(and(isNotNull(states.publishedVersionId), stateFilter(states.id))),
    db
      .select({
        stateId: unifiedMappings.stateId,
        stateCategory: unifiedMappings.stateCategory,
        stateSubcategory: unifiedMappings.stateSubcategory,
        unifiedId: unifiedMappings.unifiedId,
        relation: unifiedMappings.relation,
        status: unifiedMappings.status,
      })
      .from(unifiedMappings)
      .where(and(eq(unifiedMappings.status, 'approved'), stateFilter(unifiedMappings.stateId))),
    db
      .select({
        entryId: entryUnified.entryId,
        unifiedId: entryUnified.unifiedId,
        basis: entryUnified.basis,
        reviewed: entryUnified.reviewed,
      })
      .from(entryUnified)
      .innerJoin(entries, eq(entries.id, entryUnified.entryId))
      .innerJoin(datasetVersions, eq(datasetVersions.id, entries.versionId))
      .where(stateFilter(datasetVersions.stateId)),
  ])

  const index = await loadCcsrIndex(
    db,
    published.filter((e) => e.codeSystem === 'icd10cm'),
  )
  const mappingsByKey = new Map<string, UnifiedOfContext['mappings'][number][]>()
  for (const m of mappings) {
    const key = `${m.stateId}\u0000${mappingKey(m.stateCategory, m.stateSubcategory)}`
    mappingsByKey.set(key, [...(mappingsByKey.get(key) ?? []), m])
  }

  // Entries of one state category with the same code system and CCSR groups place alike.
  const memo = new Map<string, ReturnType<typeof unifiedOf>>()
  const wanted = new Map<
    string,
    { entryId: number; unifiedId: number; basis: PlacementBasis; reviewed: 0 | 1 }
  >()
  for (const e of published) {
    const entryCcsr = e.codeSystem === 'icd10cm' ? ccsrGroupsCovered(e, index) : []
    const categoryKey = `${e.stateId}\u0000${mappingKey(e.stateCategory, e.stateSubcategory)}`
    const memoKey = `${categoryKey}\u0000${e.codeSystem}\u0000${entryCcsr.join(',')}`
    let placement = memo.get(memoKey)
    if (!placement) {
      placement = unifiedOf(e, {
        mappings: mappingsByKey.get(categoryKey) ?? [],
        categories: ctxCategories,
        entryCcsr,
      })
      memo.set(memoKey, placement)
    }
    if (placement.basis === 'none') continue
    for (const unifiedId of placement.unifiedIds) {
      wanted.set(`${String(e.id)}:${String(unifiedId)}`, {
        entryId: e.id,
        unifiedId,
        basis: placement.basis,
        reviewed: placement.reviewed ? 1 : 0,
      })
    }
  }

  const deletes: [number, number][] = []
  const have = new Map<string, { basis: string; reviewed: number }>()
  for (const r of existing) {
    const key = `${String(r.entryId)}:${String(r.unifiedId)}`
    have.set(key, r)
    if (!wanted.has(key)) deletes.push([r.entryId, r.unifiedId])
  }
  const upserts: [number, number, PlacementBasis, 0 | 1][] = []
  let updated = 0
  for (const [key, w] of wanted) {
    const old = have.get(key)
    if (old?.basis === w.basis && old.reviewed === w.reviewed) continue
    if (old) updated += 1
    upserts.push([w.entryId, w.unifiedId, w.basis, w.reviewed])
  }

  const writes = []
  for (let i = 0; i < deletes.length; i += ROWS_PER_STATEMENT) {
    const chunk = JSON.stringify(deletes.slice(i, i + ROWS_PER_STATEMENT))
    writes.push(
      db.delete(entryUnified).where(sql`(${entryUnified.entryId}, ${entryUnified.unifiedId}) IN (
        SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(${chunk}))`),
    )
  }
  for (let i = 0; i < upserts.length; i += ROWS_PER_STATEMENT) {
    const chunk = JSON.stringify(upserts.slice(i, i + ROWS_PER_STATEMENT))
    writes.push(
      db
        .insert(entryUnified)
        // `WHERE true` keeps SQLite from reading ON CONFLICT as a join constraint.
        .select(
          sql`SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'),
                     json_extract(value, '$[2]'), json_extract(value, '$[3]')
              FROM json_each(${chunk}) WHERE true`,
        )
        .onConflictDoUpdate({
          target: [entryUnified.entryId, entryUnified.unifiedId],
          set: { basis: sql`excluded.basis`, reviewed: sql`excluded.reviewed` },
        }),
    )
  }
  // The bump goes with every batch, so a page cached between two batches is not read again.
  for (let i = 0; i < writes.length; i += STATEMENTS_PER_BATCH) {
    const [firstWrite, ...moreWrites] = writes.slice(i, i + STATEMENTS_PER_BATCH)
    if (firstWrite) await db.batch([firstWrite, ...moreWrites, bumpDataVersion(db)])
  }

  return {
    entries: published.length,
    placements: wanted.size,
    inserted: upserts.length - updated,
    updated,
    deleted: deletes.length,
  }
}

/**
 * The statements that rewrite a category's universe (`unified_universe`) from its current CCSR
 * set, for the batch that changes the set (they read `unified_ccsr` after its rewrite): every
 * billable ICD-10-CM code of the current release (`valid_to` NULL) whose CCSR groups, by the
 * longest-prefix rule (`ccsrGroupsOf`), meet the set. Only rows that change are written.
 *
 * `unifiedId` is the id, or a subquery for a row the same batch creates.
 */
export function universeStatements(db: Db, unifiedId: SQL) {
  // The codes: candidates in each ICD-10-CM category (3 characters) where a ref_ccsr key has one
  // of the groups; each candidate's own groups are those of its longest key (3 to 7 characters).
  //
  // CROSS JOIN keeps `cats` outside, so each category reads its own range of `ref_codes` by
  // primary key, and MATERIALIZED computes `hits` once for `best` and `codes`. Without them
  // SQLite scanned every ICD-10-CM code per row of `cats` and ran `hits` again per row of `best`:
  // on preview (full reference data) one category read 62M rows in 17.7 s, and Rebuild coverage
  // hit D1's CPU limit; with them, 101k rows in 0.04 s (2026-11-04).
  const codes = sql`
    groups AS (SELECT ccsr_category FROM unified_ccsr WHERE unified_id = ${unifiedId}),
    cats AS (
      SELECT DISTINCT substr(code_norm, 1, 3) AS cat FROM ref_ccsr
      WHERE ccsr_category IN (SELECT ccsr_category FROM groups)
    ),
    hits AS MATERIALIZED (
      SELECT c.code_norm AS code, length(r.code_norm) AS len, r.ccsr_category AS grp
      FROM cats
      CROSS JOIN ref_codes c
        ON c.code_system = 'icd10cm' AND c.code_norm >= cats.cat AND c.code_norm < cats.cat || '~'
      JOIN ref_ccsr r ON r.code_norm IN (
        substr(c.code_norm, 1, 3), substr(c.code_norm, 1, 4), substr(c.code_norm, 1, 5),
        substr(c.code_norm, 1, 6), substr(c.code_norm, 1, 7))
      WHERE c.billable = 1 AND c.valid_to IS NULL
    ),
    best AS (SELECT code, max(len) AS len FROM hits GROUP BY code),
    codes AS (
      SELECT DISTINCT h.code FROM hits h JOIN best b ON b.code = h.code AND b.len = h.len
      WHERE h.grp IN (SELECT ccsr_category FROM groups)
    )`
  return [
    db
      .delete(unifiedUniverse)
      .where(
        and(
          sql`${unifiedUniverse.unifiedId} = ${unifiedId}`,
          sql`${unifiedUniverse.codeNorm} NOT IN (WITH ${codes} SELECT code FROM codes)`,
        ),
      ),
    db
      .insert(unifiedUniverse)
      .select(sql`WITH ${codes} SELECT ${unifiedId}, code FROM codes WHERE true`)
      .onConflictDoNothing(),
  ] as const
}

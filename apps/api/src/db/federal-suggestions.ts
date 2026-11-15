import {
  buildSuggestionReference,
  decodeStateFederal,
  decodeSuggestion,
  type FederalCategory,
  federalCategoryList,
  federalRuleOf,
  type LawCategory,
  mappingKey,
  sha256Hex,
  type SuggestionChange,
  type SuggestionLevel,
  type SuggestionReference,
  type SuggestionReferenceRow,
  suggestFederal,
} from '@mfcd/shared'
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'

import type { Db } from './client'
import { stateFederalSql, suggestionSql, unifiedParentsSql } from './federal'
import { bumpDataVersion } from './meta'
import {
  categoryMappings,
  chapterMappings,
  entries,
  entryFederalSuggestions,
  states,
} from './schema'

// Federal categories suggested by code (docs/data-model.md, "Federal categories"; the rule is
// `suggestFederal` in packages/shared). The reference is every published entry the state gave
// federal categories (today Indiana's Tier 1). A plan reads one state's published entries and
// their stored suggestions, works out the rows wanted, and the write sends only the difference:
// json_each chunks of ROWS_PER_STATEMENT rows, STATEMENTS_PER_BATCH statements per D1 batch,
// like Rebuild coverage (src/db/placement.ts). Nebraska's ~8.2k entries are at most ~17
// statements, 5 batches, in one request; a failure part way leaves earlier batches written,
// and running it again writes only what is left.
//
// Reviewed suggestions are never changed here (a re-run leaves them, a publish carries them
// over to the new version's matching entries). Entries with stated categories get none.

/** Rows per write statement: one bound JSON parameter each. */
const ROWS_PER_STATEMENT = 1000
/** Write statements per D1 batch (each batch is one transaction). */
const STATEMENTS_PER_BATCH = 4

/** The published entries that name federal categories: the reference, with state names. */
export async function loadSuggestionReference(db: Db): Promise<{
  reference: SuggestionReference
  names: string[]
}> {
  const rows = await db
    .select({
      stateId: states.id,
      stateName: states.name,
      codeNorm: entries.codeNorm,
      stated: entries.stateFederalCategories,
    })
    .from(states)
    .innerJoin(entries, eq(entries.versionId, states.publishedVersionId))
    .where(and(eq(entries.codeSystem, 'icd10cm'), isNotNull(entries.stateFederalCategories)))
  const refRows: SuggestionReferenceRow[] = rows.map((r) => ({
    stateId: r.stateId,
    stateName: r.stateName,
    codeNorm: r.codeNorm,
    categories: decodeStateFederal(r.stated),
  }))
  const reference = buildSuggestionReference(refRows)
  return { reference, names: [...reference.names.values()].sort() }
}

type Row = [
  entryId: number,
  category: LawCategory,
  level: SuggestionLevel,
  referenceStateId: string,
  reviewed: 0 | 1,
  reviewedBy: string | null,
  reviewedAt: string | null,
]

export interface SuggestionPlan {
  stateId: string
  versionId: number | null
  /** Published ICD-10-CM entries the plan looked at (not stated by the state). */
  entries: number
  changes: SuggestionChange[]
  upserts: Row[]
  deletes: [number, LawCategory][]
}

/** Key of an entry across versions, for carrying a review over to a new version. */
const carryKey = (e: {
  codeSystem: string
  matchKind: string
  codeNorm: string
  rangeEndNorm: string | null
  stateCategory: string
  stateSubcategory: string
}) =>
  [
    e.codeSystem,
    e.matchKind,
    e.codeNorm,
    e.rangeEndNorm ?? '',
    mappingKey(e.stateCategory, e.stateSubcategory),
  ].join('\u0000')

/**
 * What a run would write for the state's published version. `carryFrom`: a version whose
 * reviewed suggestions carry over to the same entries (code, kind, range end, category) of the
 * new one; publish passes the version it replaced.
 */
export async function planSuggestions(
  db: Db,
  stateId: string,
  reference: SuggestionReference,
  options: { carryFrom?: number | null } = {},
): Promise<SuggestionPlan> {
  const [state] = await db
    .select({ versionId: states.publishedVersionId })
    .from(states)
    .where(eq(states.id, stateId))
  const versionId = state?.versionId ?? null
  if (versionId === null) {
    return { stateId, versionId, entries: 0, changes: [], upserts: [], deletes: [] }
  }
  const entryFields = {
    id: entries.id,
    codeSystem: entries.codeSystem,
    matchKind: entries.matchKind,
    codeNorm: entries.codeNorm,
    rangeEndNorm: entries.rangeEndNorm,
    stateCategory: entries.stateCategory,
    stateSubcategory: entries.stateSubcategory,
  }
  const carryFrom = options.carryFrom ?? null
  const [published, stored, carried] = await Promise.all([
    db
      .select({
        ...entryFields,
        rawCode: entries.rawCode,
        description: entries.descriptionPublished,
        stated: entries.stateFederalCategories,
      })
      .from(entries)
      .where(eq(entries.versionId, versionId))
      .orderBy(asc(entries.id)),
    db
      .select({
        entryId: entryFederalSuggestions.entryId,
        category: entryFederalSuggestions.federalCategory,
        level: entryFederalSuggestions.level,
        referenceStateId: entryFederalSuggestions.referenceStateId,
        reviewed: entryFederalSuggestions.reviewed,
      })
      .from(entryFederalSuggestions)
      .innerJoin(entries, eq(entries.id, entryFederalSuggestions.entryId))
      .where(eq(entries.versionId, versionId)),
    carryFrom === null || carryFrom === versionId
      ? Promise.resolve([])
      : db
          .select({
            ...entryFields,
            category: entryFederalSuggestions.federalCategory,
            level: entryFederalSuggestions.level,
            referenceStateId: entryFederalSuggestions.referenceStateId,
            reviewedBy: entryFederalSuggestions.reviewedBy,
            reviewedAt: entryFederalSuggestions.reviewedAt,
          })
          .from(entryFederalSuggestions)
          .innerJoin(entries, eq(entries.id, entryFederalSuggestions.entryId))
          .where(and(eq(entries.versionId, carryFrom), eq(entryFederalSuggestions.reviewed, 1))),
  ])

  const storedBy = new Map<number, typeof stored>()
  for (const s of stored) storedBy.set(s.entryId, [...(storedBy.get(s.entryId) ?? []), s])
  const carriedBy = new Map<string, typeof carried>()
  for (const c of carried) {
    const key = carryKey(c)
    // Only the rows of one old entry per key (the first id), so two old duplicates never mix.
    const have = carriedBy.get(key)
    if (have && have[0]?.id !== c.id) continue
    carriedBy.set(key, [...(have ?? []), c])
  }

  const plan: SuggestionPlan = {
    stateId,
    versionId,
    entries: 0,
    changes: [],
    upserts: [],
    deletes: [],
  }
  for (const e of published) {
    const have = storedBy.get(e.id) ?? []
    const before = have.map((s) => s.category)
    if (decodeStateFederal(e.stated).length > 0 || e.codeSystem !== 'icd10cm') {
      // Stated by the state (or not ICD-10-CM): never a suggestion.
      for (const s of have) plan.deletes.push([e.id, s.category])
      continue
    }
    plan.entries += 1
    const reviewed = have.length > 0 && have.every((s) => s.reviewed === 1)
    const change = { entryId: e.id, code: e.rawCode, description: e.description }
    if (reviewed) {
      plan.changes.push({ ...change, reviewed: true, before, after: before })
      continue
    }
    let wanted: Row[]
    const carry = carriedBy.get(carryKey(e))
    if (carry && carry.length > 0) {
      wanted = carry.map((c) => [
        e.id,
        c.category,
        c.level,
        c.referenceStateId,
        1,
        c.reviewedBy,
        c.reviewedAt,
      ])
    } else {
      const s = suggestFederal(e, reference)
      const from = s?.referenceStateIds[0]
      wanted =
        s && from !== undefined
          ? s.categories.map((category) => [e.id, category, s.level, from, 0, null, null])
          : []
    }
    const wantedBy = new Map(wanted.map((w) => [w[1], w]))
    for (const s of have) if (!wantedBy.has(s.category)) plan.deletes.push([e.id, s.category])
    for (const w of wanted) {
      const old = have.find((s) => s.category === w[1])
      if (old?.level === w[2] && old.referenceStateId === w[3] && old.reviewed === w[4]) continue
      plan.upserts.push(w)
    }
    plan.changes.push({ ...change, reviewed: false, before, after: wanted.map((w) => w[1]) })
  }
  return plan
}

/** Hash of everything a run would write: the preview's token, checked again on save. */
export async function planToken(plan: SuggestionPlan, referenceNames: string[]): Promise<string> {
  const text = JSON.stringify({
    stateId: plan.stateId,
    versionId: plan.versionId,
    referenceNames,
    upserts: plan.upserts,
    deletes: plan.deletes,
  })
  return sha256Hex(new Uint8Array(new TextEncoder().encode(text)))
}

/**
 * Writes the plan's difference, with a `data_version` bump in every batch. `last` runs in the
 * final batch (an audit row, the published date); with nothing to write, it runs alone.
 */
export async function writeSuggestionPlan(
  db: Db,
  plan: SuggestionPlan,
  last: BatchItem<'sqlite'>[] = [],
): Promise<{ upserted: number; deleted: number }> {
  const writes: BatchItem<'sqlite'>[] = []
  for (let i = 0; i < plan.deletes.length; i += ROWS_PER_STATEMENT) {
    const chunk = JSON.stringify(plan.deletes.slice(i, i + ROWS_PER_STATEMENT))
    writes.push(
      db.delete(entryFederalSuggestions)
        .where(sql`(${entryFederalSuggestions.entryId}, ${entryFederalSuggestions.federalCategory}) IN (
        SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(${chunk}))`),
    )
  }
  for (let i = 0; i < plan.upserts.length; i += ROWS_PER_STATEMENT) {
    const chunk = JSON.stringify(plan.upserts.slice(i, i + ROWS_PER_STATEMENT))
    writes.push(
      db
        .insert(entryFederalSuggestions)
        // `WHERE true` keeps SQLite from reading ON CONFLICT as a join constraint.
        .select(
          sql`SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'),
                     json_extract(value, '$[2]'), json_extract(value, '$[3]'),
                     json_extract(value, '$[4]'), json_extract(value, '$[5]'),
                     json_extract(value, '$[6]')
              FROM json_each(${chunk}) WHERE true`,
        )
        .onConflictDoUpdate({
          target: [entryFederalSuggestions.entryId, entryFederalSuggestions.federalCategory],
          set: {
            level: sql`excluded.level`,
            referenceStateId: sql`excluded.reference_state_id`,
            reviewed: sql`excluded.reviewed`,
            reviewedBy: sql`excluded.reviewed_by`,
            reviewedAt: sql`excluded.reviewed_at`,
          },
        }),
    )
  }
  const batches: BatchItem<'sqlite'>[][] = []
  for (let i = 0; i < writes.length; i += STATEMENTS_PER_BATCH) {
    batches.push([...writes.slice(i, i + STATEMENTS_PER_BATCH), bumpDataVersion(db)])
  }
  const final = batches.at(-1)
  if (final) final.push(...last)
  else if (last.length > 0) batches.push(last)
  for (const [first, ...rest] of batches) if (first) await db.batch([first, ...rest])
  return { upserted: plan.upserts.length, deleted: plan.deletes.length }
}

/** Publish: suggestions for the state's new published version, reviews carried over. */
export async function suggestAfterPublish(
  db: Db,
  stateId: string,
  carryFrom: number | null,
): Promise<void> {
  const started = Date.now()
  const { reference } = await loadSuggestionReference(db)
  const plan = await planSuggestions(db, stateId, reference, { carryFrom })
  const written = await writeSuggestionPlan(db, plan)
  // Counts only: no codes, no names.
  console.log(
    JSON.stringify({
      event: 'suggestions.publish',
      stateId,
      entries: plan.entries,
      ...written,
      ms: Date.now() - started,
    }),
  )
}

/**
 * Ids of the state's published entries, in the given categories (`mappingKey`), whose federal
 * categories come from an unreviewed suggestion right now (rule `suggested`). Confirming only
 * these moves no entry: a suggestion hidden by a placement, chapter override or manual mapping
 * stays unreviewed.
 */
export async function applyingSuggestionIds(
  db: Db,
  state: { id: string; publishedVersionId: number | null },
  categoryKeys: ReadonlySet<string>,
): Promise<number[]> {
  if (state.publishedVersionId === null || categoryKeys.size === 0) return []
  const [rows, mappingRows, overrideRows] = await Promise.all([
    db
      .select({
        id: entries.id,
        codeSystem: entries.codeSystem,
        codeNorm: entries.codeNorm,
        stateCategory: entries.stateCategory,
        stateSubcategory: entries.stateSubcategory,
        stateFederal: stateFederalSql,
        parents: unifiedParentsSql,
        suggestion: suggestionSql,
      })
      .from(entries)
      .where(
        and(
          eq(entries.versionId, state.publishedVersionId),
          sql`EXISTS (SELECT 1 FROM entry_federal_suggestions s WHERE s.entry_id = ${entries.id} AND s.reviewed = 0)`,
        ),
      ),
    db.select().from(categoryMappings).where(eq(categoryMappings.stateId, state.id)),
    db.select().from(chapterMappings).where(eq(chapterMappings.stateId, state.id)),
  ])
  const { mappings, manualKeys } = mappingLookups(mappingRows)
  const overrides = new Map(overrideRows.map((o) => [o.chapter, o.federalCategory]))
  return rows
    .filter((r) => categoryKeys.has(mappingKey(r.stateCategory, r.stateSubcategory)))
    .filter(
      (r) =>
        federalRuleOf(
          {
            ...r,
            stateFederalCategories: decodeStateFederal(r.stateFederal),
            suggestion: decodeSuggestion(r.suggestion),
          },
          federalCategoryList(r.parents),
          mappings,
          overrides,
          manualKeys,
        ).rule === 'suggested',
    )
    .map((r) => r.id)
}

/** The statements that mark these entries' suggestions reviewed, in chunks. */
export function confirmSuggestionStatements(
  db: Db,
  entryIds: readonly number[],
  actor: string,
  now: string,
): BatchItem<'sqlite'>[] {
  const out: BatchItem<'sqlite'>[] = []
  for (let i = 0; i < entryIds.length; i += ROWS_PER_STATEMENT) {
    const chunk = JSON.stringify(entryIds.slice(i, i + ROWS_PER_STATEMENT))
    out.push(
      db
        .update(entryFederalSuggestions)
        .set({ reviewed: 1, reviewedBy: actor, reviewedAt: now })
        .where(
          and(
            eq(entryFederalSuggestions.reviewed, 0),
            sql`${entryFederalSuggestions.entryId} IN (SELECT value FROM json_each(${chunk}))`,
          ),
        ),
    )
  }
  return out
}

/** A state's mappings by `mappingKey`, and the keys an admin confirmed (method `manual`). */
export function mappingLookups(
  rows: readonly {
    stateCategory: string
    stateSubcategory: string
    federalCategory: FederalCategory
    method: string
  }[],
): { mappings: Map<string, FederalCategory>; manualKeys: Set<string> } {
  const mappings = new Map<string, FederalCategory>()
  const manualKeys = new Set<string>()
  for (const m of rows) {
    const key = mappingKey(m.stateCategory, m.stateSubcategory)
    mappings.set(key, m.federalCategory)
    if (m.method === 'manual') manualKeys.add(key)
  }
  return { mappings, manualKeys }
}

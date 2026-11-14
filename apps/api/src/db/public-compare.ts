import {
  buildCompare,
  comparePatternKey,
  type CompareQuery,
  type CompareResult,
  decodeStateFederal,
  type FederalCategory,
  federalCategoriesOf,
  federalCategoryList,
  mappingKey,
} from '@mfcd/shared'
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm'

import type { Db } from './client'
import { chunk, D1_MAX_PARAMS } from './d1-limits'
import { stateFederalSql, unifiedParentsSql } from './federal'
import { categoryMappings, chapterMappings, entries, refCodes, states } from './schema'

// Compare by category (roadmap M4): loads the selected states' published entries with their
// federal categories (their unified categories' parents, else the M2 mapping), lets
// `buildCompare` align them, then fills ICD-10-CM and HCPCS row
// descriptions from the CMS reference codes (public domain; CPT text only ever comes from a
// state, docs/data-model.md "Licensing of code text"). Four queries, plus one per 100 rows
// described.

export type CompareLoad =
  { ok: true; result: CompareResult } | { ok: false; unknownStates: string[] }

export async function publicCompare(
  db: Db,
  query: CompareQuery,
  options: { allRows?: boolean } = {},
): Promise<CompareLoad> {
  const ids = query.states
  const [stateRows, rows, mappings, overrides] = await Promise.all([
    db
      .select({
        id: states.id,
        slug: states.slug,
        name: states.name,
        publishedVersionId: states.publishedVersionId,
      })
      .from(states)
      .where(inArray(states.id, ids)),
    db
      .select({
        stateId: states.id,
        codeSystem: entries.codeSystem,
        codeNorm: entries.codeNorm,
        matchKind: entries.matchKind,
        rangeEndNorm: entries.rangeEndNorm,
        includesChildren: entries.includesChildren,
        stateCategory: entries.stateCategory,
        stateSubcategory: entries.stateSubcategory,
        tier: entries.tier,
        qualification: entries.qualification,
        qualificationBasis: entries.qualificationBasis,
        stateFederal: stateFederalSql,
        parents: unifiedParentsSql,
      })
      .from(states)
      .innerJoin(entries, eq(entries.versionId, states.publishedVersionId))
      .where(and(inArray(states.id, ids), isNotNull(states.publishedVersionId))),
    db.select().from(categoryMappings).where(inArray(categoryMappings.stateId, ids)),
    db.select().from(chapterMappings).where(inArray(chapterMappings.stateId, ids)),
  ])

  const found = new Set(stateRows.map((s) => s.id))
  const unknownStates = ids.filter((id) => !found.has(id))
  if (unknownStates.length > 0) return { ok: false, unknownStates }

  const mappingsBy = new Map<string, Map<string, FederalCategory>>()
  for (const m of mappings) {
    const forState = mappingsBy.get(m.stateId) ?? new Map<string, FederalCategory>()
    forState.set(mappingKey(m.stateCategory, m.stateSubcategory), m.federalCategory)
    mappingsBy.set(m.stateId, forState)
  }
  const overridesBy = new Map<string, Map<number, FederalCategory>>()
  for (const o of overrides) {
    const forState = overridesBy.get(o.stateId) ?? new Map<number, FederalCategory>()
    forState.set(o.chapter, o.federalCategory)
    overridesBy.set(o.stateId, forState)
  }
  const none = new Map<never, FederalCategory>()

  const result = buildCompare(
    {
      query,
      states: stateRows.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        published: s.publishedVersionId !== null,
      })),
      entries: rows.map(({ parents, stateFederal, ...r }) => ({
        ...r,
        // Descriptions are read for the rows shown only (describeFromStates): the bulk load
        // stays small, which keeps the Worker inside the Free plan's CPU time.
        descriptionPublished: null,
        includesChildren: r.includesChildren === 1 ? 1 : r.includesChildren === 0 ? 0 : null,
        federalCategories: federalCategoriesOf(
          { ...r, stateFederalCategories: decodeStateFederal(stateFederal) },
          federalCategoryList(parents),
          mappingsBy.get(r.stateId) ?? none,
          overridesBy.get(r.stateId) ?? none,
        ),
      })),
    },
    options,
  )

  await describeFromCms(db, result)
  await describeFromStates(db, result)
  return { ok: true, result }
}

/** ICD-10-CM and HCPCS rows (codes and wildcards, not ranges) take the CMS description. */
async function describeFromCms(db: Db, result: CompareResult): Promise<void> {
  const wanted = result.rows.filter(
    (r) => (r.codeSystem === 'icd10cm' || r.codeSystem === 'hcpcs') && r.matchKind !== 'range',
  )
  const norms = [...new Set(wanted.map((r) => r.codeNorm))]
  if (norms.length === 0) return
  const select = (chunk: string[]) =>
    db
      .select({
        codeSystem: refCodes.codeSystem,
        codeNorm: refCodes.codeNorm,
        description: refCodes.description,
      })
      .from(refCodes)
      .where(inArray(refCodes.codeNorm, chunk))
      // Newest release first; the first one seen wins.
      .orderBy(desc(refCodes.validFrom))
  const [first, ...rest] = chunk(norms, D1_MAX_PARAMS).map(select)
  if (!first) return
  const found = new Map<string, string>()
  for (const r of (await db.batch([first, ...rest])).flat()) {
    const key = `${r.codeSystem}|${r.codeNorm}`
    if (!found.has(key)) found.set(key, r.description)
  }
  for (const row of wanted) {
    const description = found.get(`${row.codeSystem}|${row.codeNorm}`)
    if (description !== undefined) {
      row.description = description
      row.descriptionSource = 'cms'
    }
  }
}

/**
 * Rows CMS does not describe take the state's own published text (CPT included, with the
 * state named as the source): the first column state that published one for the same entry.
 */
async function describeFromStates(db: Db, result: CompareResult): Promise<void> {
  const wanted = result.rows.filter((r) => r.description === null)
  const norms = [...new Set(wanted.map((r) => r.codeNorm))]
  if (norms.length === 0) return
  const ids = result.states.map((s) => s.id)
  // The state ids take up to 51 of the 100 bound parameters.
  const size = D1_MAX_PARAMS - ids.length - 1
  const select = (chunk: string[]) =>
    db
      .select({
        stateId: states.id,
        codeSystem: entries.codeSystem,
        codeNorm: entries.codeNorm,
        matchKind: entries.matchKind,
        rangeEndNorm: entries.rangeEndNorm,
        includesChildren: entries.includesChildren,
        description: entries.descriptionPublished,
      })
      .from(states)
      .innerJoin(entries, eq(entries.versionId, states.publishedVersionId))
      .where(
        and(
          inArray(states.id, ids),
          inArray(entries.codeNorm, chunk),
          isNotNull(entries.descriptionPublished),
        ),
      )
  const [first, ...rest] = chunk(norms, size).map(select)
  if (!first) return
  const found = new Map<string, string>()
  for (const r of (await db.batch([first, ...rest])).flat()) {
    if (r.description === null || r.description.trim() === '') continue
    const key = `${r.stateId}|${comparePatternKey({
      ...r,
      includesChildren: r.includesChildren === 1 ? 1 : r.includesChildren === 0 ? 0 : null,
    })}`
    if (!found.has(key)) found.set(key, r.description)
  }
  for (const row of wanted) {
    const key = comparePatternKey({ ...row, includesChildren: row.wildcard ? 1 : null })
    for (const id of ids) {
      const description = found.get(`${id}|${key}`)
      if (description !== undefined) {
        row.description = description
        row.descriptionSource = id
        break
      }
    }
  }
}

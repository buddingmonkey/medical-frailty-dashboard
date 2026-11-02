import {
  federalCategories,
  type OverviewCell,
  type PublicOverviewResponse,
  publicOverviewResponseSchema,
} from '@mfcd/shared'
import { asc, eq, sql } from 'drizzle-orm'

import type { Db } from './client'
import { states, unifiedCategories } from './schema'

// GET /api/public/overview (roadmap M5 step 4; docs/data-model.md, "Coverage summary"): every
// state against every published unified category. Everything is counted by SQL aggregates over
// the precomputed `entry_unified` and `unified_universe` (src/db/placement.ts); the Worker only
// joins a few hundred numbers, well inside the Free plan's 10 ms of CPU.

/** The published entries and their placements; `e`, `eu` and `s` for the queries below. */
const placed = sql`states s
  JOIN entries e ON e.version_id = s.published_version_id
  JOIN entry_unified eu ON eu.entry_id = e.id`

/** One entry's set of codes, as `comparePatternKey` spells it (F10 with children = F10*). */
const patternKey = sql`e.code_system || '|' || CASE
  WHEN e.match_kind = 'range'
    THEN 'range|' || e.code_norm || '|' || e.range_end_norm || '|'
         || CASE WHEN e.includes_children = 1 THEN '*' ELSE '' END
  WHEN e.match_kind = 'prefix' OR e.includes_children = 1 THEN 'prefix|' || e.code_norm
  ELSE 'exact|' || e.code_norm END`

/**
 * The universe codes each state's placed ICD-10-CM entries cover, by `entryCovers` rules: an
 * exact code covers itself (and its children when `includes_children = 1`), a prefix every code
 * starting with it, a wildcard range every code whose leading characters fall between its ends,
 * any other range the codes of the same length between its ends. Each branch is a primary-key
 * range scan of `unified_universe` ('~' sorts after every letter and digit).
 */
const coveredCodes = sql`
  SELECT s.id AS state_id, eu.unified_id AS unified_id, uu.code_norm AS code
  FROM ${placed}
  JOIN unified_universe uu ON uu.unified_id = eu.unified_id AND uu.code_norm = e.code_norm
  WHERE e.code_system = 'icd10cm' AND e.match_kind = 'exact'
  UNION ALL
  SELECT s.id, eu.unified_id, uu.code_norm
  FROM ${placed}
  JOIN unified_universe uu ON uu.unified_id = eu.unified_id
    AND uu.code_norm > e.code_norm AND uu.code_norm < e.code_norm || '~'
  WHERE e.code_system = 'icd10cm' AND e.match_kind = 'exact' AND e.includes_children = 1
  UNION ALL
  SELECT s.id, eu.unified_id, uu.code_norm
  FROM ${placed}
  JOIN unified_universe uu ON uu.unified_id = eu.unified_id
    AND uu.code_norm >= e.code_norm AND uu.code_norm < e.code_norm || '~'
  WHERE e.code_system = 'icd10cm' AND e.match_kind = 'prefix'
  UNION ALL
  SELECT s.id, eu.unified_id, uu.code_norm
  FROM ${placed}
  JOIN unified_universe uu ON uu.unified_id = eu.unified_id
    AND uu.code_norm >= e.code_norm AND uu.code_norm < e.range_end_norm || '~'
    AND substr(uu.code_norm, 1, length(e.code_norm)) >= e.code_norm
    AND substr(uu.code_norm, 1, length(e.range_end_norm)) <= e.range_end_norm
  WHERE e.code_system = 'icd10cm' AND e.match_kind = 'range' AND e.includes_children = 1
  UNION ALL
  SELECT s.id, eu.unified_id, uu.code_norm
  FROM ${placed}
  JOIN unified_universe uu ON uu.unified_id = eu.unified_id
    AND uu.code_norm >= e.code_norm AND uu.code_norm <= e.range_end_norm
    AND length(uu.code_norm) = length(e.code_norm)
  WHERE e.code_system = 'icd10cm' AND e.match_kind = 'range'
    AND coalesce(e.includes_children, 0) <> 1`

interface PlacedRow {
  state_id: string
  unified_id: number
  n: number
  alone: number
  reviewed: number
  distinct_n: number
}

const keyOf = (stateId: string, unifiedId: number) => `${stateId}|${String(unifiedId)}`

export async function publicOverview(db: Db, dataVersion: number): Promise<PublicOverviewResponse> {
  const [stateRows, categoryRows, universeRows, placedRows, unionRows, coveredRows] =
    await Promise.all([
      db
        .select({
          id: states.id,
          slug: states.slug,
          name: states.name,
          status: states.status,
          publishedVersionId: states.publishedVersionId,
        })
        .from(states)
        .orderBy(asc(states.name)),
      db
        .select({
          id: unifiedCategories.id,
          slug: unifiedCategories.slug,
          label: unifiedCategories.label,
          federalCategory: unifiedCategories.federalCategory,
          sortOrder: unifiedCategories.sortOrder,
        })
        .from(unifiedCategories)
        .where(eq(unifiedCategories.status, 'published'))
        .orderBy(asc(unifiedCategories.sortOrder), asc(unifiedCategories.label)),
      db.all<{ unified_id: number; n: number }>(
        sql`SELECT unified_id, count(*) AS n FROM unified_universe GROUP BY unified_id`,
      ),
      db.all<PlacedRow>(sql`
        SELECT s.id AS state_id, eu.unified_id AS unified_id, count(*) AS n,
               sum(e.qualification = 'standalone') AS alone, min(eu.reviewed) AS reviewed,
               count(DISTINCT ${patternKey}) AS distinct_n
        FROM ${placed}
        GROUP BY s.id, eu.unified_id`),
      db.all<{ unified_id: number; n: number }>(sql`
        SELECT eu.unified_id AS unified_id, count(DISTINCT ${patternKey}) AS n
        FROM ${placed}
        GROUP BY eu.unified_id`),
      db.all<{ state_id: string; unified_id: number; n: number }>(sql`
        SELECT state_id, unified_id, count(DISTINCT code) AS n FROM (${coveredCodes})
        GROUP BY state_id, unified_id`),
    ])

  const universe = new Map(universeRows.map((r) => [r.unified_id, r.n]))
  const union = new Map(unionRows.map((r) => [r.unified_id, r.n]))
  const placedBy = new Map(placedRows.map((r) => [keyOf(r.state_id, r.unified_id), r]))
  const coveredBy = new Map(coveredRows.map((r) => [keyOf(r.state_id, r.unified_id), r.n]))

  const federalOrder = (c: string) =>
    federalCategories.indexOf(c as (typeof federalCategories)[number])
  const categories = categoryRows
    .map((c) => {
      const size = universe.get(c.id) ?? 0
      return {
        ...c,
        coverageBasis: size > 0 ? ('universe' as const) : ('union' as const),
        denominator: size > 0 ? size : (union.get(c.id) ?? 0),
      }
    })
    // Stable: sort order and label from SQL stay within each federal parent.
    .sort((a, b) => federalOrder(a.federalCategory) - federalOrder(b.federalCategory))

  const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null)

  return publicOverviewResponseSchema.parse({
    dataVersion,
    categories,
    states: stateRows.map((s) => {
      const hasList = s.publishedVersionId !== null
      const cells: OverviewCell[] = hasList
        ? categories.map((c) => {
            const key = keyOf(s.id, c.id)
            const p = placedBy.get(key)
            const entries = p?.n ?? 0
            const covered =
              c.coverageBasis === 'universe' ? (coveredBy.get(key) ?? 0) : (p?.distinct_n ?? 0)
            return {
              unifiedId: c.id,
              entries,
              qualifiesAlone: p?.alone ?? 0,
              qualifiesAloneShare: ratio(p?.alone ?? 0, entries),
              covered,
              share: ratio(covered, c.denominator),
              reviewed: entries > 0 && p?.reviewed === 1,
            }
          })
        : []
      return { id: s.id, slug: s.slug, name: s.name, status: s.status, hasList, cells }
    }),
  })
}

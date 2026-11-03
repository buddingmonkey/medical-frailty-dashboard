import type { CodeSystem } from '@mfcd/shared'
import { sql } from 'drizzle-orm'

import type { Db } from './client'
import { rangeCovers } from './public-drill'

// The code pages in the sitemap (roadmap M6 step 5; docs/seo.md, "Sitemap"): every code that at
// least one published state includes, listed or covered, which are exactly the code pages that
// are indexed. The cover rules are the drill-down's (`shared` in public-drill.ts): a wildcard
// covers every code that starts with it, a range uses `rangeCovers`. Covered codes come from
// `ref_codes` (range scans of its primary key), so a range of CPT codes adds only its two ends:
// there is no CPT code set to expand it with (docs/data-model.md, "Licensing of code text").

/**
 * The included codes, as a CTE `codes(sys, norm)`. The distinct wildcards and ranges come first
 * (states repeat each other's), then `CROSS JOIN` keeps them outside the `ref_codes` range
 * scans: left to itself, local D1's planner scanned all of `ref_codes` instead (24 s on the
 * seed; 14 ms in this order).
 */
/** The included-codes CTE as plain SQL (no parameters); exported for the query-plan test. */
export const includedCodesSql = `WITH
  pe AS (
    SELECT e.code_system, e.code_norm, e.match_kind, e.range_end_norm, e.includes_children
    FROM states s JOIN entries e ON e.version_id = s.published_version_id),
  wild AS MATERIALIZED (
    SELECT DISTINCT code_system, code_norm FROM pe
    WHERE match_kind = 'prefix' OR (match_kind = 'exact' AND includes_children = 1)),
  rng AS MATERIALIZED (
    SELECT DISTINCT code_system, code_norm, range_end_norm, includes_children FROM pe
    WHERE match_kind = 'range'),
  codes AS (
    SELECT code_system AS sys, code_norm AS norm FROM pe WHERE match_kind = 'exact'
    UNION
    SELECT code_system, code_norm FROM rng WHERE coalesce(includes_children, 0) = 0
    UNION
    SELECT code_system, range_end_norm FROM rng WHERE coalesce(includes_children, 0) = 0
    UNION
    SELECT r.code_system, r.code_norm FROM wild w
      CROSS JOIN ref_codes r ON r.code_system = w.code_system
        AND r.code_norm >= w.code_norm AND r.code_norm < w.code_norm || '~'
    UNION
    SELECT r.code_system, r.code_norm FROM rng g
      CROSS JOIN ref_codes r ON r.code_system = g.code_system
        AND r.code_norm >= g.code_norm AND r.code_norm < g.range_end_norm || '~'
      WHERE ${rangeCovers('g', 'r.code_norm')})`
const includedCodes = sql.raw(includedCodesSql)

/** How many codes the sitemap lists. */
export async function includedCodeCount(db: Db): Promise<number> {
  const [row] = await db.all<{ n: number }>(sql`${includedCodes} SELECT count(*) AS n FROM codes`)
  return row?.n ?? 0
}

/** One sitemap file's codes, by code system and code. */
export async function includedCodePage(
  db: Db,
  offset: number,
  limit: number,
): Promise<{ sys: CodeSystem; norm: string }[]> {
  return db.all<{ sys: CodeSystem; norm: string }>(sql`${includedCodes}
    SELECT sys, norm FROM codes ORDER BY sys, norm LIMIT ${limit} OFFSET ${offset}`)
}

/**
 * When any state's published list last changed (ISO), or null. A code page can change with any
 * state's list, so this is its `dateModified`, "Last updated" and sitemap `lastmod`.
 */
export async function listsUpdatedAt(db: Db): Promise<string | null> {
  const [row] = await db.all<{ at: string | null }>(sql`SELECT max(v.content_updated_at) AS at
    FROM states s JOIN dataset_versions v ON v.id = s.published_version_id`)
  return row?.at ?? null
}

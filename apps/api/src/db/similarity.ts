import { isNotNull, type SQL, sql } from 'drizzle-orm'

import type { Db } from './client'
import { bumpDataVersion } from './meta'
import { states } from './schema'

// Pair similarity (roadmap M5 step 7; docs/data-model.md, "Pair similarity"): how alike two
// states' published lists are, stored in `state_similarity` so the state pages and the
// comparison read it instead of computing it per request.
//
// A state's set of codes: every billable ICD-10-CM code of the current release (`ref_codes`,
// `valid_to` NULL) that one of its ICD-10-CM entries lists or covers (`entryCovers`), plus its
// other entries, each counted once by `comparePatternKey`. Similarity is the Jaccard index:
// shared / (shared + only_a + only_b).
//
// Everything is SQL. Each entry finds its codes by a primary-key range scan of `ref_codes`: the
// entries are read first (MATERIALIZED, from the published versions only) and CROSS JOIN fixes
// that order, as in the drill-down (src/db/public-drill.ts); left to itself SQLite scanned
// `ref_codes` and looked up every entry of every version per code.

/**
 * States in scope: every pair, the pairs of these states (after their publish or rollback), or
 * the pairs of one state with each state after it (`pairsAfter`: Rebuild coverage does every
 * pair this way, one state per statement, so no statement is heavy).
 */
export type SimilarityScope = { stateIds: readonly string[] } | { pairsAfter: string } | 'all'

export interface SimilarityResult {
  /** Rows written (new or changed) and deleted. */
  written: number
  deleted: number
  /** D1's own count of rows read and written, all statements together. */
  rowsRead: number
  rowsWritten: number
  /** Wall time, D1 included (Date.now() only moves on I/O in a Worker). */
  ms: number
}

/**
 * `sets` (state_id, code) for every state with a list, and `sizes` (state_id, n). `code` is the
 * ICD-10-CM code itself, or the entry's `comparePatternKey` in other systems (which contain a
 * `|`, so they never equal an ICD-10-CM code).
 */
export const similaritySetsCtes = sql.raw(`
  pub AS (SELECT id AS state_id, published_version_id AS vid FROM states
          WHERE published_version_id IS NOT NULL),
  icd AS MATERIALIZED (
    SELECT p.state_id, e.code_norm, e.match_kind, e.range_end_norm,
      coalesce(e.includes_children, 0) AS kids
    FROM pub p JOIN entries e ON e.version_id = p.vid WHERE e.code_system = 'icd10cm'),
  hits AS (
    SELECT i.state_id, r.code_norm AS code FROM icd i CROSS JOIN ref_codes r
    WHERE i.match_kind = 'exact' AND i.kids <> 1
      AND r.code_system = 'icd10cm' AND r.code_norm = i.code_norm
      AND r.billable = 1 AND r.valid_to IS NULL
    UNION ALL
    SELECT i.state_id, r.code_norm FROM icd i CROSS JOIN ref_codes r
    WHERE (i.match_kind = 'prefix' OR (i.match_kind = 'exact' AND i.kids = 1))
      AND r.code_system = 'icd10cm' AND r.code_norm >= i.code_norm AND r.code_norm < i.code_norm || '~'
      AND r.billable = 1 AND r.valid_to IS NULL
    UNION ALL
    SELECT i.state_id, r.code_norm FROM icd i CROSS JOIN ref_codes r
    WHERE i.match_kind = 'range' AND i.kids = 1
      AND r.code_system = 'icd10cm' AND r.code_norm >= i.code_norm
      AND r.code_norm < i.range_end_norm || '~'
      AND substr(r.code_norm, 1, length(i.code_norm)) >= i.code_norm
      AND substr(r.code_norm, 1, length(i.range_end_norm)) <= i.range_end_norm
      AND r.billable = 1 AND r.valid_to IS NULL
    UNION ALL
    SELECT i.state_id, r.code_norm FROM icd i CROSS JOIN ref_codes r
    WHERE i.match_kind = 'range' AND i.kids <> 1
      AND r.code_system = 'icd10cm' AND r.code_norm >= i.code_norm AND r.code_norm <= i.range_end_norm
      AND length(r.code_norm) = length(i.code_norm)
      AND r.billable = 1 AND r.valid_to IS NULL),
  others AS (
    SELECT p.state_id, e.code_system || '|' || CASE
        WHEN e.match_kind = 'range'
          THEN 'range|' || e.code_norm || '|' || e.range_end_norm || '|'
               || CASE WHEN e.includes_children = 1 THEN '*' ELSE '' END
        WHEN e.match_kind = 'prefix' OR e.includes_children = 1 THEN 'prefix|' || e.code_norm
        ELSE 'exact|' || e.code_norm END AS code
    FROM pub p JOIN entries e ON e.version_id = p.vid WHERE e.code_system <> 'icd10cm'),
  sets AS MATERIALIZED (SELECT state_id, code FROM hits UNION SELECT state_id, code FROM others),
  sizes AS MATERIALIZED (SELECT state_id, count(*) AS n FROM sets GROUP BY state_id)`)

/**
 * The pairs to compute: `x` and `o` are states with a list, each unordered pair once; with a
 * scope, only pairs with a state in it.
 */
function pairFilter(scope: SimilarityScope): SQL {
  if (scope === 'all') return sql`o.state_id > x.state_id`
  if ('pairsAfter' in scope)
    return sql`x.state_id = ${scope.pairsAfter} AND o.state_id > x.state_id`
  const ids = sql`(SELECT value FROM json_each(${JSON.stringify(scope.stateIds)}))`
  return sql`x.state_id IN ${ids} AND o.state_id <> x.state_id
    AND (o.state_id NOT IN ${ids} OR o.state_id > x.state_id)`
}

/**
 * The upsert: every pair in scope with its counts, written only when they changed. Exported for
 * the migration test (migrations/0010_state_similarity.sql fills the table with the same
 * statement for every pair).
 */
export function similarityUpsert(scope: SimilarityScope): SQL {
  const filter = pairFilter(scope)
  return sql`WITH ${similaritySetsCtes},
  common AS (
    SELECT x.state_id AS x, o.state_id AS o, count(*) AS n
    FROM sets x CROSS JOIN sets o
    WHERE o.code = x.code AND ${filter}
    GROUP BY x.state_id, o.state_id),
  pairs AS (
    SELECT x.state_id AS x, o.state_id AS o, x.n AS n_x, o.n AS n_o, coalesce(c.n, 0) AS shared
    FROM sizes x CROSS JOIN sizes o
    LEFT JOIN common c ON c.x = x.state_id AND c.o = o.state_id
    WHERE ${filter})
  INSERT INTO state_similarity (state_a, state_b, shared, only_a, only_b, jaccard, computed_at)
  SELECT min(x, o), max(x, o), shared,
    CASE WHEN x < o THEN n_x ELSE n_o END - shared,
    CASE WHEN x < o THEN n_o ELSE n_x END - shared,
    CASE WHEN n_x + n_o - shared = 0 THEN 0.0 ELSE CAST(shared AS REAL) / (n_x + n_o - shared) END,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM pairs WHERE true
  ON CONFLICT (state_a, state_b) DO UPDATE SET
    shared = excluded.shared, only_a = excluded.only_a, only_b = excluded.only_b,
    jaccard = excluded.jaccard, computed_at = excluded.computed_at
  WHERE shared <> excluded.shared OR only_a <> excluded.only_a OR only_b <> excluded.only_b`
}

/** Pairs where a state has no list (any more). */
const deleteStale = sql`DELETE FROM state_similarity
  WHERE state_a NOT IN (SELECT id FROM states WHERE published_version_id IS NOT NULL)
     OR state_b NOT IN (SELECT id FROM states WHERE published_version_id IS NOT NULL)`

/**
 * Recomputes the pairs in scope and writes only what changed, with a `data_version` bump when
 * anything did (a page cached since the publish batch is never read again). Call it right after
 * `recomputePlacements` on publish and rollback.
 *
 * 'all' runs one statement per state (its pairs with each state after it), never one for every
 * pair: with 44 states on preview that one statement read 3.5M rows in 3 s, and it grows with
 * the square of the states. A failure part way leaves the earlier states written; calling it
 * again finishes the job.
 */
export async function recomputeSimilarity(
  db: Db,
  scope: SimilarityScope,
): Promise<SimilarityResult> {
  const started = Date.now()
  const parts: SimilarityScope[] =
    scope === 'all'
      ? (
          await db
            .select({ id: states.id })
            .from(states)
            .where(isNotNull(states.publishedVersionId))
            .orderBy(states.id)
        ).map((s) => ({ pairsAfter: s.id }))
      : [scope]
  // Separate statements, each atomic (drizzle's D1 batch does not take raw SQL runs).
  const deleted = await db.run(deleteStale)
  const totals = {
    written: 0,
    rowsRead: deleted.meta.rows_read,
    rowsWritten: deleted.meta.rows_written,
  }
  for (const part of parts) {
    const upserted = await db.run(similarityUpsert(part))
    totals.written += upserted.meta.changes
    totals.rowsRead += upserted.meta.rows_read
    totals.rowsWritten += upserted.meta.rows_written
  }
  if (deleted.meta.changes + totals.written > 0) await bumpDataVersion(db)
  const result: SimilarityResult = {
    ...totals,
    deleted: deleted.meta.changes,
    ms: Date.now() - started,
  }
  // Counts only: no codes.
  console.log(
    JSON.stringify({
      event: 'similarity.recompute',
      scope: scope === 'all' || 'pairsAfter' in scope ? scope : scope.stateIds,
      ...result,
    }),
  )
  return result
}

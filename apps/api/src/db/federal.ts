import { sql } from 'drizzle-orm'

import { entries } from './schema'

// An entry's federal categories (docs/data-model.md, "Federal categories"; `federalCategoriesOf`
// in packages/shared): first the ones the state published for it (`stateFederalSql`, a column
// of the entry), else the federal parents of the published unified categories in
// `entry_unified`, then (rules 3 to 7) the chapter override, a suggestion by code
// (`suggestionSql`) or the state category's mapping. Public routes read the parents and the
// suggestion per entry with the correlated subqueries below (a primary-key seek each), never by
// placing entries per request. Use them in a query whose FROM or JOIN has `entries` unaliased,
// and pass them all to `federalCategoriesOf` (with the state's manual mapping keys).

/**
 * Rule 1: the state's own federal categories (comma-separated, `decodeStateFederal` reads it);
 * null: none. When set they win over the placements, and count as confirmed (stated by the
 * state).
 */
export const stateFederalSql = sql<string | null>`${entries.stateFederalCategories}`

const placed = sql`FROM entry_unified eu JOIN unified_categories uc ON uc.id = eu.unified_id WHERE eu.entry_id = ${entries.id} AND uc.status = 'published'`

/** The parents, comma-separated in no set order (`federalCategoryList` reads it); null: none. */
export const unifiedParentsSql = sql<
  string | null
>`(SELECT group_concat(DISTINCT uc.federal_category) ${placed})`

/** 1 when every placement is reviewed, 0 when one is not, null when there is none. */
export const placementsReviewedSql = sql<number | null>`(SELECT min(eu.reviewed) ${placed})`

/**
 * Rules 4 and 6: the entry's suggestion by code (`entry_federal_suggestions`), packed as
 * `category|reviewed|reference state name` per row, joined by ";" (`decodeSuggestion` reads it);
 * null: none. One primary-key range seek per entry, plus the reference state's name.
 *
 * The entry's id sits in a nested fragment, like `placed`: drizzle writes a column directly in
 * a selected field without its table in a one-table query, and a bare "id" would then resolve
 * inside the subquery (found by a test, 2026-11-13).
 */
const suggestionOf = sql`FROM entry_federal_suggestions s WHERE s.entry_id = ${entries.id}`
export const suggestionSql = sql<
  string | null
>`(SELECT group_concat(s.federal_category || '|' || s.reviewed || '|' || (SELECT rs.name FROM states rs WHERE rs.id = s.reference_state_id), ';') ${suggestionOf})`

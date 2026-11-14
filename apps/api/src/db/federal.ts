import { sql } from 'drizzle-orm'

import { entries } from './schema'

// An entry's federal categories (docs/data-model.md, "Federal categories"; `federalCategoriesOf`
// in packages/shared): first the ones the state published for it (`stateFederalSql`, a column
// of the entry), else the federal parents of the published unified categories in
// `entry_unified`. Public routes read the parents per entry with the two correlated subqueries
// below (a primary-key seek each), never by placing entries per request. Use them in a query
// whose FROM or JOIN has `entries` unaliased, and pass all three to `federalCategoriesOf`.

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

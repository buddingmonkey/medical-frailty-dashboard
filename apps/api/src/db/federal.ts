import { sql } from 'drizzle-orm'

import { entries } from './schema'

// An entry's federal categories come from its placements (docs/data-model.md, "Federal
// categories"; `federalCategoriesOf` in packages/shared): the federal parents of the published
// unified categories in `entry_unified`. Public routes read them per entry with these two
// correlated subqueries (a primary-key seek each), never by placing entries per request. Use
// them in a query whose FROM or JOIN has `entries` unaliased.

const placed = sql`FROM entry_unified eu JOIN unified_categories uc ON uc.id = eu.unified_id WHERE eu.entry_id = ${entries.id} AND uc.status = 'published'`

/** The parents, comma-separated in no set order (`federalCategoryList` reads it); null: none. */
export const unifiedParentsSql = sql<
  string | null
>`(SELECT group_concat(DISTINCT uc.federal_category) ${placed})`

/** 1 when every placement is reviewed, 0 when one is not, null when there is none. */
export const placementsReviewedSql = sql<number | null>`(SELECT min(eu.reviewed) ${placed})`

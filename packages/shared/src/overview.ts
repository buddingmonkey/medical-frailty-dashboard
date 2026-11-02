import { z } from 'zod'

import { federalCategories, stateStatusSchema } from './enums'
import { unifiedSlugSchema } from './unified'

// Body of `GET /api/public/overview` (roadmap M5 step 4; docs/data-model.md, "Coverage
// summary"): every state against every published unified category. The Worker reads
// precomputed placements (`entry_unified`) and universes (`unified_universe`) with SQL
// aggregates; nothing is placed per request.

const count = z.number().int().min(0)
/** A share from 0 to 1; null when there is nothing to divide by. */
const share = z.number().min(0).max(1).nullable()

/**
 * How a category's coverage is measured:
 * - `universe`: the category has a full ICD-10-CM code list (its CCSR groups' billable codes);
 *   a state's share is the universe codes its placed entries cover.
 * - `union`: no full list (no CCSR groups, or other code systems only); a state's share is its
 *   distinct placed entries over every state's distinct placed entries in the category.
 */
export const overviewCoverageBasisSchema = z.enum(['universe', 'union'])
export type OverviewCoverageBasis = z.infer<typeof overviewCoverageBasisSchema>

export const overviewCategorySchema = z.object({
  id: z.number().int().positive(),
  slug: unifiedSlugSchema,
  label: z.string().min(1),
  /** The federal parent the overview groups by. */
  federalCategory: z.enum(federalCategories).exclude(['unmapped']),
  sortOrder: z.number().int().min(0),
  coverageBasis: overviewCoverageBasisSchema,
  /** The universe's size, or the union of every state's distinct entries in the category. */
  denominator: count,
})
export type OverviewCategory = z.infer<typeof overviewCategorySchema>

/** One state in one unified category. */
export const overviewCellSchema = z.object({
  unifiedId: z.number().int().positive(),
  /** The state's published entries placed in the category (a code, wildcard or range each). */
  entries: count,
  /** Of those, the entries that qualify on their own (`standalone`). */
  qualifiesAlone: count,
  /** `qualifiesAlone / entries`; null when the state has no entries in the category. */
  qualifiesAloneShare: share,
  /** Universe codes the entries cover, or (union basis) the state's distinct entries. */
  covered: count,
  /** `covered / denominator`; null when the denominator is 0. */
  share,
  /** Every placement was reviewed by an admin; false when there are no entries. */
  reviewed: z.boolean(),
})
export type OverviewCell = z.infer<typeof overviewCellSchema>

export const overviewStateSchema = z.object({
  id: z.string().regex(/^[A-Z]{2}$/),
  slug: z.string().regex(/^[a-z]{2}$/),
  name: z.string().min(1),
  status: stateStatusSchema,
  /** The state has a published list here. */
  hasList: z.boolean(),
  /** One per category, in `categories` order; empty when the state has no list. */
  cells: z.array(overviewCellSchema),
})
export type OverviewState = z.infer<typeof overviewStateSchema>

export const publicOverviewResponseSchema = z.object({
  dataVersion: count,
  /** Published unified categories by federal parent, sort order and label. */
  categories: z.array(overviewCategorySchema),
  /** The 50 states and DC, by name. */
  states: z.array(overviewStateSchema),
})
export type PublicOverviewResponse = z.infer<typeof publicOverviewResponseSchema>

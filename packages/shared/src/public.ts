import { z } from 'zod'

import {
  type CodeSystem,
  codeSystems,
  type FederalCategory,
  federalCategories,
  type Qualification,
  qualifications,
  stateStatusSchema,
} from './enums'

// Public, read-only API bodies (docs/architecture.md, "API shape"). Counts are entries of the
// published version: one entry may be a single code, a wildcard or a range.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** A count for every value of an enum, zeros included, so the browser never guesses keys. */
function countsOf<const T extends readonly [string, ...string[]]>(values: T) {
  return z.object(
    Object.fromEntries(values.map((v) => [v, z.number().int().min(0)])) as Record<
      T[number],
      z.ZodNumber
    >,
  )
}

export function zeroCounts<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((v) => [v, 0])) as Record<T, number>
}

export const publicStateSummarySchema = z.object({
  /** Two-letter postal code. */
  id: z.string().regex(/^[A-Z]{2}$/),
  /** Lowercase postal code, the page URL (`/states/ga`). */
  slug: z.string().regex(/^[a-z]{2}$/),
  name: z.string().min(1),
  fips: z.string().regex(/^\d{2}$/),
  status: stateStatusSchema,
  /** Null until the state's first list is published here. */
  published: z
    .object({
      versionNo: z.number().int().min(1),
      /** When the state published the list: the version's date, else its newest source's. */
      sourceDate: isoDate.nullable(),
      /** When we last changed the public data (publish or category mapping). */
      updatedAt: z.string().nullable(),
      totalEntries: z.number().int().min(0),
      bySystem: countsOf(codeSystems),
      byFederalCategory: countsOf(federalCategories),
      byQualification: countsOf(qualifications),
      /** Every state category's federal category was confirmed by an admin. */
      mappingsConfirmed: z.boolean(),
    })
    .nullable(),
})
export type PublicStateSummary = z.infer<typeof publicStateSummarySchema>

/** Body of `GET /api/public/states`: the 50 states and DC, by name. */
export const publicStatesResponseSchema = z.object({
  dataVersion: z.number().int().min(0),
  items: z.array(publicStateSummarySchema),
})
export type PublicStatesResponse = z.infer<typeof publicStatesResponseSchema>

export type SystemCounts = Record<CodeSystem, number>
export type FederalCategoryCounts = Record<FederalCategory, number>
export type QualificationCounts = Record<Qualification, number>

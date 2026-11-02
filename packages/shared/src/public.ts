import { z } from 'zod'

import {
  type CodeSystem,
  codeSystems,
  type FederalCategory,
  federalCategories,
  federalCategorySchema,
  type Qualification,
  qualifications,
  stateStatusSchema,
  versionStatusSchema,
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

/** One of a state's own categories and the federal category its entries count under. */
export const publicStateCategorySchema = z.object({
  stateCategory: z.string(),
  stateSubcategory: z.string(),
  federalCategory: federalCategorySchema,
  /** An admin confirmed it (a manual mapping or a chapter override); else a keyword guess. */
  confirmed: z.boolean(),
  entries: z.number().int().min(0),
})
export type PublicStateCategory = z.infer<typeof publicStateCategorySchema>

/** Body of `GET /api/public/states/:slug`. */
export const publicStateDetailResponseSchema = z.object({
  dataVersion: z.number().int().min(0),
  state: publicStateSummarySchema,
  /** Our notes on the state (Markdown, shown as text), or null. */
  notesMd: z.string().nullable(),
  /** The documents the published list was read from. */
  sources: z.array(
    z.object({
      title: z.string(),
      /** The state's public link; null when unknown. */
      url: z.url({ protocol: /^https?$/ }).nullable(),
      publisherDate: isoDate.nullable(),
      retrievedAt: z.string(),
      fileType: z.string(),
    }),
  ),
  /** Published and earlier published versions, newest first. Drafts never show. */
  versions: z.array(
    z.object({
      versionNo: z.number().int().min(1),
      status: versionStatusSchema.extract(['published', 'superseded']),
      publishedAt: z.string().nullable(),
      statePublishedDate: isoDate.nullable(),
      rowCount: z.number().int().min(0),
    }),
  ),
  categories: z.array(publicStateCategorySchema),
})
export type PublicStateDetail = z.infer<typeof publicStateDetailResponseSchema>

export type SystemCounts = Record<CodeSystem, number>
export type FederalCategoryCounts = Record<FederalCategory, number>
export type QualificationCounts = Record<Qualification, number>

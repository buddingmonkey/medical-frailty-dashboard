import { z } from 'zod'

import {
  type CodeSystem,
  codeSystems,
  type FederalCategory,
  federalCategories,
  federalCategorySchema,
  type Qualification,
  qualifications,
  type StateStatus,
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

// Wording and formatting shared by the Vue pages and the Worker's server-rendered HTML
// (docs/seo.md: both must show the same facts).

export const SITE_NAME = 'Medical Frailty Coding Dashboard'

/** The site covers the 50 states and DC (project lead, 2026-11-01). */
export const STATES_AND_DC = 51

/** Status words for people, not the database: "published" means published on this site. */
export const stateStatusLabels: Record<StateStatus, string> = {
  published: 'List on this site',
  announced: 'List announced, not on this site yet',
  none: 'No list yet',
}

export const formatCount = (n: number): string => n.toLocaleString('en-US')

/** `2026-09-15` → "September 15, 2026", read as a calendar date (no time zone shift). */
export function formatDay(day: string): string {
  return new Date(`${day.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** Page titles, the same in the browser tab and the server-rendered HTML. */
export const pageTitles = {
  home: `${SITE_NAME}: compare state Medicaid frailty code lists`,
  state: (name: string) => `${name} medical frailty codes | ${SITE_NAME}`,
  notFound: `State not found | ${SITE_NAME}`,
  compare: `Compare states by category | ${SITE_NAME}`,
  states: `All states | ${SITE_NAME}`,
}

/**
 * The main navigation, in order, for the Vue header and the server-rendered HTML. Add a page
 * here when it exists (Search in M5, About in M7), never before: a link must not 404.
 * `section` marks the link current on deeper pages too (`/states/ga` is under States).
 */
export const siteNav = [
  { label: 'Home', path: '/', section: false },
  { label: 'States', path: '/states', section: true },
  { label: 'Compare', path: '/compare', section: true },
] as const

/** The nav entry a path belongs to, or null. */
export function siteNavCurrent(path: string): (typeof siteNav)[number] | null {
  return (
    siteNav.find((item) =>
      item.section ? path === item.path || path.startsWith(`${item.path}/`) : path === item.path,
    ) ?? null
  )
}

/** A state's own category for people: `Cancer › Solid`, or "(no category)". */
export function stateCategoryName(category: string, subcategory: string): string {
  if (category === '' && subcategory === '') return '(no category)'
  return subcategory === '' ? category : `${category} › ${subcategory}`
}

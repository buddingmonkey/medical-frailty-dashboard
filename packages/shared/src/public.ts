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
      /** An entry counts once under each of its federal categories: the sum can exceed the total. */
      byFederalCategory: countsOf(federalCategories),
      byQualification: countsOf(qualifications),
      /**
       * Every entry's federal category was confirmed by an admin: each placement in a unified
       * category reviewed, or, for an entry placed nowhere, a manual mapping or chapter override.
       */
      mappingsConfirmed: z.boolean(),
    })
    .nullable(),
})
export type PublicStateSummary = z.infer<typeof publicStateSummarySchema>

/** The words above a state's category table, in the Vue page and the server-rendered HTML. */
export const stateCategoriesIntro = (stateName: string): string =>
  `How ${stateName}’s own categories line up with the five federal categories in the law. ` +
  'This site gives each entry the federal category of the comparison category its code falls ' +
  'in; a code in no comparison category takes the federal category mapped to the state’s own ' +
  'category. “Not yet reviewed” means this site suggested the mapping automatically and nobody ' +
  'has checked it yet.'

/** A state category row's review status (the "Review status" column). */
export const reviewStatusText = (confirmed: boolean): string =>
  confirmed ? 'Reviewed' : 'Not yet reviewed (automatic suggestion)'

/** On the home card when some of a state's mappings are not reviewed. */
export const MAPPINGS_NOT_REVIEWED_NOTE =
  'This site has not yet reviewed how all of this state’s categories fit the federal ones, so ' +
  'some of the federal counts above come from automatic suggestions.'

/** In the home map's card cell when no state is active (no hover or focus yet, and no list). */
export const MAP_CARD_PLACEHOLDER = 'Point at a state on the map, or tab to it, to see its list.'

/** What an entry is: under the state counts on the home, states and state pages. */
export const ENTRY_DEFINITION =
  'An entry is one line of a state’s list: a single code, or a group of codes written with a ' +
  'wildcard or a range.'

/** Under the federal counts when an entry counts under more than one federal category. */
export const FEDERAL_OVERLAP_NOTE =
  'A code can count under more than one federal category, so these numbers can add up to more ' +
  'than the number of entries.'

/** The federal counts add up to more than the entries (a code under two federal categories). */
export function federalCountsOverlap(p: {
  totalEntries: number
  byFederalCategory: Record<string, number>
}): boolean {
  return Object.values(p.byFederalCategory).reduce((sum, n) => sum + n, 0) > p.totalEntries
}

/** Body of `GET /api/public/states`: the 50 states and DC, by name. */
export const publicStatesResponseSchema = z.object({
  dataVersion: z.number().int().min(0),
  items: z.array(publicStateSummarySchema),
})
export type PublicStatesResponse = z.infer<typeof publicStatesResponseSchema>

/**
 * One of a state's own categories and a federal category its entries count under: one row per
 * federal category, so a category whose codes sit under two federal categories has two rows.
 */
export const publicStateCategorySchema = z.object({
  stateCategory: z.string(),
  stateSubcategory: z.string(),
  federalCategory: federalCategorySchema,
  /**
   * An admin confirmed it: every placement reviewed, or, for entries placed nowhere, a manual
   * mapping or a chapter override. Else a guess (CCSR group or keyword).
   */
  confirmed: z.boolean(),
  entries: z.number().int().min(0),
})
export type PublicStateCategory = z.infer<typeof publicStateCategorySchema>

/** A state whose list is like this one's (roadmap M5 step 7; `state_similarity`). */
export const similarStateSchema = z.object({
  id: z.string().regex(/^[A-Z]{2}$/),
  slug: z.string().regex(/^[a-z]{2}$/),
  name: z.string(),
  /** Jaccard index, 0–1, over both states' codes (docs/data-model.md, "Pair similarity"). */
  jaccard: z.number().min(0).max(1),
  shared: z.number().int().min(0),
  /** Codes only this page's state lists or covers, and only the other state. */
  onlyThis: z.number().int().min(0),
  onlyOther: z.number().int().min(0),
})
export type SimilarState = z.infer<typeof similarStateSchema>

/** How many similar states a state page lists. */
export const SIMILAR_STATES_SHOWN = 10

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
  /** The states with the most similar lists, most similar first; empty without a list. */
  similar: z.array(similarStateSchema).max(SIMILAR_STATES_SHOWN),
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

/** `4 of the 50 states and DC have a list on this site.` */
export const statesWithListText = (n: number): string =>
  `${formatCount(n)} of the 50 states and DC have a list on this site.`

/** The home page's introduction, in the Vue page and the server-rendered HTML. */
export const HOME_INTRO =
  'Under H.R.1 (Pub. L. 119-21), Medicaid members who are medically frail are excluded from the ' +
  'new community engagement (work) requirements. States are publishing lists of the diagnosis ' +
  'and service codes they use to identify medically frail members. This site puts those lists ' +
  'side by side so you can compare them. It does not decide anyone’s eligibility.'

/** The footer of every page, in the Vue app and the server-rendered HTML. */
export const FOOTER_TEXT =
  'Every code comes from a state’s own published documents, linked on each state’s page. This ' +
  'site is not a state or federal source and does not determine anyone’s eligibility; check ' +
  'the state’s document before relying on a code. No patient data.'

/** The state pages' status line for a state without a list on this site. */
export function noListText(stateName: string, announced: boolean): string {
  return announced
    ? `${stateName} has announced a medical frailty code list; this site has not added it yet.`
    : `This site knows of no published medical frailty code list for ${stateName}.`
}

/** The captions of the state page's count tables. */
export const STATE_COUNT_CAPTIONS = {
  system: 'Entries by code system',
  federal: 'Entries by federal category',
  rule: 'Entries by the state’s rule on whether a code is enough by itself',
} as const

/** The state category table's last two headings and the link in each row. */
export const REVIEW_STATUS_HEADING = 'Review status'
export const COMPARE_THESE_CODES = 'Compare these codes'

/** The date a state put on its list, for the tables and cards. */
export const SOURCE_DATE_HEADING = 'Date on the state’s document'
export const NO_SOURCE_DATE = 'No date on the document'
/** When the list was added to (or last changed on) this site. */
export const ADDED_HEADING = 'Added to this site'

/** The source list's line: `PDF · state's date … · retrieved by this site …`. */
export function sourceDetailsText(s: {
  fileType: string
  publisherDate: string | null
  retrievedAt: string
}): string {
  return [
    s.fileType.toUpperCase(),
    s.publisherDate ? `state’s date ${formatDay(s.publisherDate)}` : null,
    `retrieved by this site ${formatDay(s.retrievedAt)}`,
  ]
    .filter((part) => part !== null)
    .join(' · ')
}

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
  home: `${SITE_NAME}: compare state Medicaid medical frailty code lists`,
  state: (name: string) => `${name} medical frailty codes | ${SITE_NAME}`,
  notFound: `State not found | ${SITE_NAME}`,
  compare: `Compare single codes | ${SITE_NAME}`,
  overview: `How much of each category each state lists | ${SITE_NAME}`,
  categories: `Comparison categories | ${SITE_NAME}`,
  map: `One category, every state | ${SITE_NAME}`,
  statesLanding: `States side by side | ${SITE_NAME}`,
  drillDown: (label: string) => `${label} codes by state | ${SITE_NAME}`,
  categoryNotFound: `Category not found | ${SITE_NAME}`,
  statesCompare: (names: string) => `${names} medical frailty codes | ${SITE_NAME}`,
  statesCompareNotFound: `Comparison not found | ${SITE_NAME}`,
  states: `All states | ${SITE_NAME}`,
}

/**
 * The main navigation, in order, for the Vue header and the server-rendered HTML. Add a page
 * here when it exists (Search in M6, About in M8), never before: a link must not 404.
 * `section` marks the link current on deeper pages too (`/states/ga` is under States).
 */
export const siteNav = [
  { label: 'Home', path: '/', section: false },
  { label: 'States', path: '/states', section: true },
  { label: 'Compare', path: '/compare', section: true },
  { label: 'Search', path: '/search', section: false },
  { label: 'About', path: '/about', section: false },
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

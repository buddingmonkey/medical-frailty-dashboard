import { z } from 'zod'

import { drillCellSchema, type DrillCell } from './drill'
import { codeSystemSchema, matchKindSchema, type Qualification } from './enums'
import { formatCount, pageTitles } from './public'

// Compare 2–4 states (roadmap M5 step 7; docs/data-model.md, "Compare states"). The page is
// `/compare/states/<st>-vs-<st>[-vs-<st>…]`: only the codes where the chosen states differ,
// grouped by published unified category. The Worker counts in D1; these are the URL, the
// "differs" rule and the words, shared by the Vue page, the server-rendered HTML and the CSV.

export const STATES_COMPARE_MIN = 2
export const STATES_COMPARE_MAX = 4

/** A page holds the groups (or the 250-row parts of a larger group) that start within this many rows. */
export const STATES_COMPARE_PAGE_ROWS = 250

const pairPattern = /^[a-z]{2}(-vs-[a-z]{2}){1,3}$/

/** `ga-vs-la` → `['GA', 'LA']`, in column order; null unless 2–4 different lowercase codes. */
export function parseStatesPair(pair: string): string[] | null {
  if (!pairPattern.test(pair)) return null
  const ids = pair.split('-vs-').map((s) => s.toUpperCase())
  return new Set(ids).size === ids.length ? ids : null
}

/** The page's view options. Lenient: what cannot be read falls back to its default. */
export interface StatesCompareQuery {
  /** "Show only differences" (default on; `diff=0` shows every code). */
  diff: boolean
  page: number
}

const first = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value)

export const statesCompareQuerySchema = z.object({
  diff: z
    .preprocess(first, z.enum(['0', '1']).optional())
    .transform((v) => v !== '0')
    .catch(true),
  page: z.preprocess(first, z.coerce.number().int().min(1).max(100_000).default(1)).catch(1),
})

/** Reads the options from Hono's or Vue Router's query object. */
export function statesCompareQueryFromRecord(
  query: Readonly<Record<string, unknown>>,
): StatesCompareQuery {
  return statesCompareQuerySchema.parse(query)
}

/** The options as URL parameters, defaults left out, so a link is short and stable. */
export function statesCompareSearchParams(q: StatesCompareQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (!q.diff) params.set('diff', '0')
  if (q.page > 1) params.set('page', String(q.page))
  return params
}

/** `/compare/states/ga-vs-la`, with the options that are not the default. */
export function statesComparePath(
  stateIds: readonly string[],
  q: Partial<StatesCompareQuery> = {},
): string {
  const path = `/compare/states/${stateIds.map((id) => id.toLowerCase()).join('-vs-')}`
  const search = statesCompareSearchParams({ diff: q.diff ?? true, page: q.page ?? 1 }).toString()
  return search === '' ? path : `${path}?${search}`
}

/** Every code of the comparison, differing or not, as CSV. */
export const statesCompareCsvPath = (stateIds: readonly string[]): string =>
  `${statesComparePath(stateIds)}/codes.csv`

/** The API query string: `states=GA,LA&diff=0&page=2`. */
export function statesCompareApiPath(stateIds: readonly string[], q: StatesCompareQuery): string {
  const params = new URLSearchParams({ states: stateIds.join(',') })
  for (const [key, value] of statesCompareSearchParams(q)) params.set(key, value)
  return `/api/public/states-compare?${params.toString()}`
}

/** `states=GA,LA` from the API's query: 2–4 different postal codes, or null. */
export function statesFromApiQuery(value: string | undefined): string[] | null {
  if (value === undefined) return null
  const ids = value.split(',').map((s) => s.trim().toUpperCase())
  if (ids.length < STATES_COMPARE_MIN || ids.length > STATES_COMPARE_MAX) return null
  if (!ids.every((id) => /^[A-Z]{2}$/.test(id))) return null
  return new Set(ids).size === ids.length ? ids : null
}

// ---------------------------------------------------------------------------------------------
// The rule

/**
 * A row differs when the chosen states disagree on listed-or-covered (a narrower code is not
 * listed), or when all of them list or cover it under different rules (the qualification of
 * the entry each state's cell shows). The SQL in apps/api/src/db/public-states-compare.ts says
 * the same.
 */
export function statesCompareDiffers(
  cells: readonly {
    status: DrillCell['status']
    match: { qualification: Qualification } | null
  }[],
): boolean {
  const listed = cells.filter((c) => c.status === 'exact' || c.status === 'covered')
  if (listed.length !== cells.length) return listed.length > 0
  return new Set(listed.map((c) => c.match?.qualification)).size > 1
}

// ---------------------------------------------------------------------------------------------
// Response: `GET /api/public/states-compare?states=GA,LA&diff=0&page=`

const count = z.number().int().min(0)
const stateIdSchema = z.string().regex(/^[A-Z]{2}$/)

export const statesCompareStateSchema = z.object({
  id: stateIdSchema,
  slug: z.string().regex(/^[a-z]{2}$/),
  name: z.string(),
  hasList: z.boolean(),
})
export type StatesCompareState = z.infer<typeof statesCompareStateSchema>

export const statesCompareRowSchema = z.object({
  /** `comparePatternKey`. */
  key: z.string(),
  codeSystem: codeSystemSchema,
  codeNorm: z.string(),
  matchKind: matchKindSchema,
  rangeEndNorm: z.string().nullable(),
  wildcard: z.boolean(),
  display: z.string(),
  codePath: z.string().nullable(),
  description: z.string().nullable(),
  /** `cms`, a chosen state's postal code (its own text), or null. */
  descriptionSource: z.string().nullable(),
  differs: z.boolean(),
  /** One cell per chosen state, in column order. */
  cells: z.array(drillCellSchema),
})
export type StatesCompareRow = z.infer<typeof statesCompareRowSchema>

export const statesCompareGroupSchema = z.object({
  /** The unified category's slug, or `none` for codes in no published unified category. */
  key: z.string(),
  /** The category's page (`/compare/<slug>`); null for `none`. */
  slug: z.string().nullable(),
  label: z.string(),
  /** Per chosen state: the group's codes it lists or covers, whatever the filter. */
  counts: z.array(count),
  /** The group's codes, whatever the filter, and how many of them differ. */
  allRows: count,
  differing: count,
  /** The group's codes the filter keeps, on every page. */
  rowCount: count,
  /** The group started on an earlier page (a group over a page long is split). */
  continued: z.boolean(),
  rows: z.array(statesCompareRowSchema),
})
export type StatesCompareGroup = z.infer<typeof statesCompareGroupSchema>

export const statesCompareSimilaritySchema = z.object({
  /** Jaccard index, 0–1 (docs/data-model.md, "Pair similarity"). */
  jaccard: z.number().min(0).max(1),
  shared: count,
  /** Codes only the first (second) chosen state lists or covers, in column order. */
  onlyFirst: count,
  onlySecond: count,
})
export type StatesCompareSimilarity = z.infer<typeof statesCompareSimilaritySchema>

export const statesCompareSummarySchema = z.object({
  /** Per chosen state: codes only it lists or covers, among the chosen states. */
  only: z.array(count),
  /** Codes every chosen state lists or covers. */
  all: count,
  /** Every code of the comparison, and how many of them differ. */
  rows: count,
  differing: count,
  /** Exactly two states: their pair similarity; null for three or four, or not computed yet. */
  similarity: statesCompareSimilaritySchema.nullable(),
})
export type StatesCompareSummary = z.infer<typeof statesCompareSummarySchema>

/** Body of `GET /api/public/states-compare`. */
export const statesCompareResponseSchema = z.object({
  dataVersion: count,
  /** The chosen states, in column order. */
  states: z.array(statesCompareStateSchema),
  /** Every state with a list, by name: the pickers. */
  choices: z.array(statesCompareStateSchema.omit({ hasList: true })),
  query: z.object({ diff: z.boolean() }),
  /** Null when a chosen state has no list (nothing is compared). */
  summary: statesCompareSummarySchema.nullable(),
  /** Codes the filter keeps (a code in two groups counts once), and the groups they are in. */
  totalRows: count,
  totalGroups: count,
  page: z.number().int().min(1),
  pageCount: z.number().int().min(1),
  groups: z.array(statesCompareGroupSchema),
})
export type StatesCompareResponse = z.infer<typeof statesCompareResponseSchema>

// ---------------------------------------------------------------------------------------------
// Words

export const STATES_COMPARE_NONE_LABEL = 'Not in a unified category'

/** `Georgia vs Louisiana vs Montana`. */
export const statesCompareNames = (names: readonly string[]): string => names.join(' vs ')

export const statesCompareTitle = (names: readonly string[]): string =>
  pageTitles.statesCompare(statesCompareNames(names))

/** A Jaccard index with two decimals: `0.61`. */
export const similarityText = (jaccard: number): string => jaccard.toFixed(2)

/** What the similarity measures, beside the number. */
export const SIMILARITY_NOTE =
  'Similarity is the share of codes the two lists have in common (Jaccard index, 0 to 1): ' +
  'every billable ICD-10-CM code either state lists or covers with a wildcard or range, plus ' +
  'their other entries, counted once each.'

/** Says a chosen state has no list, so nothing is compared. */
export function statesCompareNoListText(names: readonly string[]): string {
  const who = names.length === 1 ? `${names[0] ?? ''} has` : `${names.join(' and ')} have`
  return `${who} no list on this site yet, so there is nothing to compare. Choose states with a list.`
}

/** The status line above the table. */
export function statesCompareSummaryText(d: {
  totalRows: number
  totalGroups: number
  page: number
  pageCount: number
  diff: boolean
}): string {
  const codes = `${formatCount(d.totalRows)} ${d.totalRows === 1 ? 'code' : 'codes'}`
  const verb = d.diff ? (d.totalRows === 1 ? ' differs' : ' differ') : ''
  const groups = `${formatCount(d.totalGroups)} ${d.totalGroups === 1 ? 'group' : 'groups'}`
  const page = d.pageCount > 1 ? `, page ${String(d.page)} of ${String(d.pageCount)}` : ''
  return `${codes}${verb}, in ${groups}${page}.`
}

/** A group header's count for one state: `12 codes`. */
export const statesCompareGroupCountText = (n: number): string =>
  `${formatCount(n)} ${n === 1 ? 'code' : 'codes'}`

/** The button under the similar-states list: `Compare Georgia with 2 states`. */
export const compareWithText = (stateName: string, n: number): string =>
  `Compare ${stateName} with ${String(n)} ${n === 1 ? 'state' : 'states'}`

/** How many states the similar-states list lets a reader add to the state itself. */
export const SIMILAR_PICK_MAX = STATES_COMPARE_MAX - 1

/** `Georgia and Montana`, `Georgia, Montana and Nebraska`. */
function andList(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`
}

/** The table's caption. */
export const statesCompareCaption = (names: readonly string[], diff: boolean): string =>
  diff ? `Codes where ${andList(names)} differ` : `Every code of ${andList(names)}`

/** Summary labels: codes only one state lists or covers, and codes they all do. */
export const statesCompareOnlyLabel = (name: string): string => `Only ${name}`
export const statesCompareAllLabel = (n: number): string => (n === 2 ? 'Both' : `All ${String(n)}`)

/** What the summary counts. */
export const STATES_COMPARE_SUMMARY_NOTE =
  'Codes here are the entries of the chosen lists (a code, wildcard or range each); a state ' +
  'counts a code when it lists it or covers it with a broader entry.'

/** The intro under the heading. */
export const STATES_COMPARE_INTRO =
  'Where these states’ medical frailty code lists differ, grouped by the categories we compare ' +
  'states by. A code differs when some of the states list or cover it and others do not, or ' +
  'when all of them do under different rules.'

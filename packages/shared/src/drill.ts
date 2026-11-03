import { z } from 'zod'

import { compareStatuses } from './compare'
import { formatCount, stateCategoryName } from './public'
import {
  type CodeSystem,
  codeSystems,
  codeSystemSchema,
  federalCategories,
  type MatchKind,
  matchKindSchema,
  type Qualification,
  qualificationBasisSchema,
  qualifications,
  qualificationSchema,
} from './enums'
import { qualificationLabels } from './qualification'
import { unifiedSlugSchema } from './unified'

// The category drill-down (`/compare/<slug>`, roadmap M5 step 6; docs/data-model.md,
// "Drill-down"). Rows are the codes, wildcards and ranges placed in one published unified
// category, grouped by ICD-10-CM category (other systems by system) and ranked by how many
// states with a list list or cover them. The Worker counts in D1; these are the URL, the order,
// the filters and the words, shared by the Vue page, the server-rendered HTML and the CSV.

/** A page holds the groups that start within this many rows of its first row. */
export const DRILL_PAGE_ROWS = 250

export const drillShows = ['all', 'everyone', 'gaps', 'one'] as const
export type DrillShow = (typeof drillShows)[number]

export const drillShowLabels: Record<DrillShow, string> = {
  all: 'All codes',
  everyone: 'Included by every state with a list',
  gaps: 'Included by fewer than half',
  one: 'Included by one state only',
}

// ---------------------------------------------------------------------------------------------
// Rows are named by `comparePatternKey`: `icd10cm|exact|F200`, `icd10cm|prefix|F31`,
// `icd10cm|range|F31|F32|*` (a range of wildcards), `cpt|range|90935|90937|`.

export interface DrillPattern {
  codeSystem: CodeSystem
  codeNorm: string
  matchKind: MatchKind
  rangeEndNorm: string | null
  includesChildren: 0 | 1
}

const normPattern = /^[A-Z0-9]{1,40}$/

/** A row key back into its pattern; null when it is not one. */
export function parsePatternKey(key: string): DrillPattern | null {
  const [system, kind, norm, end, wild, ...rest] = key.split('|')
  const parsedSystem = codeSystemSchema.safeParse(system)
  if (!parsedSystem.success || rest.length > 0 || norm === undefined || !normPattern.test(norm)) {
    return null
  }
  const codeSystem = parsedSystem.data
  if ((kind === 'exact' || kind === 'prefix') && end === undefined) {
    return {
      codeSystem,
      codeNorm: norm,
      matchKind: kind,
      rangeEndNorm: null,
      includesChildren: kind === 'prefix' ? 1 : 0,
    }
  }
  if (
    kind === 'range' &&
    end !== undefined &&
    normPattern.test(end) &&
    (wild === '*' || wild === '')
  ) {
    return {
      codeSystem,
      codeNorm: norm,
      matchKind: 'range',
      rangeEndNorm: end,
      includesChildren: wild === '*' ? 1 : 0,
    }
  }
  return null
}

const patternKeySchema = z
  .string()
  .max(200)
  .refine((key) => parsePatternKey(key) !== null)

// ---------------------------------------------------------------------------------------------
// The URL query. Lenient: what cannot be read falls back to its default, so an old or edited
// link still opens the page.

export interface DrillQuery {
  show: DrillShow
  system: CodeSystem | null
  /** Add every code of the category's full list that is not a row yet ("Include codes no state lists"). */
  all: boolean
  focus: string | null
  page: number
  /** The row whose details are open (a pattern key). */
  code: string | null
}

const first = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value)

export const drillQuerySchema = z.object({
  show: z.preprocess(first, z.enum(drillShows)).catch('all'),
  system: z.preprocess(first, codeSystemSchema.nullable().default(null)).catch(null),
  all: z
    .preprocess(first, z.enum(['1', 'true']).optional())
    .transform((v) => v !== undefined)
    .catch(false),
  focus: z
    .preprocess(
      first,
      z
        .string()
        .regex(/^[A-Za-z]{2}$/)
        .transform((s) => s.toUpperCase())
        .nullable()
        .default(null),
    )
    .catch(null),
  page: z.preprocess(first, z.coerce.number().int().min(1).max(100_000).default(1)).catch(1),
  code: z.preprocess(first, patternKeySchema.nullable().default(null)).catch(null),
})

/** Reads the query from Hono's or Vue Router's query object. */
export function drillQueryFromRecord(query: Readonly<Record<string, unknown>>): DrillQuery {
  return drillQuerySchema.parse(query)
}

/** The query as URL parameters, defaults left out, so a link is short and stable. */
export function drillSearchParams(q: DrillQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (q.show !== 'all') params.set('show', q.show)
  if (q.system !== null) params.set('system', q.system)
  if (q.all) params.set('all', '1')
  if (q.focus !== null) params.set('focus', q.focus)
  if (q.page > 1) params.set('page', String(q.page))
  if (q.code !== null) params.set('code', q.code)
  return params
}

/** Every row of the view as CSV: the filters and `all`, never the page or the open code. */
export function drillCsvPath(slug: string, q: DrillQuery): string {
  const params = drillSearchParams({ ...q, focus: null, page: 1, code: null })
  const search = params.toString()
  return `/compare/${slug}/codes.csv${search === '' ? '' : `?${search}`}`
}

/** The M4 code table for the category's federal parent, with these states as columns. */
export function drillCodeTablePath(federalCategory: string, stateIds: readonly string[]): string {
  const params = new URLSearchParams({ states: stateIds.join(','), category: federalCategory })
  return `/compare/codes?${params.toString()}`
}

// ---------------------------------------------------------------------------------------------
// Filters and order

/** Does a row listed by `n` of the `m` states with a list pass the filter? */
export function drillKeeps(show: DrillShow, n: number, m: number): boolean {
  switch (show) {
    case 'all':
      return true
    case 'everyone':
      return m > 0 && n === m
    case 'gaps':
      return n * 2 < m
    case 'one':
      return n === 1
  }
}

/** Groups and rows start open when a filter is on; with "All codes" only the group rows show. */
export const drillGroupsOpen = (show: DrillShow): boolean => show !== 'all'

/** Display order of code systems, as SQL `CASE` values too. */
export const drillSystemRank = (system: CodeSystem): number => codeSystems.indexOf(system)

const kindRank: Record<MatchKind, number> = { exact: 0, prefix: 1, range: 2 }

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Rows: most states first, then code system, code, kind (code, wildcard, range), range end. */
export function compareDrillRows(
  a: Pick<DrillRow, 'codeSystem' | 'codeNorm' | 'matchKind' | 'rangeEndNorm' | 'count'>,
  b: Pick<DrillRow, 'codeSystem' | 'codeNorm' | 'matchKind' | 'rangeEndNorm' | 'count'>,
): number {
  return (
    b.count - a.count ||
    drillSystemRank(a.codeSystem) - drillSystemRank(b.codeSystem) ||
    byText(a.codeNorm, b.codeNorm) ||
    kindRank[a.matchKind] - kindRank[b.matchKind] ||
    byText(a.rangeEndNorm ?? '', b.rangeEndNorm ?? '')
  )
}

/** Groups: most states listing any of their codes first, then code system, then key. */
export function compareDrillGroups(
  a: Pick<DrillGroup, 'codeSystem' | 'key' | 'anyCount'>,
  b: Pick<DrillGroup, 'codeSystem' | 'key' | 'anyCount'>,
): number {
  return (
    b.anyCount - a.anyCount ||
    drillSystemRank(a.codeSystem) - drillSystemRank(b.codeSystem) ||
    byText(a.key, b.key)
  )
}

// ---------------------------------------------------------------------------------------------
// Response: `GET /api/public/categories/:slug` and `…/:slug/detail?code=`

const count = z.number().int().min(0)
const stateIdSchema = z.string().regex(/^[A-Z]{2}$/)

/** How one state lists a row: the entry that lists or covers it. */
export const drillMatchSchema = z.object({
  /** The state's entry as written: `F20.0`, `F20.*`, `F41.*–F42.*`. */
  display: z.string(),
  tier: z.string().nullable(),
  qualification: qualificationSchema,
  qualificationBasis: qualificationBasisSchema,
  stateCategory: z.string(),
  stateSubcategory: z.string(),
})
export type DrillMatch = z.infer<typeof drillMatchSchema>

/** One state's cell, in the M4 words (`compareCellText`). */
export const drillCellSchema = z.object({
  status: z.enum(compareStatuses),
  match: drillMatchSchema.nullable(),
  narrowerCount: count,
})
export type DrillCell = z.infer<typeof drillCellSchema>

/** How many of the states listing a row have each rule; `inferred` of them inferred by us. */
export const drillRuleSchema = z.object({
  qualification: qualificationSchema,
  count: z.number().int().min(1),
  inferred: count,
})
export type DrillRule = z.infer<typeof drillRuleSchema>

export const drillRowSchema = z.object({
  /** `comparePatternKey`: the `code=` of its details. */
  key: z.string(),
  codeSystem: codeSystemSchema,
  codeNorm: z.string(),
  matchKind: matchKindSchema,
  rangeEndNorm: z.string().nullable(),
  /** Covers the codes under it (a wildcard, or a range of wildcards). */
  wildcard: z.boolean(),
  display: z.string(),
  /** The code's page, or null (wildcards, ranges and systems without pages). */
  codePath: z.string().nullable(),
  description: z.string().nullable(),
  /** `cms` (the public CMS code set), a state's postal code (its own text), or null. */
  descriptionSource: z.string().nullable(),
  /** States with a list that list it, or cover it with a wildcard or range. */
  count,
  /** Their rules, in badge order; only rules some state has. */
  rules: z.array(drillRuleSchema),
  /** The focus state's cell; null without a focus. */
  focus: drillCellSchema.nullable(),
})
export type DrillRow = z.infer<typeof drillRowSchema>

export const drillGroupSchema = z.object({
  /** `icd10cm|F20`, or the code system (`hcpcs`) for systems without categories. */
  key: z.string(),
  codeSystem: codeSystemSchema,
  /** `F20`, or the code system's name. */
  label: z.string(),
  /** The ICD-10-CM category's CMS title; null for other systems. */
  description: z.string().nullable(),
  /** States with a list that list or cover any code of the group (whatever the filter). */
  anyCount: count,
  /** Rows of the group the filter keeps. */
  rowCount: count,
  rows: z.array(drillRowSchema),
})
export type DrillGroup = z.infer<typeof drillGroupSchema>

export const drillCategorySchema = z.object({
  id: z.number().int().positive(),
  slug: unifiedSlugSchema,
  label: z.string(),
  definition: z.string(),
  includes: z.string().nullable(),
  excludes: z.string().nullable(),
  federalCategory: z.enum(federalCategories).exclude(['unmapped']),
  version: z.number().int().positive(),
  /** Billable ICD-10-CM codes in its CCSR groups; 0 when it has no full code list. */
  universeSize: count,
  ccsr: z.array(z.object({ id: z.string(), description: z.string() })),
})
export type DrillCategory = z.infer<typeof drillCategorySchema>

export const drillStateSchema = z.object({
  id: stateIdSchema,
  slug: z.string().regex(/^[a-z]{2}$/),
  name: z.string(),
})
export type DrillState = z.infer<typeof drillStateSchema>

/** Body of `GET /api/public/categories/:slug`: one page of groups. */
export const drillResponseSchema = z.object({
  dataVersion: count,
  category: drillCategorySchema,
  /** The states with a list, by name: the N of "M of N" and the focus choices. */
  states: z.array(drillStateSchema),
  /** Code systems among the category's rows, in display order. */
  systems: z.array(codeSystemSchema),
  /** The query as applied (a focus without a list, or `all` without a full list, are dropped). */
  query: z.object({
    show: z.enum(drillShows),
    system: codeSystemSchema.nullable(),
    all: z.boolean(),
    focus: stateIdSchema.nullable(),
  }),
  totalRows: count,
  totalGroups: count,
  page: z.number().int().min(1),
  pageCount: z.number().int().min(1),
  groups: z.array(drillGroupSchema),
})
export type DrillResponse = z.infer<typeof drillResponseSchema>

export const drillDetailStateSchema = drillStateSchema.extend({
  hasList: z.boolean(),
  cell: drillCellSchema,
})
export type DrillDetailState = z.infer<typeof drillDetailStateSchema>

/** Body of `GET /api/public/categories/:slug/detail?code=`: every state for one row. */
export const drillDetailResponseSchema = z.object({
  dataVersion: count,
  row: drillRowSchema.omit({ focus: true }),
  statesWithList: count,
  /** Every state, by name. */
  states: z.array(drillDetailStateSchema),
})
export type DrillDetailResponse = z.infer<typeof drillDetailResponseSchema>

// ---------------------------------------------------------------------------------------------
// Wording

/** The source of a category's full code list, as AHRQ asks to be cited. */
export const CCSR_CITATION =
  'Clinical Classifications Software Refined (CCSR) for ICD-10-CM Diagnoses, v2026.1. ' +
  'Healthcare Cost and Utilization Project (HCUP). Agency for Healthcare Research and Quality.'

/** AHRQ's page for the CCSR, the "learn more" link wherever CCSR groups are named. */
export const CCSR_URL = 'https://hcup-us.ahrq.gov/toolssoftware/ccsr/dxccsr.jsp'

/** Under the header: what makes a comparison category (the site's own grouping). */
export const DRILL_ABOUT =
  'A comparison category: this site’s own grouping of codes, so that every state’s list can be ' +
  'measured the same way.'

/** The `<details>` summary over the category's CCSR groups. */
export const drillCcsrHeading = (n: number): string =>
  `Diagnosis groups this category is built from (${formatCount(n)} CCSR ${n === 1 ? 'group' : 'groups'})`

/** The table's caption. */
export const drillCaption = (label: string): string =>
  `${label}: codes by how many states include them`

/** Column headings of the drill-down table. */
export const DRILL_COUNT_HEADING = 'States that include it'
export const DRILL_RULES_HEADING = 'State rules'

/** Above the table: what the counts count, and what a group is. */
export const DRILL_COUNT_NOTE =
  'A state includes a code when its list has the code itself or a wildcard or range that ' +
  'covers it. The second number is the number of states with a list on this site. Codes are ' +
  'grouped by their first 3 characters (ICD-10-CM) or by code system.'

export const drillCountText = (n: number, m: number): string =>
  `${formatCount(n)} of ${formatCount(m)} ${m === 1 ? 'state' : 'states'}`

export const drillGroupCountText = (n: number, m: number): string =>
  `${formatCount(n)} of ${formatCount(m)} include any`

/** The details panel's count line: `Included by 3 of 4 states with a list.` */
export const drillDetailCountText = (n: number, m: number): string =>
  `Included by ${drillCountText(n, m)} with a list.`

export function drillRuleText(rule: DrillRule): string {
  const inferred = rule.inferred > 0 ? ` (${formatCount(rule.inferred)} inferred)` : ''
  const states = `${formatCount(rule.count)} ${rule.count === 1 ? 'state' : 'states'}`
  return `${qualificationLabels[rule.qualification]}: ${states}${inferred}`
}

export const DRILL_NOBODY = 'No state includes it'

/** The checkbox that adds the category's codes no state includes. */
export const DRILL_UNIVERSE_LABEL = 'Also show codes no state includes'

/** The details panel's placeholder. */
export const DRILL_DETAILS_PLACEHOLDER =
  'Choose “Details” on a code to see which states include it, how (listed or covered), and ' +
  'whether it is enough by itself.'

/** In the details panel, under "Not listed". */
export const DRILL_NOT_LISTED_NOTE = 'States with a list that do not include it'

export function drillRulesText(rules: readonly DrillRule[]): string {
  return rules.length === 0 ? DRILL_NOBODY : rules.map(drillRuleText).join('; ')
}

/** The state's own category for the entry; null when the state has no categories. */
export function drillFiledUnder(match: Pick<DrillMatch, 'stateCategory' | 'stateSubcategory'>) {
  if (match.stateCategory === '' && match.stateSubcategory === '') return null
  return stateCategoryName(match.stateCategory, match.stateSubcategory)
}

/** Beside the universe checkbox: what the reference list is, or why there is none. */
export function drillUniverseNote(universeSize: number): string {
  return universeSize > 0
    ? `This category’s reference list has ${formatCount(universeSize)} billable ICD-10-CM codes (from its CCSR groups); turn this on to see the ones no state includes.`
    : 'This category has no reference list, so only codes some state includes are shown.'
}

/** Rules in badge order, as the API builds them from counts. */
export function drillRules(
  counts: Readonly<Record<Qualification, { count: number; inferred: number }>>,
): DrillRule[] {
  return qualifications.flatMap((qualification) => {
    const c = counts[qualification]
    return c.count > 0 ? [{ qualification, count: c.count, inferred: c.inferred }] : []
  })
}

/** The status line under the controls. */
export function drillStatusText(
  data: Pick<
    DrillResponse,
    'totalRows' | 'totalGroups' | 'states' | 'page' | 'pageCount' | 'query'
  >,
): string {
  const parts = [
    `${formatCount(data.states.length)} ${data.states.length === 1 ? 'state has' : 'states have'} a list on this site.`,
    `${formatCount(data.totalRows)} ${data.totalRows === 1 ? 'code' : 'codes'} in ${formatCount(data.totalGroups)} ${data.totalGroups === 1 ? 'group' : 'groups'}${data.pageCount > 1 ? `, page ${String(data.page)} of ${String(data.pageCount)}` : ''}.`,
  ]
  if (data.query.all) parts.push('Codes no state includes are shown too.')
  return parts.join(' ')
}

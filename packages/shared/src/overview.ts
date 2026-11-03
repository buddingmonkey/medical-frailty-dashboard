import { z } from 'zod'

import { federalCategoryInfo } from './categories'
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

// ---------------------------------------------------------------------------------------------
// The overview matrix (`/compare`, roadmap M5 step 5): wording, numbers, shades and orders. The
// Vue page and the Worker's server-rendered HTML both use these, so both say the same thing.

/** A share as a whole percentage: never 0 above zero, never 100 below one. */
export function coveragePercent(share: number | null): number {
  if (share === null || share <= 0) return 0
  if (share >= 1) return 100
  return Math.min(99, Math.max(1, Math.round(share * 100)))
}

/** The four shades: 75% or more, 25–74%, 1–24%, none listed (hatched). */
export type CoverageBand = 'high' | 'mid' | 'low' | 'none'

export function coverageBand(share: number | null): CoverageBand {
  const percent = coveragePercent(share)
  if (percent === 0) return 'none'
  if (percent < 25) return 'low'
  return percent < 75 ? 'mid' : 'high'
}

export const coverageBandLabels: Record<CoverageBand, string> = {
  high: '75% or more',
  mid: '25–74%',
  low: '1–24%',
  none: 'None listed',
}

/** The one cell of a state without a list. */
export const OVERVIEW_NO_LIST = 'No list on this site yet'

/** The words beside a cell whose placements an admin has not reviewed. */
export const OVERVIEW_NOT_REVIEWED = 'not reviewed'

export const overviewCellText = (share: number | null): string =>
  `${String(coveragePercent(share))}%`

/** Some of the cell's codes were placed without an admin's review. */
export const overviewCellNotReviewed = (cell: OverviewCell): boolean =>
  cell.entries > 0 && !cell.reviewed

/** What the share is a share of, by the category's coverage basis. */
const shareOf: Record<OverviewCoverageBasis, string> = {
  universe: 'of the category’s codes',
  union: 'of the codes any state lists',
}

/** The cell's accessible name: it starts with the number the cell shows. */
export function overviewCellLabel(
  stateName: string,
  category: OverviewCategory,
  cell: OverviewCell,
): string {
  const text = overviewCellText(cell.share)
  const what =
    cell.entries === 0 ? `${text}, none listed` : `${text} ${shareOf[category.coverageBasis]}`
  const review = overviewCellNotReviewed(cell) ? `, ${OVERVIEW_NOT_REVIEWED}` : ''
  return `${stateName}, ${category.label}: ${what}${review}`
}

/** The category drill-down (roadmap M5 step 6) with the state in focus. */
export const overviewDrillDownPath = (slug: string, stateId: string): string =>
  `/compare/${slug}?focus=${stateId}`

/** Overall coverage: the average of the state's category shares, each category counting the same. */
export function overviewOverall(state: OverviewState): number | null {
  const shares = state.cells.flatMap((c) => (c.share === null ? [] : [c.share]))
  if (!state.hasList || shares.length === 0) return null
  return shares.reduce((sum, s) => sum + s, 0) / shares.length
}

/** Consecutive categories under one federal parent: the first header row. */
export function overviewCategoryGroups(categories: readonly OverviewCategory[]): {
  federalCategory: OverviewCategory['federalCategory']
  label: string
  categories: OverviewCategory[]
}[] {
  const groups: ReturnType<typeof overviewCategoryGroups> = []
  for (const c of categories) {
    const last = groups.at(-1)
    if (last?.federalCategory === c.federalCategory) last.categories.push(c)
    else
      groups.push({
        federalCategory: c.federalCategory,
        label: federalCategoryInfo[c.federalCategory].label,
        categories: [c],
      })
  }
  return groups
}

export type OverviewSortDir = 'desc' | 'asc'

/** How the rows are ordered. A column sort starts highest first. */
export type OverviewOrder =
  | { by: 'name' }
  | { by: 'similar' }
  | { by: 'overall'; dir: OverviewSortDir }
  | { by: 'category'; unifiedId: number; dir: OverviewSortDir }

const byName = (a: OverviewState, b: OverviewState) => a.name.localeCompare(b.name, 'en')

const shareIn = (s: OverviewState, unifiedId: number) =>
  s.cells.find((c) => c.unifiedId === unifiedId)?.share ?? 0

/**
 * Greedy nearest-neighbour seriation: start from the highest overall coverage, then take the
 * state whose coverage vector is nearest (squared distance) to the last one placed; ties go to
 * the higher overall, then the name. Deterministic for the same data.
 */
function seriate(states: OverviewState[]): OverviewState[] {
  const overall = new Map(states.map((s) => [s.id, overviewOverall(s) ?? 0]))
  const vector = new Map(states.map((s) => [s.id, s.cells.map((c) => c.share ?? 0)]))
  const rank = (a: OverviewState, b: OverviewState) =>
    (overall.get(b.id) ?? 0) - (overall.get(a.id) ?? 0) || byName(a, b)
  const rest = [...states].sort(rank)
  const out: OverviewState[] = []
  let next = rest.shift()
  while (next) {
    out.push(next)
    const from = vector.get(next.id) ?? []
    const distance = (s: OverviewState) =>
      (vector.get(s.id) ?? []).reduce((sum, v, i) => sum + (v - (from[i] ?? 0)) ** 2, 0)
    // The first of the nearest wins, so ties keep the overall-then-name order of `rest`.
    let best = -1
    let bestDistance = Infinity
    rest.forEach((s, i) => {
      const d = distance(s)
      if (d < bestDistance) {
        best = i
        bestDistance = d
      }
    })
    next = best === -1 ? undefined : rest.splice(best, 1)[0]
  }
  return out
}

/** The rows in an order; states without a list always come last, by name. */
export function orderOverviewStates(
  states: readonly OverviewState[],
  order: OverviewOrder,
): OverviewState[] {
  const withList = states.filter((s) => s.hasList)
  const without = states.filter((s) => !s.hasList).sort(byName)
  let rows: OverviewState[]
  if (order.by === 'similar') rows = seriate(withList)
  else if (order.by === 'name') rows = [...withList].sort(byName)
  else {
    const value =
      order.by === 'overall'
        ? (s: OverviewState) => overviewOverall(s) ?? 0
        : (s: OverviewState) => shareIn(s, order.unifiedId)
    const sign = order.dir === 'desc' ? -1 : 1
    rows = [...withList].sort((a, b) => sign * (value(a) - value(b)) || byName(a, b))
  }
  return [...rows, ...without]
}

/** A sort button: highest first, and the same column again flips the direction. */
export function nextOverviewOrder(
  current: OverviewOrder,
  column: 'overall' | number,
): OverviewOrder {
  const same =
    column === 'overall'
      ? current.by === 'overall'
      : current.by === 'category' && current.unifiedId === column
  const dir: OverviewSortDir = same && 'dir' in current && current.dir === 'desc' ? 'asc' : 'desc'
  return column === 'overall' ? { by: 'overall', dir } : { by: 'category', unifiedId: column, dir }
}

/** One value of a URL parameter (the first when repeated), as Vue Router or Hono give them. */
function queryValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

/**
 * The order in the URL (`/compare?order=similar`, `?order=overall&dir=asc`, `?sort=<category
 * slug>&dir=asc`), so a shared link keeps it; `sort=overall` reads like `order=overall`. A
 * column sort wins over an order; anything unknown gives the default (by name). Directions
 * default to highest first.
 */
export function overviewOrderFromQuery(
  query: Readonly<Record<string, unknown>>,
  categories: readonly Pick<OverviewCategory, 'id' | 'slug'>[],
): OverviewOrder {
  const dir: OverviewSortDir = queryValue(query['dir']) === 'asc' ? 'asc' : 'desc'
  const sort = queryValue(query['sort'])
  if (sort === 'overall') return { by: 'overall', dir }
  const column = categories.find((c) => c.slug === sort)
  if (column) return { by: 'category', unifiedId: column.id, dir }
  const order = queryValue(query['order'])
  if (order === 'similar') return { by: 'similar' }
  if (order === 'overall') return { by: 'overall', dir }
  return { by: 'name' }
}

/** The order as URL parameters, defaults left out (by name, highest first): the reverse. */
export function overviewOrderQuery(
  order: OverviewOrder,
  categories: readonly Pick<OverviewCategory, 'id' | 'slug'>[],
): Record<string, string> {
  const dir: Record<string, string> = 'dir' in order && order.dir === 'asc' ? { dir: 'asc' } : {}
  switch (order.by) {
    case 'name':
      return {}
    case 'similar':
      return { order: 'similar' }
    case 'overall':
      return { order: 'overall', ...dir }
    case 'category': {
      const slug = categories.find((c) => c.id === order.unifiedId)?.slug
      return slug === undefined ? {} : { sort: slug, ...dir }
    }
  }
}

/** What the live region says after the order changes. */
export function overviewOrderAnnouncement(
  order: OverviewOrder,
  categories: readonly OverviewCategory[],
): string {
  if (order.by === 'name') return 'States in order of name, states with a list first.'
  if (order.by === 'similar') return 'States with similar coverage placed next to each other.'
  const label =
    order.by === 'overall'
      ? 'overall coverage'
      : (categories.find((c) => c.id === order.unifiedId)?.label ?? 'a category')
  return `Sorted by ${label}, ${order.dir === 'desc' ? 'highest' : 'lowest'} first.`
}

/** The page's description, in the browser and the server-rendered HTML. */
export const OVERVIEW_DESCRIPTION =
  'Which states cover what: every state’s Medicaid medical frailty code list against the same ' +
  'categories, as the share of each category’s codes the state lists.'

/** "Reading this table", the same words in the Vue page and the server-rendered HTML. */
export const overviewReadingNotes: readonly string[] = [
  'Each number is the share of a category’s diagnosis codes that the state lists. A category’s ' +
    'codes are the ICD-10-CM codes in its CCSR groups (the Clinical Classifications Software ' +
    'Refined, from AHRQ).',
  'Categories marked † have no full code list. Their number is the share of the codes that any ' +
    'state lists in the category.',
  'A cell counts the state’s codes in the category whichever of the state’s own categories ' +
    'they are filed under.',
  'Overall is the average of the state’s numbers, each category counting the same.',
  'Not reviewed (*): some of the codes in the cell were placed by their CCSR group, and an ' +
    'admin has not yet reviewed how the state’s categories map to ours.',
]

import { z } from 'zod'

import { stateIdSchema } from './admin'
import { compareDrillRows, type DrillRow } from './drill'
import { type CodeSystem, codeSystemSchema, federalCategories } from './enums'
import { formatCount, SITE_NAME } from './public'
import { unifiedSlugSchema } from './unified'

// The Overlaps tab (`/compare/overlaps`, project lead, 2026-11-12): an UpSet view (Lex et al.
// 2014) of one comparison category. Each state's list is a set of the category's rows; a row is
// what the drill-down counts (a code, wildcard or range placed in the category) and a state
// includes it by the drill's own matching (listed, or covered by a wildcard or range). Each row
// goes in exactly one exclusive intersection: the set of states that include it. The Worker
// finds the states per row in D1 (src/db/public-overlaps.ts); this groups them, for the API,
// the Vue page and the server-rendered HTML.

/** Rows shown before "Show all". */
export const OVERLAPS_TOP = 20

// ---------------------------------------------------------------------------------------------
// Query: `?category=<slug>`

const first = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value)

export const overlapsQuerySchema = z.object({
  category: z.preprocess(first, unifiedSlugSchema),
})

// ---------------------------------------------------------------------------------------------
// Response: `GET /api/public/overlaps?category=<slug>`

const count = z.number().int().min(0)

export const overlapStateSchema = z.object({
  id: stateIdSchema,
  slug: z.string().regex(/^[a-z]{2}$/),
  name: z.string(),
  /** The state's set size: rows of the category it includes. */
  codeCount: z.number().int().min(1),
})
export type OverlapState = z.infer<typeof overlapStateSchema>

export const overlapCodeSchema = z.object({
  /** `comparePatternKey`, as in the drill-down. */
  key: z.string(),
  display: z.string(),
  codeSystem: codeSystemSchema,
  /** The code's page, or null (wildcards, ranges and systems without pages). */
  codePath: z.string().nullable(),
})
export type OverlapCode = z.infer<typeof overlapCodeSchema>

export const overlapIntersectionSchema = z.object({
  /** The states that include every code of the row and no other state does, by id. */
  stateIds: z.array(stateIdSchema).min(1),
  size: z.number().int().min(1),
  codes: z.array(overlapCodeSchema),
})
export type OverlapIntersection = z.infer<typeof overlapIntersectionSchema>

export const overlapsResponseSchema = z.object({
  dataVersion: count,
  category: z.object({
    id: z.number().int().positive(),
    slug: unifiedSlugSchema,
    label: z.string(),
    federalCategory: z.enum(federalCategories).exclude(['unmapped']),
  }),
  /** States that include anything in the category: largest set first, then by name. */
  states: z.array(overlapStateSchema),
  /** Rows any state includes; the sum of the intersections' sizes. */
  totalCodes: count,
  /** Largest first; ties: more states first, then by the states' ids. */
  intersections: z.array(overlapIntersectionSchema),
})
export type OverlapsResponse = z.infer<typeof overlapsResponseSchema>

// ---------------------------------------------------------------------------------------------
// The maths

/** One drill-down row with the states (with a list) that include it. */
export interface OverlapInputRow extends Pick<
  DrillRow,
  'key' | 'codeNorm' | 'matchKind' | 'rangeEndNorm' | 'display'
> {
  codeSystem: CodeSystem
  codePath: string | null
  stateIds: readonly string[]
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** States' set sizes and the exclusive intersections of their sets. */
export function buildOverlaps(
  rows: readonly OverlapInputRow[],
  states: readonly { id: string; slug: string; name: string }[],
): Pick<OverlapsResponse, 'states' | 'totalCodes' | 'intersections'> {
  const known = new Set(states.map((s) => s.id))
  const sizes = new Map<string, number>()
  const groups = new Map<string, { stateIds: string[]; rows: OverlapInputRow[] }>()
  let totalCodes = 0
  for (const r of rows) {
    const ids = [...new Set(r.stateIds)].filter((id) => known.has(id)).sort(byText)
    if (ids.length === 0) continue
    totalCodes += 1
    for (const id of ids) sizes.set(id, (sizes.get(id) ?? 0) + 1)
    const key = ids.join(',')
    const group = groups.get(key)
    if (group) group.rows.push(r)
    else groups.set(key, { stateIds: ids, rows: [r] })
  }
  const asDrill = (r: OverlapInputRow) => ({ ...r, count: 0 })
  return {
    states: states
      .flatMap((s) => {
        const codeCount = sizes.get(s.id)
        return codeCount === undefined ? [] : [{ id: s.id, slug: s.slug, name: s.name, codeCount }]
      })
      .sort((a, b) => b.codeCount - a.codeCount || byText(a.name, b.name)),
    totalCodes,
    intersections: [...groups.values()]
      .map((g) => ({
        stateIds: g.stateIds,
        size: g.rows.length,
        codes: [...g.rows]
          .sort((a, b) => compareDrillRows(asDrill(a), asDrill(b)))
          .map(({ key, display, codeSystem, codePath }) => ({
            key,
            display,
            codeSystem,
            codePath,
          })),
      }))
      .sort(
        (a, b) =>
          b.size - a.size ||
          b.stateIds.length - a.stateIds.length ||
          byText(a.stateIds.join(','), b.stateIds.join(',')),
      ),
  }
}

/** The rows on show: the top `OVERLAPS_TOP`, or all of them. */
export function overlapsVisible<T>(intersections: readonly T[], all: boolean): readonly T[] {
  return all ? intersections : intersections.slice(0, OVERLAPS_TOP)
}

// ---------------------------------------------------------------------------------------------
// Wording. New with the tab (2026-11-12); for the legal review list.

export const OVERLAPS_HEADING = 'Which states list the same codes'

export const overlapsPageTitle = `${OVERLAPS_HEADING} | ${SITE_NAME}`

export const OVERLAPS_DESCRIPTION =
  'For one comparison category at a time: the groups of states whose medical frailty code ' +
  'lists include exactly the same codes, and how many codes each group shares.'

export const OVERLAPS_INTRO =
  'Choose a comparison category. Each row is a group of states and the codes that exactly ' +
  'those states include: every state in the group includes them and no other state does. ' +
  'Each code is counted in one row only. Rows are sorted by how many codes they have.'

/** What a code is here: the drill-down's rule (`DRILL_COUNT_NOTE`). */
export const OVERLAPS_COUNT_NOTE =
  'A state includes a code when its list has the code itself or a wildcard or range that ' +
  'covers it. A wildcard or range placed in the category counts as one code. Only states ' +
  'that include at least one code in the category are shown.'

export const OVERLAPS_EMPTY = 'No state includes any code in this category yet.'

export const OVERLAPS_GROUP_HEADING = 'Group of states'
export const OVERLAPS_SIZE_HEADING = 'Codes'
export const OVERLAPS_CODES_HEADING = 'The codes'

/** The server-rendered rows' `<details>` summary (the Vue rows open from their header). */
export const OVERLAPS_SHOW_CODES = 'Show the codes'

/** The table of set sizes beneath the rows (server-rendered). */
export const overlapsStatesCaption = (label: string): string =>
  `${label}: codes each state includes`

/** A state cell's words for screen readers (the dot is hidden). */
export const OVERLAP_IN_GROUP = 'In this group'
export const OVERLAP_NOT_IN_GROUP = 'Not in this group'

export const overlapsCaption = (label: string): string =>
  `${label}: groups of states that list exactly the same codes`

const codesText = (n: number) => `${formatCount(n)} ${n === 1 ? 'code' : 'codes'}`

function andList(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`
}

/**
 * A row's header, in words. `stateCount` is the number of states in the view: a row of all of
 * them says so instead of naming every state.
 */
export function overlapRowText(
  row: Pick<OverlapIntersection, 'size' | 'stateIds'>,
  names: ReadonlyMap<string, string>,
  stateCount: number,
): string {
  const k = row.stateIds.length
  const listed = row.stateIds.map((id) => names.get(id) ?? id).sort(byText)
  if (k === stateCount && k > 1) {
    return `${codesText(row.size)} listed by all ${formatCount(k)} states that list codes in this category`
  }
  if (k === 1) return `${codesText(row.size)} listed only by ${listed[0] ?? ''}`
  return `${codesText(row.size)} listed by exactly these ${formatCount(k)} states: ${andList(listed)}`
}

/** A state column's header: `Georgia, 120 codes`. */
export const overlapStateHeaderText = (name: string, codeCount: number): string =>
  `${name}, ${codesText(codeCount)}`

export const overlapsToggleText = (all: boolean, total: number): string =>
  all ? `Show the top ${String(OVERLAPS_TOP)}` : `Show all ${formatCount(total)} groups`

/** Under the controls: how many rows and codes. */
export function overlapsStatusText(
  data: Pick<OverlapsResponse, 'states' | 'totalCodes' | 'intersections'>,
  shown: number,
): string {
  const groups = data.intersections.length
  return (
    `${formatCount(data.states.length)} ${data.states.length === 1 ? 'state includes' : 'states include'} ` +
    `${codesText(data.totalCodes)} in this category, in ${formatCount(groups)} ${groups === 1 ? 'group' : 'groups'}` +
    `${shown < groups ? `; the largest ${formatCount(shown)} are shown` : ''}.`
  )
}

import { z } from 'zod'

import { mappingKey } from './category-mapping'
import { codeUrlPath, entryCovers, formatCode } from './codes'
import {
  type CodeSystem,
  codeSystems,
  codeSystemSchema,
  type FederalCategory,
  federalCategorySchema,
  type MatchKind,
  matchKindSchema,
  type Qualification,
  type QualificationBasis,
  qualificationBasisSchema,
  qualifications,
  qualificationSchema,
} from './enums'
import { federalCategoryInfo } from './categories'
import { STATES_AND_DC, stateCategoryName } from './public'
import { qualificationLabels } from './qualification'

// Compare by category (roadmap M4; docs/architecture.md, "API shape"). Rows are the codes,
// wildcards and ranges the selected states list in one category; columns are the states. Each
// cell looks through the state's whole published list (docs/data-model.md, "Matching across
// states"), so a code the state files under another category still shows, with that category.
// Pure functions: the Worker loads the entries, this file aligns them.

export const COMPARE_PAGE_SIZE = 100

const stateId = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{2}$/))
const label = z.string().trim().max(200)

/** The code table's URL query (`/compare/codes?…`, `/api/public/compare?…`), read from strings. */
export const compareQuerySchema = z
  .object({
    /** Comma-separated postal codes, in column order. */
    states: z
      .string()
      .max(400)
      .transform((s) => s.split(',').filter((part) => part.trim() !== ''))
      .pipe(z.array(stateId).min(1)),
    /** A federal category … */
    category: federalCategorySchema.optional(),
    /** … or one state's own category (and subcategory, '' for none). */
    ownState: stateId.optional(),
    ownCategory: label.optional(),
    ownSubcategory: label.default(''),
    system: codeSystemSchema.optional(),
    /** Only codes that qualify alone in at least one selected state. */
    alone: z
      .enum(['1', '0', 'true', 'false'])
      .optional()
      .transform((v) => v === '1' || v === 'true'),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
  })
  .superRefine((q, ctx) => {
    if ((q.category === undefined) === (q.ownState === undefined)) {
      ctx.addIssue({ code: 'custom', message: 'Give either category or ownState, not both' })
    }
    if (q.ownState !== undefined && q.ownCategory === undefined) {
      ctx.addIssue({ code: 'custom', path: ['ownCategory'], message: 'ownState needs ownCategory' })
    }
  })
  .transform((q) => {
    // The state whose category it is comes first; every state once.
    const ids = q.ownState === undefined ? q.states : [q.ownState, ...q.states]
    return { ...q, states: [...new Set(ids)] }
  })
  .refine((q) => q.states.length <= STATES_AND_DC, {
    message: `At most ${String(STATES_AND_DC)} states`,
  })
export type CompareQuery = z.output<typeof compareQuerySchema>

/** Every parameter of the code table's query (`/compare/codes?…`). */
export const compareQueryKeys = [
  'states',
  'category',
  'ownState',
  'ownCategory',
  'ownSubcategory',
  'system',
  'alone',
  'page',
] as const

/**
 * The URL asks for the code table: `/compare` with any of its parameters is an old link from
 * before M5 step 5, when the table lived at `/compare`; it redirects to `/compare/codes`.
 */
export function isCodeTableQuery(params: URLSearchParams): boolean {
  return compareQueryKeys.some((key) => params.has(key))
}

/** The query as URL search params, defaults left out, so a link is short and stable. */
export function compareSearchParams(q: CompareQuery): URLSearchParams {
  const params = new URLSearchParams({ states: q.states.join(',') })
  if (q.category !== undefined) params.set('category', q.category)
  if (q.ownState !== undefined) {
    params.set('ownState', q.ownState)
    params.set('ownCategory', q.ownCategory ?? '')
    if (q.ownSubcategory !== '') params.set('ownSubcategory', q.ownSubcategory)
  }
  if (q.system !== undefined) params.set('system', q.system)
  if (q.alone) params.set('alone', '1')
  if (q.page > 1) params.set('page', String(q.page))
  return params
}

// ---------------------------------------------------------------------------------------------
// Response

export const compareStatuses = ['exact', 'covered', 'narrower', 'not_listed', 'no_list'] as const
export type CompareStatus = (typeof compareStatuses)[number]

/** Words for each cell status; provisional, like the badges (docs/data-model.md). */
export const compareStatusLabels: Record<CompareStatus, string> = {
  exact: 'Listed',
  covered: 'Covered by a broader entry',
  narrower: 'Narrower codes listed',
  not_listed: 'Not listed',
  no_list: 'No list on this site',
}

const compareMatchSchema = z.object({
  /** The state's entry as written: `F20.0`, `F20.*`, `F41.*–F42.*`. */
  display: z.string(),
  tier: z.string().nullable(),
  qualification: qualificationSchema,
  qualificationBasis: qualificationBasisSchema,
  stateCategory: z.string(),
  stateSubcategory: z.string(),
  federalCategory: federalCategorySchema,
})
export type CompareMatch = z.infer<typeof compareMatchSchema>

export const compareCellSchema = z.object({
  status: z.enum(compareStatuses),
  /** The state's entry that lists or covers the row; null otherwise. */
  match: compareMatchSchema.nullable(),
  /** For `narrower`: how many of the state's entries sit inside the row. */
  narrowerCount: z.number().int().min(0),
})
export type CompareCell = z.infer<typeof compareCellSchema>

export const compareRowSchema = z.object({
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
  /** One cell per column, in the order of `states`. */
  cells: z.array(compareCellSchema),
})
export type CompareRow = z.infer<typeof compareRowSchema>

export const compareStateSchema = z.object({
  id: z.string().regex(/^[A-Z]{2}$/),
  slug: z.string().regex(/^[a-z]{2}$/),
  name: z.string(),
  /** Has a list on this site. */
  published: z.boolean(),
})
export type CompareState = z.infer<typeof compareStateSchema>

/** Body of `GET /api/public/compare`. */
export const compareResponseSchema = z.object({
  dataVersion: z.number().int().min(0),
  states: z.array(compareStateSchema),
  totalRows: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  pageCount: z.number().int().min(1),
  rows: z.array(compareRowSchema),
})
export type CompareResponse = z.infer<typeof compareResponseSchema>

// ---------------------------------------------------------------------------------------------
// Aligning the entries

/** One published entry, with the federal category it counts under. */
export interface CompareEntry {
  stateId: string
  codeSystem: CodeSystem
  codeNorm: string
  matchKind: MatchKind
  rangeEndNorm: string | null
  includesChildren: 0 | 1 | null
  descriptionPublished: string | null
  stateCategory: string
  stateSubcategory: string
  federalCategory: FederalCategory
  tier: string | null
  qualification: Qualification
  qualificationBasis: QualificationBasis
}

export interface CompareInput {
  query: CompareQuery
  /** The states that exist; columns follow `query.states` and skip unknown ones. */
  states: CompareState[]
  /** Every published entry of the selected states. */
  entries: CompareEntry[]
}

export type CompareResult = Omit<CompareResponse, 'dataVersion'>

type Pattern = Pick<
  CompareEntry,
  'codeSystem' | 'codeNorm' | 'matchKind' | 'rangeEndNorm' | 'includesChildren'
>

/** Covers the codes under it: a prefix, an exact code with children, a wildcard range. */
const isWildcard = (p: Pattern) => p.matchKind === 'prefix' || p.includesChildren === 1
/** One code and nothing under it. */
const isSingle = (p: Pattern) => p.matchKind === 'exact' && p.includesChildren !== 1

/** The same codes, however the state wrote them: `F10` with children equals `F10*`. */
export function comparePatternKey(p: Pattern): string {
  if (p.matchKind === 'range') {
    return `${p.codeSystem}|range|${p.codeNorm}|${p.rangeEndNorm ?? ''}|${isWildcard(p) ? '*' : ''}`
  }
  return `${p.codeSystem}|${isWildcard(p) ? 'prefix' : 'exact'}|${p.codeNorm}`
}

function wildcardText(system: CodeSystem, norm: string): string {
  // ICD-10-CM categories take the dot: `F10.*`; longer codes already have one.
  return system === 'icd10cm' && norm.length === 3 ? `${norm}.*` : `${formatCode(system, norm)}*`
}

/** An entry as people write it: `F20.0`, `F10.*`, `F41.*–F42.*`, `32851–32854`. */
export function displayEntryCode(p: Pattern): string {
  const one = (norm: string) =>
    isWildcard(p) ? wildcardText(p.codeSystem, norm) : formatCode(p.codeSystem, norm)
  if (p.matchKind === 'range' && p.rangeEndNorm !== null) {
    return `${one(p.codeNorm)}–${one(p.rangeEndNorm)}`
  }
  return one(p.codeNorm)
}

const qualificationRank = (q: Qualification) => qualifications.indexOf(q)
const kindRank: Record<MatchKind, string> = { exact: '0', prefix: '1', range: '2' }
/** Two-digit sort prefix per code system, in display order. */
const systemOrder = Object.fromEntries(
  codeSystems.map((s, i) => [s, String(i).padStart(2, '0')]),
) as Record<CodeSystem, string>

/** The entry to show when a state has several: the one that qualifies most on its own. */
function best(list: readonly CompareEntry[]): CompareEntry | undefined {
  let pick: CompareEntry | undefined
  for (const e of list) {
    if (!pick || qualificationRank(e.qualification) < qualificationRank(pick.qualification)) {
      pick = e
    }
  }
  return pick
}

const toMatch = (e: CompareEntry): CompareMatch => ({
  display: displayEntryCode(e),
  tier: e.tier,
  qualification: e.qualification,
  qualificationBasis: e.qualificationBasis,
  stateCategory: e.stateCategory,
  stateSubcategory: e.stateSubcategory,
  federalCategory: e.federalCategory,
})

/** An entry with its pattern key, computed once. */
interface Keyed {
  e: CompareEntry
  key: string
}

const byNorm = (a: Keyed, b: Keyed) =>
  a.e.codeNorm < b.e.codeNorm ? -1 : a.e.codeNorm > b.e.codeNorm ? 1 : 0

/** One state's entries, indexed so each cell costs a few map reads, not a scan. */
class StateIndex {
  private readonly byKey = new Map<string, CompareEntry[]>()
  /** Wildcards (prefixes, exact codes with children) by system and start. */
  private readonly wildcards = new Map<string, Keyed[]>()
  private readonly ranges = new Map<CodeSystem, Keyed[]>()
  /** Every entry by system, sorted by start, for "narrower" lookups; built when first needed. */
  private sorted: Map<CodeSystem, Keyed[]> | null = null

  constructor(private readonly entries: readonly Keyed[]) {
    for (const k of entries) {
      push(this.byKey, k.key, k.e)
      if (k.e.matchKind === 'range') push(this.ranges, k.e.codeSystem, k)
      else if (isWildcard(k.e)) push(this.wildcards, `${k.e.codeSystem}|${k.e.codeNorm}`, k)
    }
  }

  cell(row: Pattern, key: string): CompareCell {
    const exact = best(this.byKey.get(key) ?? [])
    if (exact) return { status: 'exact', match: toMatch(exact), narrowerCount: 0 }

    const covering = this.covering(row, key)
    if (covering) return { status: 'covered', match: toMatch(covering), narrowerCount: 0 }

    const narrower = isSingle(row) ? 0 : this.narrowerCount(row, key)
    return narrower > 0
      ? { status: 'narrower', match: null, narrowerCount: narrower }
      : { status: 'not_listed', match: null, narrowerCount: 0 }
  }

  /** A broader entry that contains the whole row. */
  private covering(row: Pattern, key: string): CompareEntry | undefined {
    const start = { system: row.codeSystem, codeNorm: row.codeNorm }
    const end =
      row.matchKind === 'range' && row.rangeEndNorm !== null
        ? { system: row.codeSystem, codeNorm: row.rangeEndNorm }
        : start
    const found: CompareEntry[] = []
    // Only wildcards and ranges can contain another entry: a single code never contains a
    // wildcard of the same characters, so single codes are not in either index.
    const consider = (k: Keyed) => {
      if (k.key === key) return
      if (entryCovers(k.e, start) && entryCovers(k.e, end)) found.push(k.e)
    }
    for (let n = 1; n <= row.codeNorm.length; n++) {
      for (const k of this.wildcards.get(`${row.codeSystem}|${row.codeNorm.slice(0, n)}`) ?? []) {
        consider(k)
      }
    }
    for (const k of this.ranges.get(row.codeSystem) ?? []) consider(k)
    return best(found)
  }

  /** Entries inside a wildcard or range row (that do not contain it). */
  private narrowerCount(row: Pattern, key: string): number {
    if (this.sorted === null) {
      this.sorted = new Map()
      for (const k of this.entries) push(this.sorted, k.e.codeSystem, k)
      for (const list of this.sorted.values()) list.sort(byNorm)
    }
    const list = this.sorted.get(row.codeSystem) ?? []
    const last =
      row.matchKind === 'range' && row.rangeEndNorm !== null ? row.rangeEndNorm : row.codeNorm
    const rowEntry: Pattern = {
      ...row,
      includesChildren: isWildcard(row) ? 1 : row.includesChildren,
    }
    let count = 0
    for (let i = lowerBound(list, row.codeNorm); i < list.length; i++) {
      const k = list[i]
      if (!k || k.e.codeNorm.slice(0, last.length) > last) break
      if (k.key === key) continue
      const inside =
        entryCovers(rowEntry, { system: k.e.codeSystem, codeNorm: k.e.codeNorm }) &&
        (k.e.rangeEndNorm === null ||
          entryCovers(rowEntry, { system: k.e.codeSystem, codeNorm: k.e.rangeEndNorm }))
      if (inside) count += 1
    }
    return count
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

function lowerBound(list: readonly Keyed[], norm: string): number {
  let lo = 0
  let hi = list.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const k = list[mid]
    if (k && k.e.codeNorm < norm) lo = mid + 1
    else hi = mid
  }
  return lo
}

interface RowSeed {
  pattern: CompareEntry
  key: string
  /** Sorts by code system, code, kind, range end, with plain string comparison. */
  sortKey: string
  descriptions: Map<string, string>
}

/**
 * The compare table: rows from the selected states' entries in the category (and code system,
 * and "qualifies alone" when asked), sorted by code, one page of them with a cell per state.
 * `allRows` returns every row (the CSV download). Built for the Workers Free plan's 10 ms CPU:
 * one pass over the entries, string sort keys, and cells only for the rows returned.
 */
export function buildCompare(
  { query, states, entries }: CompareInput,
  { allRows = false }: { allRows?: boolean } = {},
): CompareResult {
  const known = new Map(states.map((s) => [s.id, s]))
  const columns = query.states.flatMap((id) => known.get(id) ?? [])
  const selected = new Set(columns.map((s) => s.id))
  const ownKey =
    query.ownState === undefined ? null : mappingKey(query.ownCategory ?? '', query.ownSubcategory)

  const byState = new Map<string, Keyed[]>()
  const seeds = new Map<string, RowSeed>()
  for (const e of entries) {
    if (!selected.has(e.stateId)) continue
    const key = comparePatternKey(e)
    push(byState, e.stateId, { e, key })
    if (query.system !== undefined && e.codeSystem !== query.system) continue
    if (query.alone && e.qualification !== 'standalone') continue
    const inCategory =
      ownKey === null
        ? e.federalCategory === query.category
        : e.stateId === query.ownState && mappingKey(e.stateCategory, e.stateSubcategory) === ownKey
    if (!inCategory) continue
    let seed = seeds.get(key)
    if (!seed) {
      seed = {
        pattern: e,
        key,
        sortKey: `${systemOrder[e.codeSystem]}\u0000${e.codeNorm}\u0000${kindRank[e.matchKind]}\u0000${e.rangeEndNorm ?? ''}`,
        descriptions: new Map<string, string>(),
      }
      seeds.set(key, seed)
    }
    if (e.descriptionPublished && !seed.descriptions.has(e.stateId)) {
      seed.descriptions.set(e.stateId, e.descriptionPublished)
    }
  }

  const ordered = [...seeds.values()].sort((a, b) =>
    a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0,
  )

  const totalRows = ordered.length
  const pageCount = Math.max(1, Math.ceil(totalRows / COMPARE_PAGE_SIZE))
  const page = Math.min(query.page, pageCount)
  const shown = allRows
    ? ordered
    : ordered.slice((page - 1) * COMPARE_PAGE_SIZE, page * COMPARE_PAGE_SIZE)

  const indexes = new Map(columns.map((s) => [s.id, new StateIndex(byState.get(s.id) ?? [])]))
  const rows = shown.map(({ pattern, key, descriptions }): CompareRow => {
    const describedBy = columns.find((s) => descriptions.has(s.id))
    return {
      codeSystem: pattern.codeSystem,
      codeNorm: pattern.codeNorm,
      matchKind: pattern.matchKind,
      rangeEndNorm: pattern.matchKind === 'range' ? pattern.rangeEndNorm : null,
      wildcard: isWildcard(pattern),
      display: displayEntryCode(pattern),
      codePath: isSingle(pattern) ? codeUrlPath(pattern.codeSystem, pattern.codeNorm) : null,
      description: describedBy ? (descriptions.get(describedBy.id) ?? null) : null,
      descriptionSource: describedBy?.id ?? null,
      cells: columns.map((s) => {
        const index = indexes.get(s.id)
        return s.published && index
          ? index.cell(pattern, key)
          : { status: 'no_list', match: null, narrowerCount: 0 }
      }),
    }
  })

  return {
    states: columns,
    totalRows,
    page,
    pageSize: COMPARE_PAGE_SIZE,
    pageCount,
    rows,
  }
}

// ---------------------------------------------------------------------------------------------
// Wording, shared by the Vue page, the server-rendered HTML and the CSV

/** The cell's first line: `Listed`, `Covered by F20.*`, `3 narrower codes listed`. */
export function compareCellText(cell: CompareCell): string {
  switch (cell.status) {
    case 'covered':
      return cell.match ? `Covered by ${cell.match.display}` : compareStatusLabels.covered
    case 'narrower':
      return cell.narrowerCount === 1
        ? '1 narrower code listed'
        : `${String(cell.narrowerCount)} narrower codes listed`
    default:
      return compareStatusLabels[cell.status]
  }
}

/** The state's rule for the entry: `Qualifies alone`, `Needs another code (inferred)`. */
export function compareQualificationText(match: CompareMatch): string {
  const label = qualificationLabels[match.qualification]
  return match.qualificationBasis === 'inferred' ? `${label} (inferred)` : label
}

/**
 * Where the state files the entry, when that is not the category being compared: the state's
 * own category name, or the federal category's label when the state has no categories.
 */
export function compareFiledUnder(
  query: Pick<CompareQuery, 'category' | 'ownState' | 'ownCategory' | 'ownSubcategory'>,
  stateId: string,
  match: CompareMatch,
): string | null {
  if (query.category !== undefined) {
    if (match.federalCategory === query.category) return null
  } else if (
    stateId === query.ownState &&
    mappingKey(match.stateCategory, match.stateSubcategory) ===
      mappingKey(query.ownCategory ?? '', query.ownSubcategory)
  ) {
    return null
  }
  return match.stateCategory === '' && match.stateSubcategory === ''
    ? federalCategoryInfo[match.federalCategory].label
    : stateCategoryName(match.stateCategory, match.stateSubcategory)
}

/** What the table compares: a federal category's label, or `Montana: SMI`. */
export function compareSubject(
  query: Pick<CompareQuery, 'category' | 'ownState' | 'ownCategory' | 'ownSubcategory'>,
  stateName: (id: string) => string,
): string {
  if (query.category !== undefined) return federalCategoryInfo[query.category].label
  return `${stateName(query.ownState ?? '')}: ${stateCategoryName(query.ownCategory ?? '', query.ownSubcategory)}`
}

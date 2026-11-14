import { z } from 'zod'

import { categoryLabel } from './category-mapping'
import type { CodeSystem, MatchKind } from './enums'
import { icd10cmChapterOf } from './icd-chapters'
import { type LawCategory, lawCategories } from './state-federal'

// Federal categories suggested by code (docs/data-model.md, "Federal categories", rule 5;
// project lead, 2026-11-13). Some states publish a federal category per code (Indiana's Tier 1
// column, `entries.state_federal_categories`): those published entries are the reference. Any
// other ICD-10-CM entry gets a suggestion from them, most specific first:
//
// 1. `exact`: the reference lists the same code (several reference states: their union).
// 2. `category3`: the most common category among the reference codes with the same first 3
//    characters (a tie: the union of the tied ones).
// 3. `chapter`: the ICD-10-CM chapter, only when the reference has at least CHAPTER_MIN_CODES
//    codes in it and at least CHAPTER_MIN_SHARE of them share one category; never the chapters
//    in SUGGESTION_EXCLUDED_CHAPTERS.
//
// A wildcard (`prefix`) or range entry is looked up by its own code_norm (a range by its start),
// so in practice by its 3-character category. Only the five law categories are suggested.

/** The fewest reference codes in a chapter before the chapter level suggests anything. */
export const CHAPTER_MIN_CODES = 20
/** The share of a chapter's reference codes that must share one category. */
export const CHAPTER_MIN_SHARE = 0.9
/**
 * Chapters the chapter level never uses. Chapter 5 (F codes, mental and behavioural): Indiana
 * leaves behavioural health out of Tier 1 on purpose, so its F codes are nearly all substance
 * use, and the chapter would label e.g. schizophrenia (F20) as SUD.
 */
export const SUGGESTION_EXCLUDED_CHAPTERS: readonly number[] = [5]

export const suggestionLevels = ['exact', 'category3', 'chapter'] as const
export type SuggestionLevel = (typeof suggestionLevels)[number]

/** One published reference entry: a code the state gave federal categories. */
export interface SuggestionReferenceRow {
  stateId: string
  stateName: string
  codeNorm: string
  categories: readonly LawCategory[]
}

interface Tally {
  /** Codes counted (a code with two categories counts once here, once per category below). */
  codes: number
  byCategory: Map<LawCategory, number>
  states: Set<string>
}

export interface SuggestionReference {
  exact: Map<string, { categories: Set<LawCategory>; states: Set<string> }>
  category3: Map<string, Tally>
  chapter: Map<number, Tally>
  /** Reference state id → name. */
  names: Map<string, string>
}

function tally<K>(map: Map<K, Tally>, key: K, row: SuggestionReferenceRow): void {
  const t: Tally = map.get(key) ?? {
    codes: 0,
    byCategory: new Map<LawCategory, number>(),
    states: new Set<string>(),
  }
  t.codes += 1
  for (const c of row.categories) t.byCategory.set(c, (t.byCategory.get(c) ?? 0) + 1)
  t.states.add(row.stateId)
  map.set(key, t)
}

/** The lookups `suggestFederal` reads, built once per request from the reference rows. */
export function buildSuggestionReference(
  rows: readonly SuggestionReferenceRow[],
): SuggestionReference {
  const ref: SuggestionReference = {
    exact: new Map(),
    category3: new Map(),
    chapter: new Map(),
    names: new Map(),
  }
  for (const row of rows) {
    if (row.categories.length === 0) continue
    const code = row.codeNorm.toUpperCase()
    ref.names.set(row.stateId, row.stateName)
    const e = ref.exact.get(code) ?? { categories: new Set<LawCategory>(), states: new Set() }
    for (const c of row.categories) e.categories.add(c)
    e.states.add(row.stateId)
    ref.exact.set(code, e)
    tally(ref.category3, code.slice(0, 3), row)
    const chapter = icd10cmChapterOf(code)
    if (chapter) tally(ref.chapter, chapter.number, row)
  }
  return ref
}

export interface FederalSuggestion {
  categories: LawCategory[]
  level: SuggestionLevel
  referenceStateIds: string[]
}

const ordered = (set: ReadonlySet<LawCategory>) => lawCategories.filter((c) => set.has(c))

/** The categories with the highest count (ties: all of them). */
function mostCommon(t: Tally): { categories: LawCategory[]; n: number } {
  const top = Math.max(0, ...t.byCategory.values())
  const set = new Set([...t.byCategory].filter(([, n]) => n === top).map(([c]) => c))
  return { categories: ordered(set), n: top }
}

/** The suggestion for one entry, or null (not ICD-10-CM, or nothing close enough). */
export function suggestFederal(
  entry: { codeSystem: CodeSystem; codeNorm: string; matchKind: MatchKind },
  ref: SuggestionReference,
): FederalSuggestion | null {
  if (entry.codeSystem !== 'icd10cm' || entry.codeNorm === '') return null
  const code = entry.codeNorm.toUpperCase()
  const exact = ref.exact.get(code)
  if (exact) {
    return {
      categories: ordered(exact.categories),
      level: 'exact',
      referenceStateIds: [...exact.states].sort(),
    }
  }
  const cat3 = ref.category3.get(code.slice(0, 3))
  if (cat3) {
    return {
      categories: mostCommon(cat3).categories,
      level: 'category3',
      referenceStateIds: [...cat3.states].sort(),
    }
  }
  const chapter = icd10cmChapterOf(code)
  if (!chapter || SUGGESTION_EXCLUDED_CHAPTERS.includes(chapter.number)) return null
  const ch = ref.chapter.get(chapter.number)
  if (!ch || ch.codes < CHAPTER_MIN_CODES) return null
  const top = mostCommon(ch)
  if (top.categories.length !== 1 || top.n / ch.codes < CHAPTER_MIN_SHARE) return null
  return { categories: top.categories, level: 'chapter', referenceStateIds: [...ch.states].sort() }
}

/** An entry's stored suggestion, as public and admin reads see it. */
export interface StoredSuggestion {
  categories: LawCategory[]
  /** An admin confirmed it (every row of the entry reviewed). */
  reviewed: boolean
  /** The reference states' names, for "suggested from Indiana’s list". */
  referenceNames: string[]
}

/**
 * Reads `suggestionSql` (apps/api/src/db/federal.ts): `category|reviewed|state name` per row,
 * joined by ";". Null when the entry has none, or the text holds no known category.
 */
export function decodeSuggestion(text: string | null | undefined): StoredSuggestion | null {
  if (text === null || text === undefined || text === '') return null
  const known = new Set<string>(lawCategories)
  const categories = new Set<LawCategory>()
  const names = new Set<string>()
  let reviewed = true
  for (const item of text.split(';')) {
    const [category, flag, name] = item.split('|')
    if (category === undefined || !known.has(category)) continue
    categories.add(category as LawCategory)
    if (flag !== '1') reviewed = false
    if (name) names.add(name)
  }
  if (categories.size === 0) return null
  return { categories: ordered(categories), reviewed, referenceNames: [...names].sort() }
}

/** "suggested from Indiana’s list" (provisional wording, docs/legal-review.md). */
export function suggestionFromText(names: readonly string[]): string {
  const owners = names.map((n) => `${n}’s`)
  if (owners.length <= 1) return `suggested from ${owners[0] ?? 'another state’s'} list`
  return `suggested from ${owners.slice(0, -1).join(', ')} and ${owners.at(-1) ?? ''} lists`
}

// ---------------------------------------------------------------------------------------------
// The admin button "Re-run automatic suggestions": preview, then save with the preview's token.

const law = z.enum(lawCategories)

/** One entry of the re-run: its suggestion now and after. */
export interface SuggestionChange {
  entryId: number
  code: string
  description: string | null
  /** Reviewed suggestions are kept as they are. */
  reviewed: boolean
  before: readonly LawCategory[]
  after: readonly LawCategory[]
}

export const suggestionRunPreviewSchema = z.object({
  token: z.string(),
  /** The reference states, by name. */
  reference: z.array(z.string()),
  /** Published ICD-10-CM entries the run looked at (not stated by the state). */
  entries: z.number().int().nonnegative(),
  gain: z.number().int().nonnegative(),
  change: z.number().int().nonnegative(),
  lose: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  /** Entries whose suggestion an admin confirmed: never changed by a re-run. */
  keptReviewed: z.number().int().nonnegative(),
  /** Entries gaining or losing each federal category. */
  byCategory: z.array(
    z.object({
      federalCategory: law,
      gain: z.number().int().nonnegative(),
      lose: z.number().int().nonnegative(),
    }),
  ),
  sample: z.array(
    z.object({
      code: z.string(),
      description: z.string().nullable(),
      before: z.array(law),
      after: z.array(law),
    }),
  ),
})
export type SuggestionRunPreview = z.infer<typeof suggestionRunPreviewSchema>

/** Body of `POST /api/admin/states/:stateId/categories/suggestions/run`. */
export const suggestionRunSaveSchema = z.object({ token: z.string().min(1).max(128) })

/** Body of `POST /api/admin/states/:stateId/categories/suggestions/confirm`. */
export const suggestionConfirmSchema = z.object({
  items: z
    .array(z.object({ stateCategory: categoryLabel, stateSubcategory: categoryLabel }))
    .min(1)
    .max(200),
})

const same = (a: readonly LawCategory[], b: readonly LawCategory[]) =>
  a.length === b.length && a.every((c, i) => b[i] === c)

/** The preview's counts and sample (without token, reference or entry count). */
export function diffSuggestions(
  changes: readonly SuggestionChange[],
  sampleSize: number,
): Omit<SuggestionRunPreview, 'token' | 'reference' | 'entries'> {
  let gain = 0
  let change = 0
  let lose = 0
  let unchanged = 0
  let keptReviewed = 0
  const gains = new Map<LawCategory, number>()
  const losses = new Map<LawCategory, number>()
  const sample: SuggestionRunPreview['sample'] = []
  for (const c of changes) {
    if (c.reviewed) {
      keptReviewed += 1
      continue
    }
    if (same(c.before, c.after)) {
      if (c.after.length > 0) unchanged += 1
      continue
    }
    if (c.before.length === 0) gain += 1
    else if (c.after.length === 0) lose += 1
    else change += 1
    for (const f of c.after) if (!c.before.includes(f)) gains.set(f, (gains.get(f) ?? 0) + 1)
    for (const f of c.before) if (!c.after.includes(f)) losses.set(f, (losses.get(f) ?? 0) + 1)
    if (sample.length < sampleSize) {
      sample.push({
        code: c.code,
        description: c.description,
        before: [...c.before],
        after: [...c.after],
      })
    }
  }
  return {
    gain,
    change,
    lose,
    unchanged,
    keptReviewed,
    byCategory: lawCategories
      .filter((f) => gains.has(f) || losses.has(f))
      .map((f) => ({ federalCategory: f, gain: gains.get(f) ?? 0, lose: losses.get(f) ?? 0 })),
    sample,
  }
}

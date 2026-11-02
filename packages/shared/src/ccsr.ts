// CCSR lookup (docs/data-model.md, "CCSR reference data"). `ref_ccsr` is stored by prefix: when
// every ICD-10-CM code under a prefix has the same CCSR groups, the prefix has the rows instead
// of each code. A code's groups are those of its longest prefix (3+ characters) that has rows.
// That also gives codes newer than the CCSR release their parent's groups.
//
// Source: Clinical Classifications Software Refined (CCSR) for ICD-10-CM Diagnoses, v2026.1.
// Healthcare Cost and Utilization Project (HCUP). Agency for Healthcare Research and Quality,
// Rockville, MD.
//
// No imports: packages/reference-data loads this file directly in Node (type stripping).

/** A CCSR category id: body system prefix and number, e.g. `MBD001`. */
export const CCSR_CATEGORY_PATTERN = /^[A-Z]{3}\d{3}$/

/** The shortest prefix `ref_ccsr` stores: an ICD-10-CM category (`F20`). */
export const CCSR_MIN_PREFIX = 3

/** One `ref_ccsr` row. */
export interface CcsrRow {
  /** ICD-10-CM code or prefix, no dot. */
  codeNorm: string
  ccsrCategory: string
  /** The CCSR inpatient default for the codes under `codeNorm`. */
  isDefault: 0 | 1 | boolean
}

export interface CcsrGroups {
  /** The `ref_ccsr` key the groups came from: the code itself or a prefix of it. */
  prefix: string
  categories: string[]
  /** NULL when the inpatient default is "unacceptable principal diagnosis" (XXX000). */
  defaultCategory: string | null
}

/** The keys to look up for a code, longest first: `F3101` → `F3101`, `F310`, `F31`. */
export function ccsrLookupPrefixes(codeNorm: string): string[] {
  const prefixes: string[] = []
  for (let length = codeNorm.length; length >= CCSR_MIN_PREFIX; length--) {
    prefixes.push(codeNorm.slice(0, length))
  }
  return prefixes
}

/**
 * The CCSR groups of a code from candidate `ref_ccsr` rows (typically those whose key is in
 * `ccsrLookupPrefixes(code)`): the rows of the longest matching prefix. Null when none match.
 */
export function ccsrGroupsOf(codeNorm: string, rows: readonly CcsrRow[]): CcsrGroups | null {
  for (const prefix of ccsrLookupPrefixes(codeNorm)) {
    const matching = rows.filter((r) => r.codeNorm === prefix)
    if (matching.length === 0) continue
    const categories = [...new Set(matching.map((r) => r.ccsrCategory))].sort()
    const defaultRow = matching.find((r) => r.isDefault === 1 || r.isDefault === true)
    return { prefix, categories, defaultCategory: defaultRow?.ccsrCategory ?? null }
  }
  return null
}

/** `ref_ccsr` rows by key, plus the keys in sorted order for prefix and range scans. */
export interface CcsrIndex {
  byKey: ReadonlyMap<string, readonly string[]>
  /** Sorted by code point, which for these ASCII keys is SQLite's BINARY order. */
  keys: readonly string[]
}

export function ccsrIndex(rows: readonly CcsrRow[]): CcsrIndex {
  const byKey = new Map<string, string[]>()
  for (const r of rows) {
    const groups = byKey.get(r.codeNorm) ?? []
    if (!groups.includes(r.ccsrCategory)) groups.push(r.ccsrCategory)
    byKey.set(r.codeNorm, groups)
  }
  const keys = [...byKey.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return { byKey, keys }
}

/** The first index in sorted `keys` whose key is >= `value`. */
function lowerBound(keys: readonly string[], value: string): number {
  let lo = 0
  let hi = keys.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if ((keys[mid] ?? '') < value) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** The groups of a code by the longest-prefix rule (`ccsrGroupsOf`), from an index. */
function ownGroups(codeNorm: string, index: CcsrIndex): readonly string[] {
  for (const prefix of ccsrLookupPrefixes(codeNorm)) {
    const groups = index.byKey.get(prefix)
    if (groups) return groups
  }
  return []
}

/** The distinct groups of every `ref_ccsr` key that starts with `prefix` (the codes under it). */
export function ccsrGroupsUnder(prefix: string, index: CcsrIndex): string[] {
  const found = new Set<string>()
  for (let i = lowerBound(index.keys, prefix); i < index.keys.length; i++) {
    const key = index.keys[i] ?? ''
    if (!key.startsWith(prefix)) break
    for (const g of index.byKey.get(key) ?? []) found.add(g)
  }
  return [...found].sort()
}

/** The fields of an entry that say which codes it covers. */
export interface CcsrEntry {
  codeNorm: string
  matchKind: 'exact' | 'prefix' | 'range'
  rangeEndNorm: string | null
  /** 1: the entry covers child codes (a wildcard). */
  includesChildren: number | null
}

/**
 * The CCSR groups of the codes an ICD-10-CM entry covers (docs/data-model.md, "CCSR reference
 * data"):
 * - an exact code: its own groups by the longest-prefix rule; a header with none of its own
 *   (`F31`) takes the groups of the codes under it;
 * - a wildcard (prefix, or includes children): its own groups plus those of the codes under it;
 * - a range: the groups of every key from its start through its end, and of the codes under
 *   its end.
 */
export function ccsrGroupsCovered(entry: CcsrEntry, index: CcsrIndex): string[] {
  const found = new Set<string>(ownGroups(entry.codeNorm, index))
  const add = (groups: readonly string[]) => {
    for (const g of groups) found.add(g)
  }
  if (entry.matchKind === 'range' && entry.rangeEndNorm !== null) {
    const end = entry.rangeEndNorm
    for (let i = lowerBound(index.keys, entry.codeNorm); i < index.keys.length; i++) {
      const key = index.keys[i] ?? ''
      if (key > end && !key.startsWith(end)) break
      add(index.byKey.get(key) ?? [])
    }
  } else if (entry.matchKind === 'prefix' || entry.includesChildren === 1 || found.size === 0) {
    add(ccsrGroupsUnder(entry.codeNorm, index))
  }
  return [...found].sort()
}

/**
 * The `ref_ccsr` key ranges to read for a set of entries, as half-open `[from, to)` ranges:
 * each ICD-10-CM category (3 characters) an entry touches, from its start's category through
 * its end's. Every key the lookup, the "codes under" rule and ranges need lies inside.
 */
export function ccsrKeyRanges(
  entries: readonly { codeNorm: string; rangeEndNorm: string | null }[],
): { from: string; to: string }[] {
  const ranges = entries
    .filter((e) => e.codeNorm.length >= CCSR_MIN_PREFIX)
    .map((e) => {
      const from = e.codeNorm.slice(0, CCSR_MIN_PREFIX)
      const end = (e.rangeEndNorm ?? e.codeNorm).slice(0, CCSR_MIN_PREFIX)
      return { from, to: `${end < from ? from : end}￿` }
    })
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
  const merged: { from: string; to: string }[] = []
  for (const r of ranges) {
    const last = merged.at(-1)
    if (last && r.from <= last.to) {
      if (r.to > last.to) last.to = r.to
    } else merged.push({ ...r })
  }
  return merged
}

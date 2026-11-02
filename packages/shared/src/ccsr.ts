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

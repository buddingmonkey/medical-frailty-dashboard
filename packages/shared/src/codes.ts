// Code normalization (docs/data-model.md, "Code normalization"). Pure functions, no I/O: the
// browser runs them while parsing a state file, and the API runs them again on every row.
//
// A source cell ("E1037-E1224 and E1229-E1295") becomes one ParsedCode per code, wildcard or
// range. Anything we cannot read safely becomes a CodeProblem and stops for manual entry; we
// never guess (a truncated range end, for example). Flags mark entries that are usable but need
// an admin's decision.
import type { CodeSystem, MatchKind } from './enums'

export interface ParseOptions {
  /** The code system from the source's column or section. Wins over inference. */
  system?: CodeSystem
  /** The source writes ICD-10-CM codes without dots (NE), so `A0103` could be ICD or HCPCS. */
  undottedIcd?: boolean
}

/** Usable, but an admin should look. */
export type CodeFlag =
  /** A bare 3-character category (`F20`, `D80-D83`): only that code, or the whole category? */
  | 'category_scope'
  /** Letter + 4 digits in an undotted-ICD source: ICD-10-CM or HCPCS? Check `ref_codes`. */
  | 'system_ambiguous'
  /** A range with a wildcard on one end only (`M30-M31.*`), read as whole categories. */
  | 'mixed_wildcard_range'

/** Not usable: the row needs manual entry. */
export type CodeProblemKind =
  | 'empty'
  | 'too_long'
  | 'unrecognized'
  | 'system_mismatch'
  | 'truncated_range'
  | 'unclear_range'
  | 'reversed_range'
  | 'mixed_system_range'

export interface ParsedCode {
  /** The text as published, for this one code or range. */
  rawCode: string
  codeSystem: CodeSystem
  /** Uppercase, no dots or spaces. For prefixes and wildcard ranges, the prefix. */
  codeNorm: string
  matchKind: MatchKind
  rangeEndNorm: string | null
  /** 1: covers child codes; 0: these codes only; null: unclear (see `category_scope`). */
  includesChildren: 0 | 1 | null
  flags: CodeFlag[]
}

export interface CodeProblem {
  raw: string
  problem: CodeProblemKind
  message: string
}

export interface ParsedCell {
  codes: ParsedCode[]
  problems: CodeProblem[]
}

// ---------------------------------------------------------------------------------------------
// Shapes (after normalizeCode: uppercase, no dots or spaces)

/**
 * ICD-10-CM: letter, digit, alphanumeric, then up to 4 more (7 characters at most). FY2027
 * added the first codes with a letter in 2nd place, `QA0`–`QA1`; only `QA` is allowed, so a
 * category name like `SMI` in a code column is not read as a code. A new family fails the
 * reference-data build loudly (packages/reference-data).
 */
const ICD_CM = /^(?:[A-Z]\d|QA)[0-9A-Z][0-9A-Z]{0,4}$/
/** Dotted form as published: `F20.0`, `C7A.010`, `S14.111A`. */
const ICD_CM_DOTTED = /^(?:[A-Z]\d|QA)[0-9A-Z]\.[0-9A-Z]{1,4}$/
/** ICD-10-PCS: always 7 alphanumerics (no I or O). Only set from the source, never inferred. */
const ICD_PCS = /^[0-9A-HJ-NP-Z]{7}$/
/** CPT: 5 digits, or 4 digits + F (Category II), T (Category III) or U (PLA). */
const CPT = /^(?:\d{5}|\d{4}[FTU])$/
/** HCPCS Level II: a letter A–V and 4 digits. */
const HCPCS = /^[A-V]\d{4}$/
/** UB-04 revenue codes: 4 digits, often printed without the leading zero. */
const REVENUE = /^\d{3,4}$/
/** State-published drug class codes (LA): short alphanumerics. */
const DRUG_CLASS = /^[0-9A-Z]{2,6}$/
const OTHER = /^[0-9A-Z]{1,20}$/

const SHAPES: Record<CodeSystem, RegExp | null> = {
  icd10cm: ICD_CM,
  icd10pcs: ICD_PCS,
  cpt: CPT,
  hcpcs: HCPCS,
  // No state in the seed set publishes NDCs. Add parsing when one does.
  ndc: null,
  revenue: REVENUE,
  drug_class: DRUG_CLASS,
  other: OTHER,
}

/** Uppercase, trimmed, without dots or inner spaces: `f20.0 ` → `F200`. */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[.\s]/g, '')
}

/**
 * Splits a source cell into single codes or ranges: on new lines, commas, semicolons and the
 * word "and". Hyphens and dashes stay, because they mark ranges.
 */
export function splitCodeList(raw: string): string[] {
  return raw
    .split(/[\n\r,;]/)
    .flatMap(splitOnAnd)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

/** `33230 and 33240` → two parts. Token-based, so no regex can backtrack on long whitespace. */
function splitOnAnd(text: string): string[] {
  const parts: string[] = []
  let current: string[] = []
  for (const token of text.split(/\s/)) {
    if (token.toLowerCase() === 'and') {
      parts.push(current.join(' '))
      current = []
    } else if (token !== '') {
      current.push(token)
    }
  }
  parts.push(current.join(' '))
  return parts
}

/**
 * The code system a code's shape points to, for sources without a code-system column.
 * `ambiguous` is true when another system has the same shape (letter + 4 digits in a source
 * that writes ICD-10-CM without dots).
 */
export function inferCodeSystem(
  raw: string,
  options: Pick<ParseOptions, 'undottedIcd'> = {},
): { system: CodeSystem | null; ambiguous: boolean } {
  const text = raw.trim().toUpperCase()
  if (ICD_CM_DOTTED.test(text)) return { system: 'icd10cm', ambiguous: false }
  const norm = normalizeCode(text)
  if (CPT.test(norm)) return { system: 'cpt', ambiguous: false }
  if (REVENUE.test(norm)) return { system: 'revenue', ambiguous: false }
  if (HCPCS.test(norm)) {
    return options.undottedIcd
      ? { system: 'icd10cm', ambiguous: true }
      : { system: 'hcpcs', ambiguous: false }
  }
  if (ICD_CM.test(norm)) return { system: 'icd10cm', ambiguous: false }
  return { system: null, ambiguous: false }
}

// ---------------------------------------------------------------------------------------------
// One code (no range)

interface Single {
  system: CodeSystem
  norm: string
  /** Ended in a wildcard (`.x`, `*`, trailing X). */
  wildcard: boolean
  ambiguous: boolean
}

/**
 * `C34.x`, `Z89.*`, `S06.2*`, `D57.0X` → the prefix before the wildcard, or null. A linear scan
 * rather than a regex: a pattern like `(…*?)(X+)$` backtracks badly on long runs of X.
 */
function wildcardBase(text: string): string | null {
  let end = text.length
  while (end > 0 && (text[end - 1] === 'X' || text[end - 1] === '*')) end--
  if (end === text.length) return null
  const base = text.endsWith('.', end) ? text.slice(0, end - 1) : text.slice(0, end)
  return base.length >= 3 ? base : null
}

function parseSingle(raw: string, options: ParseOptions): Single | CodeProblemKind {
  const text = raw.trim().toUpperCase()
  if (text === '') return 'empty'

  // Wildcards exist only for ICD-10-CM. A trailing X is a wildcard; an X followed by more
  // characters is a 7th-character placeholder (`W01.0XXA`) and part of an exact code.
  const wild = wildcardBase(text)
  if (wild && (!options.system || options.system === 'icd10cm')) {
    const norm = normalizeCode(wild)
    if (ICD_CM.test(norm)) return { system: 'icd10cm', norm, wildcard: true, ambiguous: false }
  }

  const norm = normalizeCode(text)
  if (options.system) {
    const shape = SHAPES[options.system]
    if (!shape) return 'unrecognized'
    const value = options.system === 'revenue' ? norm.padStart(4, '0') : norm
    if (!shape.test(value)) return inferCodeSystem(text).system ? 'system_mismatch' : 'unrecognized'
    return { system: options.system, norm: value, wildcard: false, ambiguous: false }
  }

  const { system, ambiguous } = inferCodeSystem(text, options)
  if (!system) return 'unrecognized'
  return {
    system,
    norm: system === 'revenue' ? norm.padStart(4, '0') : norm,
    wildcard: false,
    ambiguous,
  }
}

const isCategory = (s: Single) => s.system === 'icd10cm' && s.norm.length === 3

function fromSingle(raw: string, s: Single): ParsedCode {
  const flags: CodeFlag[] = []
  if (s.ambiguous) flags.push('system_ambiguous')
  if (s.wildcard) {
    return {
      rawCode: raw,
      codeSystem: s.system,
      codeNorm: s.norm,
      matchKind: 'prefix',
      rangeEndNorm: null,
      includesChildren: 1,
      flags,
    }
  }
  const category = isCategory(s)
  if (category) flags.push('category_scope')
  return {
    rawCode: raw,
    codeSystem: s.system,
    codeNorm: s.norm,
    matchKind: 'exact',
    rangeEndNorm: null,
    includesChildren: category ? null : 0,
    flags,
  }
}

// ---------------------------------------------------------------------------------------------
// Ranges

/** Hyphen, en dash or em dash (ends are trimmed after the split). Codes never contain one. */
const RANGE_MARK = /[-\u2013\u2014]/

function parseRange(
  raw: string,
  startText: string,
  endText: string,
  options: ParseOptions,
): ParsedCode | CodeProblemKind {
  // `L89.500-L89...`: the PDF cut the column. Never guess the end.
  if (/(?:\.\.\.|…)$/.test(endText)) return 'truncated_range'

  const start = parseSingle(startText, options)
  const end = parseSingle(endText, {
    ...options,
    system: options.system ?? (typeof start === 'string' ? undefined : start.system),
  })
  if (typeof start === 'string') return start === 'empty' ? 'unrecognized' : start
  if (end === 'system_mismatch') return 'mixed_system_range'
  if (typeof end === 'string') return end === 'empty' ? 'truncated_range' : end
  if (start.system !== end.system) return 'mixed_system_range'

  const flags: CodeFlag[] = []
  if (start.ambiguous || end.ambiguous) flags.push('system_ambiguous')
  const base = {
    rawCode: raw,
    codeSystem: start.system,
    matchKind: 'range' as const,
    codeNorm: start.norm,
    rangeEndNorm: end.norm,
  }

  if (start.wildcard || end.wildcard) {
    // Whole categories (`F41.*-F42.*`); with one wildcard only (`M30-M31.*`), read the same way.
    if (start.wildcard !== end.wildcard) flags.push('mixed_wildcard_range')
    if (start.norm > end.norm) return 'reversed_range'
    return { ...base, includesChildren: 1, flags }
  }

  if (end.norm.length < start.norm.length) return 'truncated_range'
  if (end.norm.length > start.norm.length) return 'unclear_range'
  if (start.norm > end.norm) return 'reversed_range'
  const category = isCategory(start)
  if (category) flags.push('category_scope')
  return { ...base, includesChildren: category ? null : 0, flags }
}

/** The longest real cell seen is a few hundred characters (NE comma lists). */
export const MAX_CELL_LENGTH = 2_000

const MESSAGES: Record<CodeProblemKind, string> = {
  empty: 'No code in this cell.',
  too_long: `The cell is longer than ${String(MAX_CELL_LENGTH)} characters. Split it or enter it by hand.`,
  unrecognized:
    'Not a code in any known code system. Set the code system for this column or enter it by hand.',
  system_mismatch: 'The code does not fit the code system set for this column.',
  truncated_range: 'The end of this range is cut off in the source. Enter the end by hand.',
  unclear_range: 'The two ends of this range have different lengths. Enter it by hand.',
  reversed_range: 'The range ends before it starts.',
  mixed_system_range: 'The two ends of this range are in different code systems.',
}

/** Parses one source cell into codes and ranges, and reports what it could not read. */
export function parseCodeCell(raw: string, options: ParseOptions = {}): ParsedCell {
  const result: ParsedCell = { codes: [], problems: [] }
  if (raw.length > MAX_CELL_LENGTH) {
    result.problems.push({ raw: raw.slice(0, 40), problem: 'too_long', message: MESSAGES.too_long })
    return result
  }
  const parts = splitCodeList(raw)
  if (parts.length === 0) {
    result.problems.push({ raw, problem: 'empty', message: MESSAGES.empty })
    return result
  }
  for (const part of parts) {
    const ends = part.split(RANGE_MARK).map((end) => end.trim())
    const parsed =
      ends.length === 2
        ? parseRange(part, ends[0] ?? '', ends[1] ?? '', options)
        : ends.length === 1
          ? (() => {
              const single = parseSingle(part, options)
              return typeof single === 'string' ? single : fromSingle(part, single)
            })()
          : 'unrecognized'
    if (typeof parsed === 'string')
      result.problems.push({ raw: part, problem: parsed, message: MESSAGES[parsed] })
    else result.codes.push(parsed)
  }
  return result
}

// ---------------------------------------------------------------------------------------------
// Display and URLs (docs/seo.md: URLs never change once published)

/** `F200` → `F20.0` for ICD-10-CM; other systems display as stored. */
export function formatCode(system: CodeSystem, norm: string): string {
  return system === 'icd10cm' && norm.length > 3 ? `${norm.slice(0, 3)}.${norm.slice(3)}` : norm
}

const URL_SLUGS: Partial<Record<CodeSystem, string>> = {
  icd10cm: 'icd-10-cm',
  icd10pcs: 'icd-10-pcs',
  cpt: 'cpt',
  hcpcs: 'hcpcs',
  ndc: 'ndc',
  revenue: 'revenue',
  drug_class: 'drug-class',
}

/** The code page path, e.g. `/codes/icd-10-cm/F20.0`. Null for systems without pages. */
export function codeUrlPath(system: CodeSystem, norm: string): string | null {
  const slug = URL_SLUGS[system]
  return slug ? `/codes/${slug}/${encodeURIComponent(formatCode(system, norm))}` : null
}

/**
 * Reads `/codes/<slug>/<code>`. Accepts lowercase and undotted variants; when `canonicalPath`
 * differs from the request, the Worker answers with a 301. Wildcards and ranges have no page.
 */
export function parseCodeUrl(
  slug: string,
  code: string,
): { system: CodeSystem; codeNorm: string; canonicalPath: string } | null {
  const entry = Object.entries(URL_SLUGS).find(([, s]) => s === slug)
  if (!entry) return null
  const system = entry[0] as CodeSystem
  let text: string
  try {
    text = decodeURIComponent(code)
  } catch {
    return null
  }
  const parsed = parseSingle(text, { system })
  if (typeof parsed === 'string' || parsed.wildcard) return null
  const canonicalPath = codeUrlPath(system, parsed.norm)
  return canonicalPath ? { system, codeNorm: parsed.norm, canonicalPath } : null
}

// ---------------------------------------------------------------------------------------------
// Matching (docs/data-model.md, "Matching across states")

type EntryShape = Pick<
  ParsedCode,
  'codeSystem' | 'codeNorm' | 'matchKind' | 'rangeEndNorm' | 'includesChildren'
>

/**
 * Does this entry contain the code? Exact entries match themselves, plus children when
 * `includes_children = 1`. Prefixes match by prefix. Wildcard ranges (`includes_children = 1`)
 * compare the code's leading characters with each end; other ranges compare whole codes of the
 * same length. `includes_children = null` is read as 0 until an admin decides.
 */
export function entryCovers(
  entry: EntryShape,
  code: { system: CodeSystem; codeNorm: string },
): boolean {
  if (entry.codeSystem !== code.system) return false
  const c = code.codeNorm
  const start = entry.codeNorm
  switch (entry.matchKind) {
    case 'exact':
      return c === start || (entry.includesChildren === 1 && c.startsWith(start))
    case 'prefix':
      return c.startsWith(start)
    case 'range': {
      const end = entry.rangeEndNorm
      if (end === null) return false
      if (entry.includesChildren === 1) {
        return c.slice(0, start.length) >= start && c.slice(0, end.length) <= end
      }
      return c.length === start.length && c >= start && c <= end
    }
  }
}

// Review of mapped rows before they go to a draft (docs/ingestion.md, step 5). Pure functions:
// the admin's browser runs them on every edit. Each row is parsed with codes.ts; what cannot be
// read is a problem (fix or drop the row), what needs a decision is a flag (choose or accept),
// and what is only worth knowing is a note.
import {
  type CodeFlag,
  type CodeProblem,
  type ParsedCode,
  parseCodeCell,
  type ParseOptions,
} from './codes'
import type { CodeSystem, Qualification } from './enums'
import type { MappedRow } from './ingest'
import type { ReferenceIndex, RefSystem } from './reference'
import { type LawCategory, parseStateFederalCell } from './state-federal'

/** Needs the admin's decision before the row is ready. */
export type ReviewFlag =
  | CodeFlag
  | 'multiline_description'
  /** The state's federal category cell has text that is not one of the five (accept: ignore it). */
  | 'state_federal_unknown'
/** Shown, but never blocks. Duplicates are merged when the draft is built. */
export type ReviewNote =
  | 'wildcard'
  | 'duplicate'
  | 'unknown_system_text'
  /** "ICD-10-CM or HCPCS?" settled by the CMS lists: only one of them has the code. */
  | 'system_from_reference'
  /** An ICD-10-CM or HCPCS code that the CMS list for that system does not have. */
  | 'not_in_reference'

export const reviewFlagLabels: Record<ReviewFlag, string> = {
  category_scope: 'Whole category or this code only?',
  system_ambiguous: 'ICD-10-CM or HCPCS?',
  mixed_wildcard_range: 'Wildcard on one end only, read as whole categories',
  multiline_description: 'Description has a line break',
  state_federal_unknown: 'State’s federal category not recognized; accept to ignore it',
}

export const reviewNoteLabels: Record<ReviewNote, string> = {
  wildcard: 'Wildcard',
  duplicate: 'Duplicate of an earlier row',
  unknown_system_text: 'Code system text not recognized; guessed from the code',
  system_from_reference: 'Code system from the CMS code lists',
  not_in_reference: 'Not in the CMS code list for this system',
}

/** Flags that a plain "Accept" resolves. The others need a choice (scope, code system). */
export const acceptableFlags: readonly ReviewFlag[] = [
  'mixed_wildcard_range',
  'multiline_description',
  'state_federal_unknown',
]

/** The admin's changes to one row. Fields left out keep the mapped value. */
export interface RowEdit {
  rawCode?: string
  description?: string
  category?: string
  subcategory?: string
  tier?: string
  /** The state's federal category cell (`;` between two). */
  stateFederal?: string
  qualification?: Qualification
  /** `''` reads the system from the code's shape and ignores the source's column. */
  codeSystem?: CodeSystem | ''
  /** Answers `category_scope`: 1 covers the whole category, 0 this code only. */
  includesChildren?: 0 | 1
  accepted?: ReviewFlag[]
  dropped?: boolean
}

/** Edits by row key (see `reviewKeys`). */
export type ReviewEdits = Record<string, RowEdit>

export interface ReviewOptions {
  /** The source writes ICD-10-CM codes without dots (NE). */
  undottedIcd: boolean
  /** CMS code lists for the codes looked up so far (`referenceLookupCodes`). */
  reference?: ReferenceIndex
}

export type ReviewStatus = 'ready' | 'needs_review' | 'problem' | 'dropped'

export interface ReviewRow {
  key: string
  /** The row as mapped from the file. */
  source: MappedRow
  /** The row with the admin's edits. */
  row: MappedRow
  /** The code system the code was read as, if one was set (column or edit). */
  codeSystem: CodeSystem | null
  codes: ParsedCode[]
  /**
   * The state's own federal categories for the row. Empty when the cell is empty, or has text
   * that is not one of the five (flagged until accepted, which means "ignore it").
   */
  stateFederalCategories: LawCategory[]
  problems: CodeProblem[]
  openFlags: ReviewFlag[]
  acceptedFlags: ReviewFlag[]
  notes: ReviewNote[]
  edited: boolean
  dropped: boolean
  status: ReviewStatus
}

export interface ReviewSummary {
  total: number
  ready: number
  needsReview: number
  problems: number
  dropped: number
}

export interface ReviewResult {
  rows: ReviewRow[]
  summary: ReviewSummary
}

// Keys are the source text without spaces, dots, hyphens or slashes, uppercase.
// `null`: the column does not settle it (blank, or two systems); read the code's shape.
const SYSTEM_TEXT: Record<string, CodeSystem | null> = {
  '': null,
  ICD: 'icd10cm',
  ICD10: 'icd10cm',
  ICD10CM: 'icd10cm',
  DX: 'icd10cm',
  DIAGNOSIS: 'icd10cm',
  ICD10PCS: 'icd10pcs',
  PCS: 'icd10pcs',
  CPT: 'cpt',
  CPT4: 'cpt',
  HCPCS: 'hcpcs',
  HCPCSLEVELII: 'hcpcs',
  HCPCSII: 'hcpcs',
  CPTHCPCS: null,
  HCPCSCPT: null,
  REVENUE: 'revenue',
  REVENUECODE: 'revenue',
  REV: 'revenue',
  UB04: 'revenue',
  NDC: 'ndc',
  DRUGCLASS: 'drug_class',
}

/** Reads a source's code-system cell ("ICD-10", "Revenue Code"). `known` is false for text we
 * have no entry for. */
export function codeSystemFromText(text: string): { system: CodeSystem | null; known: boolean } {
  let key = ''
  for (const ch of text.slice(0, 100).toUpperCase()) {
    if ((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')) key += ch
  }
  if (key in SYSTEM_TEXT) return { system: SYSTEM_TEXT[key] ?? null, known: true }
  return { system: null, known: false }
}

/** A stable key per row: its locator, with ` #2`, ` #3` when a locator repeats. */
export function reviewKeys(rows: readonly MappedRow[]): string[] {
  const seen = new Map<string, number>()
  return rows.map((r) => {
    const n = (seen.get(r.locator) ?? 0) + 1
    seen.set(r.locator, n)
    return n === 1 ? r.locator : `${r.locator} #${String(n)}`
  })
}

const EDITABLE = [
  'rawCode',
  'description',
  'category',
  'subcategory',
  'tier',
  'stateFederal',
] as const

function applyEdit(source: MappedRow, edit: RowEdit): MappedRow {
  const row = { ...source }
  for (const field of EDITABLE) {
    const value = edit[field]
    if (value !== undefined) row[field] = value
  }
  if (edit.qualification !== undefined) row.qualification = edit.qualification
  return row
}

const duplicateKey = (code: ParsedCode, row: MappedRow) =>
  [
    code.codeSystem,
    code.codeNorm,
    code.matchKind,
    code.rangeEndNorm ?? '',
    row.category.toLowerCase(),
    row.subcategory.toLowerCase(),
  ].join('|')

const isRefSystem = (system: CodeSystem): system is RefSystem =>
  system === 'icd10cm' || system === 'hcpcs'

/** The one CMS system that has every ambiguous code in the cell, if there is one. */
function settleSystem(codes: readonly ParsedCode[], reference: ReferenceIndex): RefSystem | null {
  const ambiguous = codes.filter((c) => c.flags.includes('system_ambiguous'))
  if (ambiguous.length === 0) return null
  let settled: RefSystem | null = null
  for (const code of ambiguous) {
    const systems = reference.get(code.codeNorm)
    if (systems?.length !== 1) return null
    const [system] = systems
    if (!system || (settled && settled !== system)) return null
    settled = system
  }
  return settled
}

function notInReference(code: ParsedCode, reference: ReferenceIndex | undefined): boolean {
  if (code.matchKind !== 'exact' || !isRefSystem(code.codeSystem)) return false
  const systems = reference?.get(code.codeNorm)
  return systems !== undefined && !systems.includes(code.codeSystem)
}

/** Exact ICD-10-CM and HCPCS codes in rows that are not dropped: what to look up in ref_codes. */
export function referenceLookupCodes(result: ReviewResult): string[] {
  const codes = new Set<string>()
  for (const r of result.rows) {
    if (r.dropped) continue
    for (const c of r.codes) {
      if (c.matchKind === 'exact' && isRefSystem(c.codeSystem)) codes.add(c.codeNorm)
    }
  }
  return [...codes]
}

export function buildReview(
  rows: readonly MappedRow[],
  edits: ReviewEdits,
  options: ReviewOptions,
): ReviewResult {
  const keys = reviewKeys(rows)
  const seen = new Set<string>()
  const summary: ReviewSummary = {
    total: rows.length,
    ready: 0,
    needsReview: 0,
    problems: 0,
    dropped: 0,
  }

  const result = rows.map((source, i): ReviewRow => {
    const key = keys[i] ?? source.locator
    const edit = edits[key] ?? {}
    const row = applyEdit(source, edit)
    const notes: ReviewNote[] = []

    let codeSystem: CodeSystem | null
    if (edit.codeSystem !== undefined) {
      codeSystem = edit.codeSystem === '' ? null : edit.codeSystem
    } else {
      const hint = codeSystemFromText(row.codeSystemHint)
      if (!hint.known) notes.push('unknown_system_text')
      codeSystem = hint.system
    }
    const parseOptions: ParseOptions = { undottedIcd: options.undottedIcd }
    if (codeSystem) parseOptions.system = codeSystem
    let parsed = parseCodeCell(row.rawCode, parseOptions)
    if (!codeSystem && options.reference) {
      const settled = settleSystem(parsed.codes, options.reference)
      if (settled) {
        parsed = parseCodeCell(row.rawCode, { ...parseOptions, system: settled })
        notes.push('system_from_reference')
      }
    }
    if (options.reference && parsed.codes.some((c) => notInReference(c, options.reference))) {
      notes.push('not_in_reference')
    }

    const scope = edit.includesChildren
    const codes = parsed.codes.map((code) =>
      scope !== undefined && code.flags.includes('category_scope')
        ? {
            ...code,
            includesChildren: scope,
            flags: code.flags.filter((f) => f !== 'category_scope'),
          }
        : code,
    )

    const flags = new Set<ReviewFlag>(codes.flatMap((c) => c.flags))
    if (row.description.includes('\n')) flags.add('multiline_description')
    const stateFederal = parseStateFederalCell(row.stateFederal)
    if (stateFederal.unknown.length > 0) flags.add('state_federal_unknown')
    const accepted = new Set(edit.accepted ?? [])
    const openFlags = [...flags].filter((f) => !accepted.has(f))
    const acceptedFlags = [...flags].filter((f) => accepted.has(f))

    if (codes.some((c) => c.matchKind === 'prefix')) notes.push('wildcard')

    const dropped = edit.dropped === true
    if (!dropped) {
      const dupKeys = codes.map((c) => duplicateKey(c, row))
      if (dupKeys.length > 0 && dupKeys.some((k) => seen.has(k))) notes.push('duplicate')
      for (const k of dupKeys) seen.add(k)
    }

    const status: ReviewStatus = dropped
      ? 'dropped'
      : parsed.problems.length > 0
        ? 'problem'
        : openFlags.length > 0
          ? 'needs_review'
          : 'ready'
    if (status === 'dropped') summary.dropped++
    else if (status === 'problem') summary.problems++
    else if (status === 'needs_review') summary.needsReview++
    else summary.ready++

    const edited =
      EDITABLE.some((f) => edit[f] !== undefined && edit[f] !== source[f]) ||
      (edit.qualification !== undefined && edit.qualification !== source.qualification) ||
      edit.codeSystem !== undefined

    return {
      key,
      source,
      row,
      codeSystem,
      codes,
      stateFederalCategories: stateFederal.unknown.length > 0 ? [] : stateFederal.categories,
      problems: parsed.problems,
      openFlags,
      acceptedFlags,
      notes,
      edited,
      dropped,
      status,
    }
  })

  return { rows: result, summary }
}

/** ICD-10-CM without dots, 6 or 7 characters (`E09349`): no HCPCS or CPT code has this shape. */
const UNDOTTED_LONG_ICD = /^[A-Z]\d[0-9A-Z]{4,5}$/

/**
 * A first guess for `undottedIcd`: true when long undotted ICD-10-CM codes outnumber dotted
 * ones. Wildcards (`A15.x`) count for neither; NE writes those with a dot.
 */
export function guessUndottedIcd(rows: readonly MappedRow[]): boolean {
  let dotted = 0
  let undotted = 0
  for (const { rawCode } of rows) {
    const text = rawCode.trim().toUpperCase()
    const dot = text.indexOf('.')
    if (dot >= 0) {
      const next = text[dot + 1]
      if (next !== undefined && next !== 'X' && next !== '*') dotted++
    } else if (UNDOTTED_LONG_ICD.test(text)) {
      undotted++
    }
  }
  return undotted > dotted
}

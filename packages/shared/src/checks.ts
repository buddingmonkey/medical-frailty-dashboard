// Data checks and diff for a draft version against the published one (docs/ingestion.md,
// "Checks before publishing"). Pure functions: the admin's browser shows the report while rows
// are reviewed, and the API runs the same code again before it publishes. The caller supplies
// what needs I/O: how many rows failed validation, which states the files name, and which ICD-10-CM
// codes exist in `ref_codes`.
import { formatCode } from './codes'
import { codeSystemLabels, type CodeSystem, type MatchKind } from './enums'

/** Thresholds from docs/ingestion.md. */
export const CHECK_LIMITS = {
  /** Block when more than this share of rows failed validation or had no readable code. */
  invalidRowShare: 0.02,
  /** Typed confirmation when this share of published codes is gone, or more. */
  removedShare: 0.3,
  /** Typed confirmation when the row count changes by this share, or more. */
  rowCountChange: 0.5,
  /** Confirmation when more than this share of ICD-10-CM codes is not in ref_codes. */
  unknownIcd10cmShare: 0.1,
} as const

export interface CheckEntry {
  codeSystem: CodeSystem
  codeNorm: string
  matchKind: MatchKind
  rangeEndNorm: string | null
  stateCategory: string
  stateSubcategory: string
  descriptionPublished: string | null
  /** False for rows the source marks as not frail (GA "Yes/No" = No). */
  included: boolean
  /** Review flags (codes.ts CodeFlag) the admin has not accepted yet. */
  unresolvedFlags: readonly string[]
}

export interface CheckInput {
  stateId: string
  draft: {
    entries: CheckEntry[]
    /** Rows that failed the schema or had no readable code; not in `entries`. */
    invalidRowCount: number
    /** Titles of sources with fewer entries stored than the browser said it would send. */
    incompleteSources: string[]
    sourceSha256s: string[]
    /** States the source files name (in a header or title), as 2-letter codes. */
    namedStateIds: string[]
  }
  published: { entries: CheckEntry[]; sourceSha256s: string[] } | null
  /** The draft's ICD-10-CM codes (and range ends) that exist in ref_codes. */
  knownIcd10cm: Set<string>
}

export type CheckLevel = 'block' | 'confirm' | 'confirm_typed' | 'info'

export type CheckId =
  | 'empty'
  | 'invalid_rows'
  | 'incomplete_upload'
  | 'state_mismatch'
  | 'large_change'
  | 'code_system_missing'
  | 'category_missing'
  | 'unknown_icd10cm'
  | 'excluded_rows'
  | 'duplicates'
  | 'unresolved_flags'
  | 'same_source'

export interface CheckResult {
  id: CheckId
  level: CheckLevel
  triggered: boolean
  /** Plain-language explanation for the publish screen. */
  message: string
  count?: number
}

export interface DiffCounts {
  added: number
  removed: number
  descriptionChanged: number
  categoryChanged: number
}

export interface DiffChange {
  kind: 'added' | 'removed' | 'description_changed' | 'category_changed'
  codeSystem: CodeSystem
  /** Display form: `F20.0`, `C34*`, `32851-32854`. */
  code: string
  before: string | null
  after: string | null
}

export interface CheckReport {
  checks: CheckResult[]
  /** False while any blocking check is triggered. */
  canPublish: boolean
  diff: {
    totals: DiffCounts
    bySystem: Partial<Record<CodeSystem, DiffCounts>>
    changes: DiffChange[]
  }
}

// ---------------------------------------------------------------------------------------------

/** One code, wildcard or range, whatever category it sits under. */
const codeKey = (e: CheckEntry) =>
  [e.codeSystem, e.matchKind, e.codeNorm, e.rangeEndNorm ?? ''].join('|')
const categoryLabel = (e: CheckEntry) =>
  e.stateSubcategory ? `${e.stateCategory} / ${e.stateSubcategory}` : e.stateCategory

function displayCode(e: CheckEntry): string {
  const start = formatCode(e.codeSystem, e.codeNorm)
  if (e.matchKind === 'prefix') return `${start}*`
  if (e.matchKind === 'range' && e.rangeEndNorm) {
    return `${start}-${formatCode(e.codeSystem, e.rangeEndNorm)}`
  }
  return start
}

function groupByCode(entries: readonly CheckEntry[]): Map<string, CheckEntry[]> {
  const groups = new Map<string, CheckEntry[]>()
  for (const e of entries) {
    const key = codeKey(e)
    const group = groups.get(key)
    if (group) group.push(e)
    else groups.set(key, [e])
  }
  return groups
}

const sortedUnique = (values: (string | null)[]) =>
  [...new Set(values.filter((v): v is string => v !== null))].sort()

function diff(draft: readonly CheckEntry[], published: readonly CheckEntry[]): CheckReport['diff'] {
  const before = groupByCode(published)
  const after = groupByCode(draft)
  const changes: DiffChange[] = []
  const bySystem: Partial<Record<CodeSystem, DiffCounts>> = {}
  const totals: DiffCounts = { added: 0, removed: 0, descriptionChanged: 0, categoryChanged: 0 }
  const count = (system: CodeSystem, field: keyof DiffCounts) => {
    const counts = (bySystem[system] ??= {
      added: 0,
      removed: 0,
      descriptionChanged: 0,
      categoryChanged: 0,
    })
    counts[field]++
    totals[field]++
  }
  for (const e of [...published, ...draft]) {
    bySystem[e.codeSystem] ??= { added: 0, removed: 0, descriptionChanged: 0, categoryChanged: 0 }
  }

  for (const [key, entries] of after) {
    const [first] = entries
    if (!first) continue
    const old = before.get(key)
    if (!old) {
      count(first.codeSystem, 'added')
      changes.push({
        kind: 'added',
        codeSystem: first.codeSystem,
        code: displayCode(first),
        before: null,
        after: categoryLabel(first),
      })
      continue
    }
    const descBefore = sortedUnique(old.map((e) => e.descriptionPublished)).join('; ')
    const descAfter = sortedUnique(entries.map((e) => e.descriptionPublished)).join('; ')
    if (descBefore !== descAfter) {
      count(first.codeSystem, 'descriptionChanged')
      changes.push({
        kind: 'description_changed',
        codeSystem: first.codeSystem,
        code: displayCode(first),
        before: descBefore,
        after: descAfter,
      })
    }
    const catBefore = sortedUnique(old.map(categoryLabel)).join('; ')
    const catAfter = sortedUnique(entries.map(categoryLabel)).join('; ')
    if (catBefore !== catAfter) {
      count(first.codeSystem, 'categoryChanged')
      changes.push({
        kind: 'category_changed',
        codeSystem: first.codeSystem,
        code: displayCode(first),
        before: catBefore,
        after: catAfter,
      })
    }
  }
  for (const [key, entries] of before) {
    const [first] = entries
    if (!first || after.has(key)) continue
    count(first.codeSystem, 'removed')
    changes.push({
      kind: 'removed',
      codeSystem: first.codeSystem,
      code: displayCode(first),
      before: categoryLabel(first),
      after: null,
    })
  }
  return { totals, bySystem, changes }
}

const pct = (share: number) => `${(share * 100).toFixed(1)}%`
const n = (value: number) => value.toLocaleString('en-US')

export function runChecks(input: CheckInput): CheckReport {
  const { draft, published, stateId } = input
  const entries = draft.entries
  const prior = published?.entries ?? []
  const checks: CheckResult[] = []
  const add = (
    id: CheckId,
    level: CheckLevel,
    triggered: boolean,
    message: string,
    count?: number,
  ) =>
    checks.push(
      count === undefined
        ? { id, level, triggered, message }
        : { id, level, triggered, message, count },
    )

  add('empty', 'block', entries.length === 0, 'The draft has no rows.')

  const totalRows = entries.length + draft.invalidRowCount
  const invalidShare = totalRows === 0 ? 0 : draft.invalidRowCount / totalRows
  add(
    'invalid_rows',
    'block',
    invalidShare > CHECK_LIMITS.invalidRowShare,
    `${n(draft.invalidRowCount)} of ${n(totalRows)} rows (${pct(invalidShare)}) failed validation or have no readable code. Fix or drop them first (limit ${pct(CHECK_LIMITS.invalidRowShare)}).`,
    draft.invalidRowCount,
  )

  add(
    'incomplete_upload',
    'block',
    draft.incompleteSources.length > 0,
    `Not every row arrived for: ${draft.incompleteSources.join('; ') || 'none'}. Send those rows again.`,
    draft.incompleteSources.length,
  )

  const otherStates = [...new Set(draft.namedStateIds.filter((s) => s !== stateId))]
  add(
    'state_mismatch',
    'confirm_typed',
    otherStates.length > 0,
    `The file names ${otherStates.join(', ') || 'no other state'}, but this draft is for ${stateId}.`,
  )

  const diffResult = diff(entries, prior)
  const priorCodes = groupByCode(prior).size
  const removedShare = priorCodes === 0 ? 0 : diffResult.totals.removed / priorCodes
  const rowChange = prior.length === 0 ? 0 : Math.abs(entries.length - prior.length) / prior.length
  add(
    'large_change',
    'confirm_typed',
    published !== null &&
      (removedShare >= CHECK_LIMITS.removedShare || rowChange >= CHECK_LIMITS.rowCountChange),
    `${n(diffResult.totals.removed)} of ${n(priorCodes)} published codes (${pct(removedShare)}) are gone, and the row count changes from ${n(prior.length)} to ${n(entries.length)} (${pct(rowChange)}).`,
  )

  const draftSystems = new Set(entries.map((e) => e.codeSystem))
  const lostSystems = [...new Set(prior.map((e) => e.codeSystem))].filter(
    (s) => !draftSystems.has(s),
  )
  add(
    'code_system_missing',
    'confirm_typed',
    lostSystems.length > 0,
    `The published list has ${lostSystems.map((s) => codeSystemLabels[s]).join(', ') || 'no'} codes that the draft does not have at all.`,
    lostSystems.length,
  )

  const draftCategories = new Set(entries.map(categoryLabel))
  const lostCategories = sortedUnique(prior.map(categoryLabel)).filter(
    (c) => !draftCategories.has(c),
  )
  add(
    'category_missing',
    'confirm',
    lostCategories.length > 0,
    `Categories in the published list but not in the draft: ${lostCategories.join('; ') || 'none'}.`,
    lostCategories.length,
  )

  const icdCodes = new Set<string>()
  for (const e of entries) {
    if (e.codeSystem !== 'icd10cm') continue
    icdCodes.add(e.codeNorm)
    if (e.rangeEndNorm) icdCodes.add(e.rangeEndNorm)
  }
  const unknown = [...icdCodes].filter((c) => !input.knownIcd10cm.has(c))
  const unknownShare = icdCodes.size === 0 ? 0 : unknown.length / icdCodes.size
  add(
    'unknown_icd10cm',
    'confirm',
    unknownShare > CHECK_LIMITS.unknownIcd10cmShare,
    `${n(unknown.length)} of ${n(icdCodes.size)} ICD-10-CM codes (${pct(unknownShare)}) are not in the current CMS code set. Wrong file, or a list from another year?`,
    unknown.length,
  )

  const excluded = entries.filter((e) => !e.included).length
  add(
    'excluded_rows',
    'confirm',
    excluded > 0,
    `${n(excluded)} rows are marked by the state as not qualifying. They are stored but never shown as frail codes.`,
    excluded,
  )

  const seen = new Set<string>()
  let duplicates = 0
  for (const e of entries) {
    const key = `${codeKey(e)}|${e.stateCategory}|${e.stateSubcategory}`
    if (seen.has(key)) duplicates++
    else seen.add(key)
  }
  add(
    'duplicates',
    'info',
    duplicates > 0,
    `${n(duplicates)} rows repeat a code already listed under the same category. They are merged.`,
    duplicates,
  )

  const flagged = entries.filter((e) => e.unresolvedFlags.length > 0).length
  add(
    'unresolved_flags',
    'confirm',
    flagged > 0,
    `${n(flagged)} rows still have review flags that nobody accepted.`,
    flagged,
  )

  const sameSource =
    published !== null &&
    draft.sourceSha256s.length > 0 &&
    sortedUnique(draft.sourceSha256s).join() === sortedUnique(published.sourceSha256s).join()
  add(
    'same_source',
    'confirm',
    sameSource,
    'These are the same files as the published version. Nothing changed?',
  )

  return {
    checks,
    canPublish: !checks.some((c) => c.triggered && c.level === 'block'),
    diff: diffResult,
  }
}

export type Confirmations = Partial<Record<CheckId, { typed?: string }>>

/**
 * Publish gate: every triggered `confirm` check needs an entry, every `confirm_typed` check
 * needs the draft's state code typed, and no `block` check may be triggered.
 */
export function verifyConfirmations(
  report: CheckReport,
  stateId: string,
  given: Confirmations,
): { ok: boolean; missing: CheckId[] } {
  const missing = report.checks
    .filter((check) => {
      if (!check.triggered) return false
      switch (check.level) {
        case 'block':
          return true
        case 'confirm':
          return given[check.id] === undefined
        case 'confirm_typed':
          return given[check.id]?.typed?.trim().toUpperCase() !== stateId.toUpperCase()
        case 'info':
          return false
      }
    })
    .map((check) => check.id)
  return { ok: missing.length === 0, missing }
}

// One test per check in docs/ingestion.md ("Checks before publishing").
import { describe, expect, it } from 'vitest'

import {
  runChecks,
  verifyConfirmations,
  type CheckEntry,
  type CheckId,
  type CheckInput,
} from './checks'

const entry = (codeNorm: string, overrides: Partial<CheckEntry> = {}): CheckEntry => ({
  codeSystem: 'icd10cm',
  codeNorm,
  matchKind: 'exact',
  rangeEndNorm: null,
  stateCategory: 'SMI',
  stateSubcategory: '',
  tier: '',
  descriptionPublished: `Description of ${codeNorm}`,
  included: true,
  unresolvedFlags: [],
  ...overrides,
})

const codes = (n: number, prefix = 'F2') =>
  Array.from({ length: n }, (_, i) => entry(`${prefix}${String(i).padStart(3, '0')}`))

/** A draft identical to the published version, every code known to ref_codes. */
function base(overrides: Partial<CheckInput> = {}): CheckInput {
  const entries = codes(100)
  return {
    stateId: 'NE',
    draft: {
      entries,
      invalidRowCount: 0,
      incompleteSources: [],
      sourceSha256s: ['new'],
      namedStateIds: [],
    },
    published: { entries, sourceSha256s: ['old'] },
    knownIcd10cm: new Set(entries.map((e) => e.codeNorm)),
    ...overrides,
  }
}

const triggered = (input: CheckInput): CheckId[] =>
  runChecks(input)
    .checks.filter((c) => c.triggered)
    .map((c) => c.id)

describe('runChecks', () => {
  it('passes a clean draft that matches the published version', () => {
    const report = runChecks(base())
    expect(triggered(base())).toEqual([])
    expect(report.canPublish).toBe(true)
    expect(report.diff.totals).toEqual({
      added: 0,
      removed: 0,
      descriptionChanged: 0,
      categoryChanged: 0,
    })
  })

  it('blocks an empty draft', () => {
    const input = base()
    input.draft.entries = []
    const report = runChecks(input)
    expect(report.checks.find((c) => c.id === 'empty')).toMatchObject({
      triggered: true,
      level: 'block',
    })
    expect(report.canPublish).toBe(false)
  })

  it('blocks when more than 2% of rows are invalid, and allows 2% exactly', () => {
    const input = base()
    input.draft.invalidRowCount = 2 // 2 of 102 rows ≈ 1.96%
    expect(triggered(input)).not.toContain('invalid_rows')
    input.draft.invalidRowCount = 3 // 3 of 103 ≈ 2.9%
    expect(runChecks(input).canPublish).toBe(false)
    expect(triggered(input)).toContain('invalid_rows')
  })

  it('blocks when a source has fewer entries stored than were sent', () => {
    const input = base()
    input.draft.incompleteSources = ['Attachment B']
    expect(triggered(input)).toContain('incomplete_upload')
    expect(runChecks(input).canPublish).toBe(false)
    expect(runChecks(input).checks.find((c) => c.id === 'incomplete_upload')?.message).toContain(
      'Attachment B',
    )
  })

  it('asks for a typed confirmation when the file names another state', () => {
    const input = base()
    input.draft.namedStateIds = ['MT']
    expect(runChecks(input).checks.find((c) => c.id === 'state_mismatch')).toMatchObject({
      triggered: true,
      level: 'confirm_typed',
    })
    input.draft.namedStateIds = ['NE']
    expect(triggered(input)).not.toContain('state_mismatch')
  })

  it('asks for a typed confirmation when 30% or more of the codes are removed', () => {
    const input = base()
    input.draft.entries = codes(70) // 30 of 100 removed
    expect(triggered(input)).toContain('large_change')
    input.draft.entries = codes(71)
    expect(triggered(input)).not.toContain('large_change')
  })

  it('asks for a typed confirmation when the row count grows by 50% or more', () => {
    const input = base()
    input.draft.entries = [...codes(100), ...codes(50, 'F3')]
    input.knownIcd10cm = new Set(input.draft.entries.map((e) => e.codeNorm))
    expect(triggered(input)).toContain('large_change')
  })

  it('asks for a typed confirmation when a code system disappears (e.g. all CPT codes)', () => {
    const input = base()
    input.published = {
      entries: [...codes(100), entry('99213', { codeSystem: 'cpt' })],
      sourceSha256s: [],
    }
    const check = runChecks(input).checks.find((c) => c.id === 'code_system_missing')
    expect(check).toMatchObject({ triggered: true, level: 'confirm_typed' })
    expect(check?.message).toContain('CPT')
  })

  it('asks for confirmation when a state category disappears', () => {
    const input = base()
    input.published = {
      entries: [...codes(100), entry('F10', { stateCategory: 'SUD' })],
      sourceSha256s: [],
    }
    const check = runChecks(input).checks.find((c) => c.id === 'category_missing')
    expect(check).toMatchObject({ triggered: true, level: 'confirm' })
    expect(check?.message).toContain('SUD')
  })

  it('asks for confirmation when more than 10% of ICD-10-CM codes are not in ref_codes', () => {
    const input = base()
    input.knownIcd10cm = new Set(input.draft.entries.slice(0, 89).map((e) => e.codeNorm)) // 11 unknown
    expect(triggered(input)).toContain('unknown_icd10cm')
    input.knownIcd10cm = new Set(input.draft.entries.slice(0, 90).map((e) => e.codeNorm)) // 10 unknown
    expect(triggered(input)).not.toContain('unknown_icd10cm')
  })

  it('asks for confirmation about rows the source marks as excluded (GA "No")', () => {
    const input = base()
    input.draft.entries = [...codes(100), entry('F99', { included: false })]
    input.knownIcd10cm.add('F99')
    expect(triggered(input)).toContain('excluded_rows')
  })

  it('reports duplicates (same code and category) as info only', () => {
    const input = base()
    input.draft.entries = [...codes(100), entry('F2000')]
    const check = runChecks(input).checks.find((c) => c.id === 'duplicates')
    expect(check).toMatchObject({ triggered: true, level: 'info', count: 1 })
    expect(runChecks(input).canPublish).toBe(true)
  })

  it('does not count one code under two categories as a duplicate (MT Z74.09)', () => {
    const input = base()
    input.draft.entries = [...codes(100), entry('F2000', { stateCategory: 'SUD' })]
    expect(triggered(input)).not.toContain('duplicates')
  })

  it('does not count one code in two tiers as a duplicate (GA Attachments A and B)', () => {
    const input = base()
    input.draft.entries = [...codes(100), entry('F2000', { tier: 'Attachment B' })]
    expect(triggered(input)).not.toContain('duplicates')
  })

  it('asks for confirmation when rows still have unresolved review flags', () => {
    const input = base()
    input.draft.entries = [...codes(99), entry('F20', { unresolvedFlags: ['category_scope'] })]
    input.knownIcd10cm.add('F20')
    expect(runChecks(input).checks.find((c) => c.id === 'unresolved_flags')).toMatchObject({
      triggered: true,
      count: 1,
    })
  })

  it('asks "nothing changed?" when the source files are the same as the published ones', () => {
    const input = base()
    input.draft.sourceSha256s = ['b', 'a']
    input.published = { entries: input.draft.entries, sourceSha256s: ['a', 'b'] }
    expect(triggered(input)).toContain('same_source')
  })

  it('handles a first upload with no published version', () => {
    const input = base({ published: null })
    const report = runChecks(input)
    expect(report.canPublish).toBe(true)
    expect(report.diff.totals.added).toBe(100)
    expect(triggered(input)).toEqual([])
  })
})

describe('diff', () => {
  it('reports added, removed, description and category changes, per code system', () => {
    const published = [
      entry('F200'),
      entry('F201'),
      entry('F202', { descriptionPublished: 'Old text' }),
      entry('F203', { stateCategory: 'SMI' }),
      entry('99213', { codeSystem: 'cpt' }),
    ]
    const draft = [
      entry('F200'),
      entry('F202', { descriptionPublished: 'New text' }),
      entry('F203', { stateCategory: 'Severe neurological' }),
      entry('F204'),
    ]
    const { diff } = runChecks(
      base({
        draft: {
          entries: draft,
          invalidRowCount: 0,
          incompleteSources: [],
          sourceSha256s: [],
          namedStateIds: [],
        },
        published: { entries: published, sourceSha256s: [] },
      }),
    )
    expect(diff.totals).toEqual({ added: 1, removed: 2, descriptionChanged: 1, categoryChanged: 1 })
    expect(diff.bySystem.icd10cm).toEqual({
      added: 1,
      removed: 1,
      descriptionChanged: 1,
      categoryChanged: 1,
    })
    expect(diff.bySystem.cpt).toEqual({
      added: 0,
      removed: 1,
      descriptionChanged: 0,
      categoryChanged: 0,
    })
    expect(diff.changes.find((c) => c.kind === 'category_changed')).toMatchObject({
      code: 'F20.3',
      before: 'SMI',
      after: 'Severe neurological',
    })
  })

  it('shows a changed state federal category as a category change (Indiana re-upload)', () => {
    const published = [entry('F200', { stateCategory: 'Schizophrenia' }), entry('F201')]
    const draft = [
      entry('F200', { stateCategory: 'Schizophrenia', stateFederalCategories: ['sud'] }),
      entry('F201'),
    ]
    const { diff } = runChecks(
      base({
        draft: {
          entries: draft,
          invalidRowCount: 0,
          incompleteSources: [],
          sourceSha256s: [],
          namedStateIds: [],
        },
        published: { entries: published, sourceSha256s: [] },
      }),
    )
    expect(diff.totals.categoryChanged).toBe(1)
    expect(diff.changes).toEqual([
      {
        kind: 'category_changed',
        codeSystem: 'icd10cm',
        code: 'F20.0',
        before: 'Schizophrenia',
        after: 'Schizophrenia (state’s federal category: Substance use disorder)',
      },
    ])
  })

  it('treats a range and an exact code with the same start as different codes', () => {
    const published = [entry('32851', { codeSystem: 'cpt' })]
    const draft = [entry('32851', { codeSystem: 'cpt', matchKind: 'range', rangeEndNorm: '32854' })]
    const { diff } = runChecks(
      base({
        draft: {
          entries: draft,
          invalidRowCount: 0,
          incompleteSources: [],
          sourceSha256s: [],
          namedStateIds: [],
        },
        published: { entries: published, sourceSha256s: [] },
      }),
    )
    expect(diff.totals).toMatchObject({ added: 1, removed: 1 })
    expect(diff.changes.map((c) => c.code).sort()).toEqual(['32851', '32851-32854'])
  })
})

describe('verifyConfirmations', () => {
  const report = () => {
    const input = base()
    input.draft.namedStateIds = ['MT'] // confirm_typed
    input.draft.entries = [...codes(99), entry('F20', { unresolvedFlags: ['category_scope'] })] // confirm
    input.knownIcd10cm.add('F20')
    return runChecks(input)
  }

  it('accepts every triggered check confirmed, with the state code typed where required', () => {
    expect(
      verifyConfirmations(report(), 'NE', {
        state_mismatch: { typed: 'NE' },
        unresolved_flags: {},
      }),
    ).toEqual({ ok: true, missing: [] })
  })

  // Required test (docs/testing.md): a publish over a "confirm, typed" check fails without
  // the typed confirmation. The API test for the publish route comes in M2.
  it('refuses a typed check without the typed state code, or with the wrong one', () => {
    expect(
      verifyConfirmations(report(), 'NE', { state_mismatch: {}, unresolved_flags: {} }),
    ).toEqual({
      ok: false,
      missing: ['state_mismatch'],
    })
    expect(
      verifyConfirmations(report(), 'NE', { state_mismatch: { typed: 'MT' }, unresolved_flags: {} })
        .ok,
    ).toBe(false)
  })

  it('refuses when a confirm check is not ticked', () => {
    expect(verifyConfirmations(report(), 'NE', { state_mismatch: { typed: 'NE' } })).toEqual({
      ok: false,
      missing: ['unresolved_flags'],
    })
  })

  it('refuses a report with a blocking check, whatever is confirmed', () => {
    const input = base()
    input.draft.entries = []
    expect(verifyConfirmations(runChecks(input), 'NE', {}).ok).toBe(false)
  })
})

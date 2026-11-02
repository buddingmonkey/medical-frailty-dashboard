import { describe, expect, it } from 'vitest'

import type { MappedRow } from './ingest'
import {
  buildReview,
  codeSystemFromText,
  guessUndottedIcd,
  referenceLookupCodes,
  type ReviewEdits,
  reviewKeys,
} from './review'

const row = (rawCode: string, extra: Partial<MappedRow> = {}): MappedRow => ({
  locator: `row ${rawCode}`,
  rawCode,
  codeSystemHint: '',
  description: 'A condition',
  category: 'SMI',
  subcategory: '',
  tier: '',
  qualification: 'standalone',
  qualificationBasis: 'published',
  ...extra,
})

const review = (rows: MappedRow[], edits: ReviewEdits = {}, undottedIcd = false) =>
  buildReview(rows, edits, { undottedIcd })

describe('codeSystemFromText', () => {
  it.each([
    ['ICD-10', 'icd10cm'],
    ['ICD-10-CM', 'icd10cm'],
    ['icd 10', 'icd10cm'],
    ['ICD-10-PCS', 'icd10pcs'],
    ['CPT', 'cpt'],
    ['CPT-4', 'cpt'],
    ['HCPCS', 'hcpcs'],
    ['HCPCS Level II', 'hcpcs'],
    ['Revenue Code', 'revenue'],
    ['NDC', 'ndc'],
    ['Drug class', 'drug_class'],
  ])('reads “%s” as %s', (text, system) => {
    expect(codeSystemFromText(text)).toEqual({ system, known: true })
  })

  it('leaves a blank or combined column to inference', () => {
    expect(codeSystemFromText('')).toEqual({ system: null, known: true })
    expect(codeSystemFromText('CPT/HCPCS')).toEqual({ system: null, known: true })
  })

  it('says when it does not know the text', () => {
    expect(codeSystemFromText('Procedure')).toEqual({ system: null, known: false })
  })
})

describe('guessUndottedIcd', () => {
  it('is true when undotted ICD shapes outnumber dotted codes (NE)', () => {
    expect(guessUndottedIcd([row('A0103'), row('E09349'), row('A15.x'), row('33230')])).toBe(true)
  })

  it('is false for dotted lists (GA, LA, MT)', () => {
    expect(guessUndottedIcd([row('F20.0'), row('F01'), row('J1630'), row('C34.x')])).toBe(false)
  })
})

describe('reviewKeys', () => {
  it('uses the locator, with a suffix when a locator repeats', () => {
    expect(reviewKeys([row('A', { locator: 'p1' }), row('B', { locator: 'p1' })])).toEqual([
      'p1',
      'p1 #2',
    ])
  })
})

describe('buildReview', () => {
  it('marks a clean row ready and keeps its parsed code', () => {
    const { rows, summary } = review([row('F20.0')])
    expect(rows[0]?.status).toBe('ready')
    expect(rows[0]?.codes).toMatchObject([
      { codeSystem: 'icd10cm', codeNorm: 'F200', matchKind: 'exact' },
    ])
    expect(summary).toEqual({ total: 1, ready: 1, needsReview: 0, problems: 0, dropped: 0 })
  })

  it('reports a code it cannot read as a problem (LA “SMI” in the code column)', () => {
    const [r] = review([row('SMI')]).rows
    expect(r?.status).toBe('problem')
    expect(r?.problems[0]?.problem).toBe('unrecognized')
  })

  it('reports a truncated range (MT `L89.500-L89...`)', () => {
    const [r] = review([row('L89.500-L89...')]).rows
    expect(r?.problems[0]?.problem).toBe('truncated_range')
  })

  it('uses the source’s code-system column (LA revenue codes)', () => {
    const [r] = review([row('912', { codeSystemHint: 'Revenue Code' })]).rows
    expect(r?.codes[0]).toMatchObject({ codeSystem: 'revenue', codeNorm: '0912' })
    expect(r?.notes).toEqual([])
  })

  it('notes code-system text it does not know, and infers instead', () => {
    const [r] = review([row('99213', { codeSystemHint: 'Procedure' })]).rows
    expect(r?.codes[0]?.codeSystem).toBe('cpt')
    expect(r?.notes).toContain('unknown_system_text')
    expect(r?.status).toBe('ready')
  })

  it('asks about a bare 3-character category until the scope is chosen', () => {
    const rows = [row('F20')]
    const before = review(rows).rows[0]
    expect(before?.status).toBe('needs_review')
    expect(before?.openFlags).toEqual(['category_scope'])
    expect(before?.codes[0]?.includesChildren).toBeNull()

    const after = review(rows, { 'row F20': { includesChildren: 1 } }).rows[0]
    expect(after?.status).toBe('ready')
    expect(after?.openFlags).toEqual([])
    expect(after?.codes[0]?.includesChildren).toBe(1)
  })

  it('asks about letter + 4 digits in an undotted source until the system is set (NE)', () => {
    const rows = [row('A0103')]
    expect(review(rows, {}, true).rows[0]?.openFlags).toEqual(['system_ambiguous'])
    const set = review(rows, { 'row A0103': { codeSystem: 'icd10cm' } }, true).rows[0]
    expect(set?.status).toBe('ready')
    expect(set?.codes[0]?.codeSystem).toBe('icd10cm')
  })

  it('needs an accept for a mixed wildcard range and a description with a line break', () => {
    const rows = [row('M30-M31.*'), row('F20.0', { description: 'Schizo-\nphrenia' })]
    const before = review(rows).rows
    expect(before.map((r) => r.openFlags)).toEqual([
      ['mixed_wildcard_range'],
      ['multiline_description'],
    ])
    const after = review(rows, {
      'row M30-M31.*': { accepted: ['mixed_wildcard_range'] },
      'row F20.0': { accepted: ['multiline_description'] },
    }).rows
    expect(after.map((r) => r.status)).toEqual(['ready', 'ready'])
    expect(after[0]?.acceptedFlags).toEqual(['mixed_wildcard_range'])
  })

  it('notes wildcards and duplicates without blocking', () => {
    const { rows } = review([
      row('C34.x'),
      row('F20.0', { locator: 'a' }),
      row('f20.0', { locator: 'b' }),
      row('F20.0', { locator: 'c', subcategory: 'Other' }),
    ])
    expect(rows.map((r) => r.notes)).toEqual([['wildcard'], [], ['duplicate'], []])
    expect(rows.every((r) => r.status === 'ready')).toBe(true)
  })

  it('applies cell edits and marks the row edited', () => {
    const [r] = review([row('L89.500-L89...')], {
      'row L89.500-L89...': { rawCode: 'L89.500-L89.509', description: 'Pressure ulcer' },
    }).rows
    expect(r?.status).toBe('ready')
    expect(r?.edited).toBe(true)
    expect(r?.row.description).toBe('Pressure ulcer')
    expect(r?.source.rawCode).toBe('L89.500-L89...')
  })

  it('drops a row: it does not count as a problem or as a duplicate source', () => {
    const { rows, summary } = review(
      [row('SMI'), row('F20.0', { locator: 'a' }), row('F20.0', { locator: 'b' })],
      { 'row SMI': { dropped: true }, a: { dropped: true } },
    )
    expect(rows.map((r) => r.status)).toEqual(['dropped', 'dropped', 'ready'])
    expect(rows[2]?.notes).toEqual([])
    expect(summary).toEqual({ total: 3, ready: 1, needsReview: 0, problems: 0, dropped: 2 })
  })

  it('splits a multi-code cell into several codes (NE “33230 and 33240”)', () => {
    const [r] = review([row('33230 and 33240')]).rows
    expect(r?.codes.map((c) => c.codeNorm)).toEqual(['33230', '33240'])
  })

  it('ignores accepted flags the row no longer has', () => {
    const [r] = review([row('F20.0')], {
      'row F20.0': { accepted: ['multiline_description'] },
    }).rows
    expect(r?.acceptedFlags).toEqual([])
  })

  describe('with the CMS code lists', () => {
    const reference = new Map([
      ['A0103', ['icd10cm' as const]],
      ['T2042', ['hcpcs' as const]],
      ['H2G', []],
      ['F200', ['icd10cm' as const]],
    ])
    const withRef = (rows: MappedRow[], edits: ReviewEdits = {}) =>
      buildReview(rows, edits, { undottedIcd: true, reference })

    it('settles “ICD-10-CM or HCPCS?” when only one list has the code (NE)', () => {
      const rows = withRef([row('A0103'), row('T2042')]).rows
      expect(rows.map((r) => r.codes[0]?.codeSystem)).toEqual(['icd10cm', 'hcpcs'])
      expect(rows.map((r) => r.status)).toEqual(['ready', 'ready'])
      expect(rows.map((r) => r.notes)).toEqual([
        ['system_from_reference'],
        ['system_from_reference'],
      ])
    })

    it('still asks when neither list (or both) has the code', () => {
      expect(withRef([row('B0000')]).rows[0]?.openFlags).toEqual(['system_ambiguous'])
    })

    it('notes an ICD-10-CM or HCPCS code CMS does not list (LA drug class H2G)', () => {
      const rows = withRef([row('H2G'), row('F20.0'), row('A15.x')]).rows
      expect(rows.map((r) => r.notes.includes('not_in_reference'))).toEqual([true, false, false])
    })

    it('does not note codes it has not looked up yet', () => {
      expect(withRef([row('F31.0')]).rows[0]?.notes).toEqual([])
    })

    it('lists the exact codes to look up', () => {
      const result = buildReview(
        [row('A0103'), row('F20.0'), row('C34.x'), row('99213')],
        {},
        {
          undottedIcd: true,
        },
      )
      // CPT is not in ref_codes; wildcards are prefixes, not codes.
      expect(referenceLookupCodes(result)).toEqual(['A0103', 'F200'])
    })
  })
})

// Synthetic rows only: the category ids (TST…, ZZZ…) and groupings are invented, not AHRQ's.
import { describe, expect, it } from 'vitest'

import {
  ccsrGroupsCovered,
  ccsrGroupsOf,
  ccsrGroupsUnder,
  ccsrIndex,
  ccsrKeyRanges,
  ccsrLookupPrefixes,
  type CcsrRow,
} from './ccsr'

const row = (codeNorm: string, ccsrCategory: string, isDefault: 0 | 1 = 0): CcsrRow => ({
  codeNorm,
  ccsrCategory,
  isDefault,
})

describe('ccsrLookupPrefixes', () => {
  it('lists the code and its prefixes, longest first, down to 3 characters', () => {
    expect(ccsrLookupPrefixes('T8450XA')).toEqual(['T8450XA', 'T8450X', 'T8450', 'T845', 'T84'])
    expect(ccsrLookupPrefixes('F200')).toEqual(['F200', 'F20'])
    expect(ccsrLookupPrefixes('F20')).toEqual(['F20'])
  })

  it('has nothing to try for codes shorter than a category', () => {
    expect(ccsrLookupPrefixes('F2')).toEqual([])
    expect(ccsrLookupPrefixes('')).toEqual([])
  })
})

describe('ccsrGroupsOf', () => {
  const rows = [
    row('F20', 'TST001', 1),
    row('F31', 'TST002', 1),
    row('F310', 'TST003', 1),
    row('F310', 'TST004'),
    row('Q99', 'TST005'),
  ]

  it('takes every row of the longest prefix that has rows', () => {
    expect(ccsrGroupsOf('F3101', rows)).toEqual({
      prefix: 'F310',
      categories: ['TST003', 'TST004'],
      defaultCategory: 'TST003',
    })
  })

  it('falls back to a shorter prefix (a code newer than the CCSR release)', () => {
    expect(ccsrGroupsOf('F2099', rows)).toEqual({
      prefix: 'F20',
      categories: ['TST001'],
      defaultCategory: 'TST001',
    })
    expect(ccsrGroupsOf('F318', rows)?.prefix).toBe('F31')
  })

  it('may have no default (the inpatient default is "unacceptable principal diagnosis")', () => {
    expect(ccsrGroupsOf('Q990', rows)).toEqual({
      prefix: 'Q99',
      categories: ['TST005'],
      defaultCategory: null,
    })
  })

  it('ignores rows that are not a prefix of the code, and finds nothing below 3 characters', () => {
    expect(ccsrGroupsOf('F21', rows)).toBeNull()
    expect(ccsrGroupsOf('F3', rows)).toBeNull()
    expect(ccsrGroupsOf('F30', [row('F301', 'TST001')])).toBeNull()
  })

  it('accepts booleans for is_default', () => {
    expect(
      ccsrGroupsOf('F20', [{ codeNorm: 'F20', ccsrCategory: 'TST001', isDefault: true }])
        ?.defaultCategory,
    ).toBe('TST001')
  })
})

describe('ccsrGroupsCovered (the groups of the codes an entry covers)', () => {
  // F31 is a header whose children differ, so it has no rows of its own.
  const index = ccsrIndex([
    row('F20', 'TST001', 1),
    row('F310', 'TST002', 1),
    row('F311', 'TST003', 1),
    row('F3110', 'TST004', 1),
    row('F32', 'TST005', 1),
    row('F33', 'TST006', 1),
    row('G10', 'TST007', 1),
  ])
  const exact = (codeNorm: string) => ({
    codeNorm,
    matchKind: 'exact' as const,
    rangeEndNorm: null,
    includesChildren: 0,
  })

  it('an exact code with rows (or a parent with rows) takes those groups', () => {
    expect(ccsrGroupsCovered(exact('F200'), index)).toEqual(['TST001'])
    expect(ccsrGroupsCovered(exact('F3111'), index)).toEqual(['TST003'])
  })

  it('a header with no rows of its own takes the groups of the codes under it', () => {
    expect(ccsrGroupsCovered(exact('F31'), index)).toEqual(['TST002', 'TST003', 'TST004'])
    expect(ccsrGroupsCovered(exact('F311'), index)).toEqual(['TST003'])
  })

  it('a wildcard adds the groups of every code under it', () => {
    expect(
      ccsrGroupsCovered({ ...exact('F311'), matchKind: 'prefix', includesChildren: 1 }, index),
    ).toEqual(['TST003', 'TST004'])
    expect(ccsrGroupsCovered({ ...exact('F311'), includesChildren: 1 }, index)).toEqual([
      'TST003',
      'TST004',
    ])
  })

  it('a range takes every code from its start through its end and the codes under its end', () => {
    expect(
      ccsrGroupsCovered({ ...exact('F31'), matchKind: 'range', rangeEndNorm: 'F32' }, index),
    ).toEqual(['TST002', 'TST003', 'TST004', 'TST005'])
  })

  it('finds nothing for a code CCSR does not know', () => {
    expect(ccsrGroupsCovered(exact('Z999'), index)).toEqual([])
    expect(ccsrGroupsUnder('Z9', index)).toEqual([])
  })
})

describe('ccsrKeyRanges', () => {
  it('reads each ICD-10-CM category an entry touches once, ranges merged', () => {
    expect(
      ccsrKeyRanges([
        { codeNorm: 'F200', rangeEndNorm: null },
        { codeNorm: 'F20', rangeEndNorm: null },
        { codeNorm: 'F31', rangeEndNorm: 'F33' },
        { codeNorm: 'F32', rangeEndNorm: null },
        { codeNorm: 'G10', rangeEndNorm: null },
      ]),
    ).toEqual([
      { from: 'F20', to: 'F20￿' },
      { from: 'F31', to: 'F33￿' },
      { from: 'G10', to: 'G10￿' },
    ])
  })
})

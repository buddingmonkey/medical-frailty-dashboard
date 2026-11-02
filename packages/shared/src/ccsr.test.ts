// Synthetic rows only: the category ids (TST…, ZZZ…) and groupings are invented, not AHRQ's.
import { describe, expect, it } from 'vitest'

import { ccsrGroupsOf, ccsrLookupPrefixes, type CcsrRow } from './ccsr'

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

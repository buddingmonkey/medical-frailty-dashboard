import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseIcd10cmOrderFile } from './icd10cm.ts'

// 18 real lines from CMS's FY2027 icd10cm_order_2027.txt (CRLF, fixed width).
const text = readFileSync(
  join(import.meta.dirname, '../fixtures/icd10cm_order_excerpt.txt'),
  'utf8',
)
const rows = parseIcd10cmOrderFile(text, { validFrom: '2026-10-01' })
const byCode = new Map(rows.map((r) => [r.codeNorm, r]))

describe('parseIcd10cmOrderFile', () => {
  it('reads every line, header and billable codes alike', () => {
    expect(rows).toHaveLength(21)
    expect(byCode.get('F20')).toEqual({
      codeSystem: 'icd10cm',
      codeNorm: 'F20',
      description: 'Schizophrenia',
      parentNorm: null,
      chapter: '5',
      billable: 0,
      validFrom: '2026-10-01',
      validTo: null,
    })
  })

  it('keeps the long description, not the abbreviated short one', () => {
    expect(byCode.get('S72001A')?.description).toBe(
      'Fracture of unspecified part of neck of right femur, initial encounter for closed fracture',
    )
    expect(byCode.get('S72001A')?.billable).toBe(1)
  })

  it('sets the parent to the nearest code that exists, skipping placeholder levels', () => {
    expect(byCode.get('F200')?.parentNorm).toBe('F20')
    expect(byCode.get('S72001A')?.parentNorm).toBe('S72001')
    expect(byCode.get('S72001')?.parentNorm).toBe('S7200')
    expect(byCode.get('T8450XA')?.parentNorm).toBe('T8450') // no T8450X in the file
    expect(byCode.get('C7A010')?.parentNorm).toBe('C7A0')
  })

  it('assigns chapters, including the letter-ending and special-purpose ones', () => {
    expect(byCode.get('C7A')?.chapter).toBe('2')
    expect(byCode.get('O9A')?.chapter).toBe('15')
    expect(byCode.get('Z3A00')?.chapter).toBe('21')
    expect(byCode.get('U071')?.chapter).toBe('22')
    expect(byCode.get('QA00101')?.chapter).toBe('17') // FY2027: letter in 2nd place
    expect(byCode.get('QA00101')?.parentNorm).toBe('QA0')
  })

  it('fails loudly on a line it cannot read, instead of skipping it', () => {
    expect(() => parseIcd10cmOrderFile('not a code file\r\n', { validFrom: '2026-10-01' })).toThrow(
      /line 1/,
    )
  })
})

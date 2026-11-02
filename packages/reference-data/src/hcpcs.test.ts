import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseHcpcsFile } from './hcpcs.ts'

// Real records from CMS's October 2026 alpha-numeric HCPCS file (320-character fixed width):
// two modifier records, then procedure records, some continued on a second line.
const text = readFileSync(join(import.meta.dirname, '../fixtures/hcpcs_excerpt.txt'), 'latin1')
const rows = parseHcpcsFile(text, { validFrom: '2026-10-01' })
const byCode = new Map(rows.map((r) => [r.codeNorm, r]))

describe('parseHcpcsFile', () => {
  it('reads procedure codes and skips modifiers', () => {
    expect(rows.map((r) => r.codeNorm)).toEqual([
      'A0021',
      'A0080',
      'A0090',
      'A4397',
      'G0410',
      'G0411',
      'J7500',
    ])
    expect(byCode.get('J7500')).toEqual({
      codeSystem: 'hcpcs',
      codeNorm: 'J7500',
      description: 'Azathioprine, oral, 50 mg',
      parentNorm: null,
      chapter: null,
      billable: null,
      validFrom: '2026-10-01',
      validTo: null,
    })
  })

  it('joins long descriptions that continue on the next record', () => {
    expect(byCode.get('G0410')?.description).toBe(
      'Group psychotherapy other than of a multiple-family group, in a partial hospitalization or intensive outpatient setting, approximately 45 to 50 minutes',
    )
    expect(byCode.get('A0080')?.description).toBe(
      'Non-emergency transportation, per mile - vehicle provided by volunteer (individual or organization), with no vested interest',
    )
  })

  it('keeps terminated codes, with their termination date as valid_to', () => {
    expect(byCode.get('A4397')?.validTo).toBe('2021-12-31')
  })

  it('fails loudly on a continuation record with no code before it', () => {
    const orphan = `G0410002004${'hospitalization'.padEnd(80)}`
    expect(() => parseHcpcsFile(orphan, { validFrom: '2026-10-01' })).toThrow(/line 1/)
  })
})

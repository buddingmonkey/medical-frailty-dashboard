import { describe, expect, it } from 'vitest'

import { refLookupRequestSchema, referenceIndex } from './reference'

describe('refLookupRequestSchema', () => {
  it('takes up to 1,000 normalized codes', () => {
    expect(refLookupRequestSchema.safeParse({ codes: ['A0103', 'J1630'] }).success).toBe(true)
    expect(refLookupRequestSchema.safeParse({ codes: [] }).success).toBe(false)
    expect(refLookupRequestSchema.safeParse({ codes: ['F20.0'] }).success).toBe(false)
    expect(refLookupRequestSchema.safeParse({ codes: ['f200'] }).success).toBe(false)
    const many = Array.from({ length: 1001 }, (_, i) => `A${String(i).padStart(4, '0')}`)
    expect(refLookupRequestSchema.safeParse({ codes: many }).success).toBe(false)
  })
})

describe('referenceIndex', () => {
  it('lists the systems each looked-up code is in, and [] for codes found nowhere', () => {
    const index = referenceIndex(
      new Map(),
      ['A0103', 'H2G', 'J1630'],
      [
        { codeNorm: 'A0103', codeSystem: 'icd10cm', billable: true },
        { codeNorm: 'J1630', codeSystem: 'hcpcs', billable: null },
      ],
    )
    expect([...index]).toEqual([
      ['A0103', ['icd10cm']],
      ['H2G', []],
      ['J1630', ['hcpcs']],
    ])
  })

  it('adds to an earlier index without changing it', () => {
    const first = referenceIndex(new Map(), ['A0103'], [])
    const second = referenceIndex(first, ['J1630'], [])
    expect(first.size).toBe(1)
    expect(second.size).toBe(2)
  })
})

import { describe, expect, it } from 'vitest'

import { codeSystems, federalCategories } from './enums'
import { federalCountsOverlap, publicStateSummarySchema, zeroCounts } from './public'

describe('public state summary', () => {
  it('zeroCounts has a zero for every value', () => {
    const counts = zeroCounts(codeSystems)
    expect(Object.keys(counts)).toEqual([...codeSystems])
    expect(Object.values(counts).every((n) => n === 0)).toBe(true)
  })

  it('rejects counts with a missing key', () => {
    const bySystem: Partial<Record<string, number>> = zeroCounts(codeSystems)
    delete bySystem['icd10cm']
    const result = publicStateSummarySchema.safeParse({
      id: 'GA',
      slug: 'ga',
      name: 'Georgia',
      fips: '13',
      status: 'published',
      published: {
        versionNo: 1,
        sourceDate: null,
        updatedAt: null,
        totalEntries: 0,
        bySystem,
        byFederalCategory: {},
        byQualification: {},
        mappingsConfirmed: true,
      },
    })
    expect(result.success).toBe(false)
  })
})

describe('federalCountsOverlap', () => {
  it('is true only when the federal counts add up to more than the entries', () => {
    const counts = { ...zeroCounts(federalCategories), sud: 3, serious_complex_medical: 2 }
    expect(federalCountsOverlap({ totalEntries: 5, byFederalCategory: counts })).toBe(false)
    expect(federalCountsOverlap({ totalEntries: 4, byFederalCategory: counts })).toBe(true)
  })
})

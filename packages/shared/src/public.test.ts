import { describe, expect, it } from 'vitest'

import { codeSystems } from './enums'
import { publicStateSummarySchema, zeroCounts } from './public'

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

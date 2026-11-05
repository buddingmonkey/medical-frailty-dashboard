import { describe, expect, it } from 'vitest'

import {
  coverageRebuildProgressText,
  coverageRebuildRequestSchema,
  coverageRebuildResponseSchema,
  coverageRebuildStepLabels,
} from './unified-admin'

describe('coverageRebuildRequestSchema', () => {
  it('takes an empty body, or the cursor and budget of a later call', () => {
    expect(coverageRebuildRequestSchema.parse({})).toEqual({})
    expect(
      coverageRebuildRequestSchema.parse({
        cursor: { step: 'placements', after: 'GA' },
        budgetMs: 0,
      }),
    ).toEqual({ cursor: { step: 'placements', after: 'GA' }, budgetMs: 0 })
  })

  it('refuses unknown steps, budgets out of range and extra fields', () => {
    for (const body of [
      { cursor: { step: 'everything', after: '1' } },
      { cursor: { step: 'universe', after: 'x'.repeat(65) } },
      { budgetMs: -1 },
      { budgetMs: 60_001 },
      { other: true },
      null,
    ]) {
      expect(coverageRebuildRequestSchema.safeParse(body).success, JSON.stringify(body)).toBe(false)
    }
  })
})

describe('coverageRebuildResponseSchema', () => {
  it('has a next cursor until done', () => {
    const base = {
      categories: 19,
      universeCodes: 3538,
      placements: 0,
      similarPairs: 0,
      ms: 812,
    }
    expect(
      coverageRebuildResponseSchema.safeParse({
        ...base,
        done: false,
        next: { step: 'universe', after: '7' },
        progress: { step: 'universe', completed: 7, total: 19 },
      }).success,
    ).toBe(true)
    expect(
      coverageRebuildResponseSchema.safeParse({
        ...base,
        done: true,
        next: null,
        progress: { step: 'similarity', completed: 44, total: 44 },
      }).success,
    ).toBe(true)
  })
})

describe('coverageRebuildProgressText', () => {
  it('names the step and how far it got', () => {
    expect(coverageRebuildProgressText({ step: 'universe', completed: 7, total: 19 })).toBe(
      'Rebuilding… full code lists: 7 of 19 categories',
    )
    expect(coverageRebuildProgressText({ step: 'placements', completed: 3, total: 51 })).toBe(
      'Rebuilding… placements: 3 of 51 states',
    )
    expect(coverageRebuildStepLabels.similarity).toBe('state similarity')
  })
})

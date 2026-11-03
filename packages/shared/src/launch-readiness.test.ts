import { describe, expect, it } from 'vitest'

import {
  LAUNCH_READY_STATES_REQUIRED,
  launchGate,
  launchReadinessResponseSchema,
  stateIsReady,
} from './launch-readiness'

const counts = (unmapped: number, unconfirmed: number, notReviewed: number) => ({
  unified: { unmapped, unconfirmed },
  notReviewed,
})

describe('stateIsReady', () => {
  it.each([
    { name: 'all reviewed and approved', c: counts(0, 0, 0), ready: true },
    { name: 'one unmapped category', c: counts(1, 0, 0), ready: false },
    { name: 'one proposed mapping', c: counts(0, 1, 0), ready: false },
    { name: 'a category the public page shows as not reviewed', c: counts(0, 0, 1), ready: false },
    { name: 'everything missing', c: counts(3, 2, 5), ready: false },
  ])('$name → $ready', ({ c, ready }) => {
    expect(stateIsReady(c)).toBe(ready)
  })

  it('ignores the federal layer', () => {
    const withFederal = { ...counts(0, 0, 0), federal: { unmapped: 4, auto: 9 } }
    expect(stateIsReady(withFederal)).toBe(true)
  })
})

describe('launchGate', () => {
  it('requires 2 ready states', () => {
    expect(LAUNCH_READY_STATES_REQUIRED).toBe(2)
  })

  it.each([
    { ready: [], readyCount: 0, gatePassed: false },
    { ready: [true], readyCount: 1, gatePassed: false },
    { ready: [true, false, false], readyCount: 1, gatePassed: false },
    { ready: [true, true], readyCount: 2, gatePassed: true },
    { ready: [true, false, true, true], readyCount: 3, gatePassed: true },
  ])('$ready → $readyCount ready, passed $gatePassed', ({ ready, readyCount, gatePassed }) => {
    expect(launchGate(ready.map((r) => ({ ready: r })))).toEqual({
      readyCount,
      required: 2,
      gatePassed,
    })
  })
})

describe('launchReadinessResponseSchema', () => {
  const state = {
    stateId: 'MT',
    name: 'Montana',
    versionId: 3,
    versionNo: 1,
    publishedAt: '2026-11-02T10:00:00.000Z',
    categories: 2,
    unified: { unmapped: 0, unconfirmed: 0 },
    federal: { unmapped: 2, auto: 0 },
    notReviewed: 0,
    ready: true,
  }
  const body = { states: [state], readyCount: 1, required: 2, gatePassed: false }

  it('accepts a response', () => {
    expect(launchReadinessResponseSchema.parse(body)).toEqual(body)
  })

  it.each([
    { name: 'another required count', patch: { required: 1 } },
    { name: 'a lower-case state id', patch: { states: [{ ...state, stateId: 'mt' }] } },
    { name: 'a negative count', patch: { states: [{ ...state, categories: -1 }] } },
  ])('rejects $name', ({ patch }) => {
    expect(launchReadinessResponseSchema.safeParse({ ...body, ...patch }).success).toBe(false)
  })
})

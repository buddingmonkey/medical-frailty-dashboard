import { describe, expect, it } from 'vitest'

import { healthResponseSchema } from './health'

describe('healthResponseSchema', () => {
  it('accepts a healthy response', () => {
    expect(healthResponseSchema.parse({ ok: true, environment: 'preview' })).toEqual({
      ok: true,
      environment: 'preview',
    })
  })

  it('rejects a response that is not ok or has no environment', () => {
    expect(healthResponseSchema.safeParse({ ok: false, environment: 'preview' }).success).toBe(
      false,
    )
    expect(healthResponseSchema.safeParse({ ok: true }).success).toBe(false)
    expect(healthResponseSchema.safeParse({ ok: true, environment: '' }).success).toBe(false)
  })

  it('drops unknown fields so nothing extra leaks through', () => {
    expect(healthResponseSchema.parse({ ok: true, environment: 'x', extra: 1 })).toEqual({
      ok: true,
      environment: 'x',
    })
  })
})

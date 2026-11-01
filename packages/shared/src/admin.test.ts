import { describe, expect, it } from 'vitest'

import { whoamiResponseSchema } from './admin'

describe('whoamiResponseSchema', () => {
  it('accepts an email and drops anything else', () => {
    expect(whoamiResponseSchema.parse({ email: 'admin@example.org', role: 'x' })).toEqual({
      email: 'admin@example.org',
    })
  })

  it('rejects a missing or empty email', () => {
    expect(whoamiResponseSchema.safeParse({}).success).toBe(false)
    expect(whoamiResponseSchema.safeParse({ email: '' }).success).toBe(false)
  })
})

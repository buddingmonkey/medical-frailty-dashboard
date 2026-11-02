import { describe, expect, it } from 'vitest'

import { auditListResponseSchema, auditQuerySchema, whoamiResponseSchema } from './admin'

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

describe('auditQuerySchema', () => {
  it('defaults to 50 rows from the newest', () => {
    expect(auditQuerySchema.parse({})).toEqual({ limit: 50 })
  })

  it('reads limit and before from query strings', () => {
    expect(auditQuerySchema.parse({ limit: '10', before: '42' })).toEqual({ limit: 10, before: 42 })
  })

  it('rejects limits outside 1-200 and bad cursors', () => {
    for (const query of [
      { limit: '0' },
      { limit: '201' },
      { limit: 'x' },
      { before: '-1' },
      { before: '1.5' },
    ]) {
      expect(auditQuerySchema.safeParse(query).success).toBe(false)
    }
  })
})

describe('auditListResponseSchema', () => {
  it('accepts entries with parsed details and a next cursor', () => {
    const body = {
      items: [
        {
          id: 3,
          at: '2026-11-01T22:00:00Z',
          actorEmail: 'admin@example.org',
          action: 'source.upload',
          target: 'state:MT',
          details: { file: 'mt.pdf' },
        },
      ],
      nextBefore: 3,
    }
    expect(auditListResponseSchema.parse(body)).toEqual(body)
  })

  it('allows null details and no next page', () => {
    const body = { items: [], nextBefore: null }
    expect(auditListResponseSchema.parse(body)).toEqual(body)
  })
})

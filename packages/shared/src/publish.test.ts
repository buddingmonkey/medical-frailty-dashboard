import { describe, expect, it } from 'vitest'

import { publishRequestSchema, rollbackRequestSchema } from './publish'

describe('publishRequestSchema', () => {
  it('takes the checks token and the confirmations', () => {
    const body = {
      token: 'a'.repeat(64),
      confirmations: { large_change: { typed: 'MT' }, unresolved_flags: {} },
    }
    expect(publishRequestSchema.parse(body)).toEqual(body)
  })

  it('refuses a malformed token or an unknown check', () => {
    expect(publishRequestSchema.safeParse({ token: 'x', confirmations: {} }).success).toBe(false)
    expect(
      publishRequestSchema.safeParse({ token: 'a'.repeat(64), confirmations: { nope: {} } })
        .success,
    ).toBe(false)
  })
})

describe('rollbackRequestSchema', () => {
  it('takes a version id', () => {
    expect(rollbackRequestSchema.parse({ versionId: 3 })).toEqual({ versionId: 3 })
    expect(rollbackRequestSchema.safeParse({ versionId: 0 }).success).toBe(false)
  })
})

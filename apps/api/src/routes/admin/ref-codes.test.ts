import { refLookupResponseSchema } from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { beforeAll, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import { refCodes } from '../../db/schema'
import { accessToken, call } from '../../test/access-fixtures'
import { resetDb } from '../../test/reset-db'

async function lookup(body: unknown, token?: string) {
  return call('/api/admin/ref-codes/lookup', {
    token: token ?? (await accessToken()),
    method: 'POST',
    body,
  })
}

describe('POST /api/admin/ref-codes/lookup', () => {
  beforeAll(async () => {
    await resetDb(env.DB)
    const base = { description: 'x', validFrom: '2026-10-01' }
    await createDb(env.DB)
      .insert(refCodes)
      .values([
        { ...base, codeSystem: 'icd10cm', codeNorm: 'A0103', billable: 1, chapter: '1' },
        { ...base, codeSystem: 'icd10cm', codeNorm: 'F20', billable: 0, chapter: '5' },
        { ...base, codeSystem: 'hcpcs', codeNorm: 'J1630' },
      ])
  })

  it('returns the codes CMS lists, with their system', async () => {
    const res = await lookup({ codes: ['A0103', 'F20', 'J1630', 'H2G'] })
    expect(res.status).toBe(200)
    const { items } = refLookupResponseSchema.parse(await res.json())
    expect(items).toEqual(
      expect.arrayContaining([
        { codeNorm: 'A0103', codeSystem: 'icd10cm', billable: true },
        { codeNorm: 'F20', codeSystem: 'icd10cm', billable: false },
        { codeNorm: 'J1630', codeSystem: 'hcpcs', billable: null },
      ]),
    )
    expect(items).toHaveLength(3)
  })

  it('looks up more codes than D1 binds in one query', async () => {
    const codes = Array.from({ length: 1000 }, (_, i) => `Z${String(i).padStart(4, '0')}`)
    codes[999] = 'J1630'
    const { items } = refLookupResponseSchema.parse(await (await lookup({ codes })).json())
    expect(items.map((i) => i.codeNorm)).toEqual(['J1630'])
  })

  it('refuses a body that is not a list of normalized codes', async () => {
    expect((await lookup({ codes: ['F20.0'] })).status).toBe(400)
    expect((await lookup({ codes: [] })).status).toBe(400)
    expect((await lookup('nope')).status).toBe(400)
  })

  it('is for admins only', async () => {
    const res = await lookup(
      { codes: ['F20'] },
      await accessToken({ email: 'someone@example.org' }),
    )
    expect(res.status).toBe(403)
  })
})

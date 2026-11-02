import { auditListResponseSchema, columnProfileResponseSchema, headerKey } from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import { states } from '../../db/schema'
import { ADMIN, accessToken, call } from '../../test/access-fixtures'
import { resetDb } from '../../test/reset-db'

const header = ['Category (tier)', 'Category', 'Condition Name', 'Code', 'Code Name']
const profile = {
  roles: ['tier', 'category', 'subcategory', 'code', 'description'],
  qualification: {
    mode: 'column',
    from: 'tier',
    values: { 'Tier 1': 'standalone' },
    basis: 'published',
  },
}

async function save(body: unknown) {
  return call('/api/admin/column-profiles', { token: await accessToken(), method: 'PUT', body })
}

async function load(stateId: string, key: string) {
  const query = new URLSearchParams({ stateId, headerKey: key })
  const res = await call(`/api/admin/column-profiles?${query.toString()}`, {
    token: await accessToken(),
  })
  return columnProfileResponseSchema.parse(await res.json()).item
}

describe('/api/admin/column-profiles', () => {
  beforeEach(async () => {
    await resetDb(env.DB)
    await createDb(env.DB)
      .insert(states)
      .values([
        { id: 'MT', slug: 'mt', name: 'Montana', fips: '30' },
        { id: 'NE', slug: 'ne', name: 'Nebraska', fips: '31' },
      ])
  })

  it('returns null before anything is saved', async () => {
    expect(await load('MT', headerKey(header))).toBeNull()
  })

  it('saves a profile for a state and header layout, finds it by header key, and audits it', async () => {
    const res = await save({ stateId: 'MT', header, profile })
    expect(res.status).toBe(200)

    // Same headers with other spacing and case: same layout.
    const item = await load('MT', headerKey(header.map((h) => ` ${h.toUpperCase()} `)))
    expect(item).toMatchObject({ profile: { ...profile, defaultCategory: '' }, updatedBy: ADMIN })
    expect(await load('NE', headerKey(header))).toBeNull()

    const audit = auditListResponseSchema.parse(
      await (await call('/api/admin/audit', { token: await accessToken() })).json(),
    )
    expect(audit.items[0]).toMatchObject({ action: 'column_profile.save', target: 'state:MT' })
  })

  it('replaces the saved profile for the same layout', async () => {
    await save({ stateId: 'MT', header, profile })
    await save({
      stateId: 'MT',
      header,
      profile: {
        ...profile,
        qualification: { mode: 'fixed', value: 'unknown', basis: 'published' },
      },
    })
    expect((await load('MT', headerKey(header)))?.profile.qualification).toEqual({
      mode: 'fixed',
      value: 'unknown',
      basis: 'published',
    })
  })

  it('refuses a profile that does not fit the header, or an unknown state', async () => {
    expect((await save({ stateId: 'MT', header: ['Code'], profile })).status).toBe(400)
    expect(
      (
        await save({
          stateId: 'MT',
          header,
          profile: { ...profile, roles: ['ignore', 'ignore', 'ignore', 'ignore', 'ignore'] },
        })
      ).status,
    ).toBe(400)
    const unknown = await save({ stateId: 'ZZ', header, profile })
    expect(unknown.status).toBe(400)
    expect(await unknown.json()).toEqual({ error: 'Unknown state' })
  })
})

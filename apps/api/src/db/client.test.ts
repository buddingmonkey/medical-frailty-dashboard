import { eq } from 'drizzle-orm'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

import { resetDb } from '../test/reset-db'
import { createDb } from './client'
import { datasetVersions, states } from './schema'

describe('createDb', () => {
  beforeEach(async () => {
    await resetDb(env.DB)
  })

  it('reads and writes typed rows through Drizzle', async () => {
    const db = createDb(env.DB)
    await db.insert(states).values({ id: 'MT', slug: 'montana', name: 'Montana', fips: '30' })
    const [version] = await db
      .insert(datasetVersions)
      .values({
        stateId: 'MT',
        versionNo: 1,
        createdBy: 'admin',
        statePublishedDate: '2026-09-29',
      })
      .returning()
    expect(version).toMatchObject({ status: 'draft', statePublishedDate: '2026-09-29' })

    const [state] = await db.select().from(states).where(eq(states.id, 'MT'))
    expect(state).toMatchObject({ slug: 'montana', status: 'none', publishedVersionId: null })
  })
})

describe('resetDb', () => {
  it('empties every table, so new tables cannot be forgotten', async () => {
    const db = createDb(env.DB)
    await db.insert(states).values({ id: 'NE', slug: 'nebraska', name: 'Nebraska', fips: '31' })
    await resetDb(env.DB)

    const { results } = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'entries_fts%'
         AND name != 'd1_migrations'`,
    ).all<{ name: string }>()
    expect(results.length).toBeGreaterThanOrEqual(12)
    for (const { name } of results) {
      const row = await env.DB.prepare(`SELECT count(*) AS n FROM "${name}"`).first<{ n: number }>()
      expect({ name, n: row?.n }).toEqual({ name, n: 0 })
    }
  })
})

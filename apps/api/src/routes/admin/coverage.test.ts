import { auditListResponseSchema, coverageRebuildResponseSchema } from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import { recomputeSimilarity } from '../../db/similarity'
import { appMeta, entryUnified, stateSimilarity, unifiedUniverse } from '../../db/schema'
import { accessToken, call } from '../../test/access-fixtures'
import { seedOverview } from '../../test/overview-fixtures'

// "Rebuild coverage" (docs/deployment.md, "Preview data"): rebuilds every derived table from
// the base rows, for seed data loaded as SQL and for a new CCSR or ICD-10-CM release.
const db = createDb(env.DB)

async function derived() {
  return {
    universe: await db
      .select()
      .from(unifiedUniverse)
      .orderBy(asc(unifiedUniverse.unifiedId), asc(unifiedUniverse.codeNorm)),
    placements: await db
      .select()
      .from(entryUnified)
      .orderBy(asc(entryUnified.entryId), asc(entryUnified.unifiedId)),
    similarity: await db
      .select()
      .from(stateSimilarity)
      .orderBy(asc(stateSimilarity.stateA), asc(stateSimilarity.stateB)),
  }
}

async function dataVersion() {
  const [row] = await db.select().from(appMeta).where(eq(appMeta.key, 'data_version'))
  return Number(row?.value ?? 0)
}

const rebuild = async () =>
  call('/api/admin/coverage/rebuild', { token: await accessToken(), method: 'POST', body: {} })

describe('POST /api/admin/coverage/rebuild', () => {
  beforeEach(async () => {
    await seedOverview()
    // The fixture publishes with SQL, so its pairs come from the incremental path here.
    await recomputeSimilarity(db, 'all')
  })

  it('refuses a request without a signed Access token', async () => {
    expect((await call('/api/admin/coverage/rebuild', { method: 'POST' })).status).toBe(401)
  })

  it('rebuilds universes, placements and similarity to what the admin writes made', async () => {
    const before = await derived()
    expect(before.universe.length).toBeGreaterThan(0)
    expect(before.placements.length).toBeGreaterThan(0)
    expect(before.similarity.length).toBeGreaterThan(0)
    // What seed SQL leaves: base rows only.
    await db.delete(entryUnified)
    await db.delete(unifiedUniverse)
    await db.delete(stateSimilarity)
    const version = await dataVersion()

    const res = await rebuild()
    expect(res.status).toBe(200)
    const body = coverageRebuildResponseSchema.parse(await res.json())
    expect(body).toMatchObject({
      universeCodes: before.universe.length,
      placements: before.placements.length,
      similarPairs: before.similarity.length,
    })
    const after = await derived()
    expect(after.universe).toEqual(before.universe)
    expect(after.placements).toEqual(before.placements)
    // computed_at is when the numbers last changed: now, for rows written again.
    const numbers = (rows: typeof before.similarity) =>
      rows.map((pair) => ({ ...pair, computedAt: null }))
    expect(numbers(after.similarity)).toEqual(numbers(before.similarity))
    expect(await dataVersion()).toBeGreaterThan(version)

    const audits = auditListResponseSchema.parse(
      await (await call('/api/admin/audit', { token: await accessToken() })).json(),
    ).items
    expect(audits[0]).toMatchObject({ action: 'coverage.rebuild', target: 'coverage:all' })
  })

  it('changes nothing when run twice', async () => {
    expect((await rebuild()).status).toBe(200)
    const once = await derived()
    expect((await rebuild()).status).toBe(200)
    expect(await derived()).toEqual(once)
  })
})

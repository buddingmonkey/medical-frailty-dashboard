import type { D1Migration } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { and, asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ADMIN } from '../test/access-fixtures'
import { draftWith, entry, publishAll, send, sourceIds } from '../test/draft-fixtures'
import { resetDb } from '../test/reset-db'
import { createDb } from './client'
import { recomputeSimilarity } from './similarity'
import { appMeta, refCodes, sourceDocuments, states, stateSimilarity } from './schema'

// Pair similarity (roadmap M5 step 7; docs/data-model.md, "Pair similarity"): each state's set
// of billable current ICD-10-CM codes it lists or covers plus its other entries, compared pair
// by pair, recomputed after publish and rollback. Small enough to check by hand.
//
// ref_codes: F200 F201 F209 F3110 F3120 F320 F321 (billable); F20 F31 F32 headers; F208 deleted.
//   MT: F20.* (prefix)                     → F200 F201 F209, hcpcs E0601        = 4
//   NE: F20.0, F20.1, F20.8 (deleted),
//       F31.10–F31.20 (same-length range)  → F200 F201 F3110 F3120, E0601       = 5
//   GA: F32 with children, F31.*–F32.*     → F320 F321 F3110 F3120              = 4
// MT–NE: shared 3, only 1 / 2, 3/6 = 0.5. GA–MT: 0, 4 / 4, 0. GA–NE: 2, 2 / 3, 2/7.

const db = createDb(env.DB)

async function pairs() {
  const rows = await db
    .select()
    .from(stateSimilarity)
    .orderBy(asc(stateSimilarity.stateA), asc(stateSimilarity.stateB))
  return rows.map((r) => [r.stateA, r.stateB, r.shared, r.onlyA, r.onlyB, r.jaccard])
}

async function dataVersion() {
  const [row] = await db.select().from(appMeta).where(eq(appMeta.key, 'data_version'))
  return Number(row?.value ?? 0)
}

async function publish(stateId: string, rows: Parameters<typeof draftWith>[1]) {
  const id = await draftWith(stateId, rows)
  expect((await publishAll(id, stateId)).status).toBe(200)
  return id
}

const e0601 = entry('E0601', { codeSystem: 'hcpcs', stateCategory: 'DME' })
const mtList = [
  entry('F20.*', { codeNorm: 'F20', matchKind: 'prefix', includesChildren: 1 }),
  e0601,
]
const neList = [
  entry('F20.0'),
  entry('F20.1'),
  entry('F20.8'),
  entry('F31.10-F31.20', { codeNorm: 'F3110', matchKind: 'range', rangeEndNorm: 'F3120' }),
  e0601,
]
const gaList = [
  entry('F32', { includesChildren: 1 }),
  entry('F31.*-F32.*', {
    codeNorm: 'F31',
    matchKind: 'range',
    rangeEndNorm: 'F32',
    includesChildren: 1,
  }),
]

beforeEach(async () => {
  await resetDb(env.DB)
  await db.insert(states).values([
    { id: 'GA', slug: 'ga', name: 'Georgia', fips: '13' },
    { id: 'MT', slug: 'mt', name: 'Montana', fips: '30' },
    { id: 'NE', slug: 'ne', name: 'Nebraska', fips: '31' },
  ])
  for (const stateId of ['GA', 'MT', 'NE']) {
    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        stateId,
        title: `${stateId} list`,
        fileType: 'pdf',
        sha256: stateId.repeat(32),
        r2Key: `sources/${stateId}`,
        byteSize: 10,
        uploadedBy: ADMIN,
      })
      .returning()
    sourceIds[stateId] = doc?.id ?? 0
  }
  const code = (codeNorm: string, billable: number, validTo: string | null = null) => ({
    codeSystem: 'icd10cm' as const,
    codeNorm,
    description: `Code ${codeNorm}`,
    billable,
    validFrom: '2026-10-01',
    validTo,
  })
  await db
    .insert(refCodes)
    .values([
      code('F20', 0),
      code('F200', 1),
      code('F201', 1),
      code('F208', 1, '2026-09-30'),
      code('F209', 1),
      code('F31', 0),
      code('F3110', 1),
      code('F3120', 1),
      code('F32', 0),
      code('F320', 1),
      code('F321', 1),
    ])
})

describe('pair similarity (state_similarity)', () => {
  it('compares expanded ICD-10-CM codes and other entries, pair by pair, after each publish', async () => {
    await publish('MT', mtList)
    expect(await pairs()).toEqual([])
    await publish('NE', neList)
    expect(await pairs()).toEqual([['MT', 'NE', 3, 1, 2, 0.5]])
    await publish('GA', gaList)
    expect(await pairs()).toEqual([
      ['GA', 'MT', 0, 4, 4, 0],
      ['GA', 'NE', 2, 2, 3, 2 / 7],
      ['MT', 'NE', 3, 1, 2, 0.5],
    ])
  })

  it('follows the published version on rollback', async () => {
    const first = await publish('MT', mtList)
    await publish('NE', neList)
    // Version 2: F20.0 only. MT–NE: shared 1 (F200), only 0 / 4, 1/5.
    await publish('MT', [entry('F20.0')])
    expect(await pairs()).toEqual([['MT', 'NE', 1, 0, 4, 0.2]])
    const version = await dataVersion()
    const res = await send('POST', '/api/admin/states/MT/rollback', { versionId: first })
    expect(res.status).toBe(200)
    expect(await pairs()).toEqual([['MT', 'NE', 3, 1, 2, 0.5]])
    expect(await dataVersion()).toBeGreaterThan(version)
  })

  it('rewrites only the pairs that change, and keeps data_version when nothing does', async () => {
    await publish('MT', mtList)
    await publish('NE', neList)
    await publish('GA', gaList)
    const computedAt = async (a: string, b: string) => {
      const [row] = await db
        .select({ at: stateSimilarity.computedAt })
        .from(stateSimilarity)
        .where(and(eq(stateSimilarity.stateA, a), eq(stateSimilarity.stateB, b)))
      return row?.at
    }
    const gaNe = await computedAt('GA', 'NE')
    const gaMt = await computedAt('GA', 'MT')
    const version = await dataVersion()
    const again = await recomputeSimilarity(db, { stateIds: ['GA', 'MT'] })
    expect(again).toMatchObject({ written: 0, deleted: 0 })
    expect(await dataVersion()).toBe(version)

    // MT changes: its two pairs are rewritten, GA–NE is not.
    await publish('MT', [entry('F20.0')])
    expect(await pairs()).toEqual([
      ['GA', 'MT', 0, 4, 1, 0],
      ['GA', 'NE', 2, 2, 3, 2 / 7],
      ['MT', 'NE', 1, 0, 4, 0.2],
    ])
    expect(await computedAt('GA', 'NE')).toBe(gaNe)
    expect(await computedAt('GA', 'MT')).not.toBe(gaMt)
  })

  it('drops the pairs of a state that has no list any more', async () => {
    await publish('MT', mtList)
    await publish('NE', neList)
    await db.update(states).set({ publishedVersionId: null }).where(eq(states.id, 'NE'))
    const result = await recomputeSimilarity(db, { stateIds: ['NE'] })
    expect(result.deleted).toBe(1)
    expect(await pairs()).toEqual([])
  })

  it('agrees with the fill in migration 0010 (every pair)', async () => {
    await publish('MT', mtList)
    await publish('NE', neList)
    await publish('GA', gaList)
    const expected = await pairs()
    await db.delete(stateSimilarity)
    const { TEST_MIGRATIONS } = env as Env & { TEST_MIGRATIONS: D1Migration[] }
    const migration = TEST_MIGRATIONS.find((m) => m.name.startsWith('0010_'))
    const fill = migration?.queries.find((q) => q.includes('INSERT INTO state_similarity'))
    expect(fill).toBeDefined()
    await env.DB.prepare(fill ?? '').run()
    expect(await pairs()).toEqual(expected)
    await db.delete(stateSimilarity)
    await recomputeSimilarity(db, 'all')
    expect(await pairs()).toEqual(expected)
  })

  it('computes every pair one state per statement', async () => {
    await publish('MT', mtList)
    await publish('NE', neList)
    await publish('GA', gaList)
    const expected = await pairs()
    await db.delete(stateSimilarity)
    const run = vi.spyOn(db, 'run')
    const result = await recomputeSimilarity(db, 'all')
    const statements = run.mock.calls.length
    run.mockRestore()
    // The stale-pair delete, then one upsert each for GA (GA–MT, GA–NE), MT (MT–NE) and NE.
    expect(statements).toBe(4)
    expect(result.written).toBe(3)
    expect(await pairs()).toEqual(expected)
  })
})

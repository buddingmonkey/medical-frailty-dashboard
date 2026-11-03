import { publicOverviewResponseSchema } from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import { appMeta, states } from '../../db/schema'
import { accessToken, call } from '../../test/access-fixtures'
import { seedOverview } from '../../test/overview-fixtures'

// GET /api/public/overview (roadmap M5 step 4): states × published unified categories, read
// from precomputed placements and universes. A fixture small enough to check by hand; CCSR ids
// are made up (TST…); the fixture is described in src/test/overview-fixtures.ts.

const db = createDb(env.DB)

let calls = 0

async function getOverview(options: { host?: string; vars?: Partial<Env>; token?: string } = {}) {
  calls += 1
  const res = await call('/api/public/overview', {
    host: `overview-${String(calls)}.example.com`,
    vars: { SITE_MODE: 'public' },
    ...options,
  })
  return { res, body: publicOverviewResponseSchema.parse(await res.json()) }
}

let smi = 0
let equipment = 0
let kidney = 0

beforeEach(async () => {
  ;({ smi, equipment, kidney } = await seedOverview())
})

describe('GET /api/public/overview', () => {
  it('lists every state, and published categories by federal parent', async () => {
    const { res, body } = await getOverview()
    expect(res.status).toBe(200)
    expect(body.states.map((s) => [s.id, s.hasList, s.cells.length])).toEqual([
      ['GA', true, 3],
      ['LA', false, 0],
      ['MT', true, 3],
      ['NE', false, 0],
    ])
    expect(body.categories).toEqual([
      {
        id: smi,
        slug: 'serious-mental-illness',
        label: 'Serious mental illness',
        federalCategory: 'disabling_mental_disorder',
        sortOrder: 1,
        definition: 'Test category.',
        coverageBasis: 'universe',
        denominator: 6,
      },
      {
        id: equipment,
        slug: 'equipment',
        label: 'Equipment',
        federalCategory: 'physical_idd_adl',
        sortOrder: 2,
        definition: 'Test category.',
        coverageBasis: 'union',
        denominator: 2,
      },
      {
        id: kidney,
        slug: 'kidney-failure',
        label: 'Kidney failure',
        federalCategory: 'serious_complex_medical',
        sortOrder: 1,
        definition: 'Test category.',
        coverageBasis: 'universe',
        denominator: 1,
      },
    ])
  })

  it('counts universe codes covered by exact, prefix and range entries', async () => {
    const { body } = await getOverview()
    const [ga, , mt] = body.states
    // GA: F20.0 covers itself, F31* covers F31.10 and F31.20, the F32 header (no children)
    // covers no billable code. 3 of 6.
    expect(ga?.cells[0]).toEqual({
      unifiedId: smi,
      entries: 3,
      qualifiesAlone: 1,
      qualifiesAloneShare: 1 / 3,
      covered: 3,
      share: 0.5,
      reviewed: false,
    })
    // MT: F20.0–F20.9 covers F20.0, F20.1, F20.9; F31.*–F32.* covers F31.10, F31.20, F32.0.
    expect(mt?.cells[0]).toEqual({
      unifiedId: smi,
      entries: 2,
      qualifiesAlone: 2,
      qualifiesAloneShare: 1,
      covered: 6,
      share: 1,
      reviewed: true,
    })
  })

  it('shares a category without a universe over every state’s distinct entries', async () => {
    const { body } = await getOverview()
    const [ga, , mt] = body.states
    expect(ga?.cells[1]).toEqual({
      unifiedId: equipment,
      entries: 2,
      qualifiesAlone: 1,
      qualifiesAloneShare: 0.5,
      covered: 2,
      share: 1,
      reviewed: true,
    })
    expect(mt?.cells[1]).toMatchObject({ entries: 1, covered: 1, share: 0.5, reviewed: true })
  })

  it('gives a state with no entries in a category zeros, not reviewed', async () => {
    const { body } = await getOverview()
    expect(body.states[0]?.cells[2]).toEqual({
      unifiedId: kidney,
      entries: 0,
      qualifiesAlone: 0,
      qualifiesAloneShare: null,
      covered: 0,
      share: 0,
      reviewed: false,
    })
  })

  it('caches in public mode until data_version changes', async () => {
    const host = 'overview-cache.example.com'
    const first = await getOverview({ host })
    expect(first.res.headers.get('cache-control')).toBe('public, max-age=300')
    const version = first.body.dataVersion
    expect(version).toBeGreaterThan(0)

    await db.update(states).set({ name: 'Renamed' }).where(eq(states.id, 'NE'))
    const cached = await getOverview({ host })
    expect(cached.body.states.map((s) => s.name)).toContain('Nebraska')

    await db
      .update(appMeta)
      .set({ value: String(version + 1) })
      .where(eq(appMeta.key, 'data_version'))
    const fresh = await getOverview({ host })
    expect(fresh.body.dataVersion).toBe(version + 1)
    expect(fresh.body.states.map((s) => s.name)).toContain('Renamed')
  })

  it('never stores a response in private mode', async () => {
    const { res } = await getOverview({
      token: await accessToken(),
      vars: { SITE_MODE: 'private' },
    })
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })
})

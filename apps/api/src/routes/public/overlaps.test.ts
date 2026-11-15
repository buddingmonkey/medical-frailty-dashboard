import { drillResponseSchema, type OverlapsResponse, overlapsResponseSchema } from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import { appMeta, states } from '../../db/schema'
import { accessToken, call } from '../../test/access-fixtures'
import { seedOverview } from '../../test/overview-fixtures'

// GET /api/public/overlaps?category= (project lead, 2026-11-12): the exclusive intersections of
// the states' sets of rows in one category, with the drill-down's rows and matching. Fixture:
// src/test/overview-fixtures.ts, as in categories.test.ts. States with a list: GA and MT.
//
// Serious mental illness, rows and the states that include them (the drill's counts):
//   F20.0 GA MT (listed by both), F20.0–F20.9 MT, F31.* GA MT (GA's wildcard; MT's range of
//   wildcards covers it), F31.*–F32.* MT, F32 GA MT (MT's range covers it).

const db = createDb(env.DB)
let calls = 0

async function get(
  path: string,
  options: { host?: string; vars?: Partial<Env>; token?: string } = {},
) {
  calls += 1
  return call(path, {
    host: `overlaps-${String(calls)}.example.com`,
    vars: { SITE_MODE: 'public' },
    ...options,
  })
}

async function overlaps(slug: string): Promise<OverlapsResponse> {
  const res = await get(`/api/public/overlaps?category=${slug}`)
  expect(res.status).toBe(200)
  return overlapsResponseSchema.parse(await res.json())
}

const outline = (body: OverlapsResponse) =>
  body.intersections.map(
    (i) => `${i.stateIds.join(',')} ${String(i.size)}: ${i.codes.map((c) => c.display).join(' ')}`,
  )

beforeEach(async () => {
  await seedOverview()
})

describe('GET /api/public/overlaps', () => {
  it('groups the drill-down’s rows by the exact set of states that include them', async () => {
    const body = await overlaps('serious-mental-illness')
    expect(body.category).toMatchObject({
      slug: 'serious-mental-illness',
      label: 'Serious mental illness',
      federalCategory: 'disabling_mental_disorder',
    })
    expect(body.states.map((s) => [s.id, s.name, s.codeCount])).toEqual([
      ['MT', 'Montana', 5],
      ['GA', 'Georgia', 3],
    ])
    expect(body.totalCodes).toBe(5)
    // Wildcards and ranges are rows; a code a range covers counts for the range's state.
    expect(outline(body)).toEqual(['GA,MT 3: F20.0 F31.* F32', 'MT 2: F20.0–F20.9 F31.*–F32.*'])
    expect(body.intersections[0]?.codes[0]).toEqual({
      key: 'icd10cm|exact|F200',
      display: 'F20.0',
      codeSystem: 'icd10cm',
      codePath: '/codes/icd-10-cm/F20.0',
    })
    expect(body.intersections[1]?.codes.every((c) => c.codePath === null)).toBe(true)
  })

  it('agrees with the drill-down’s count of states for every row', async () => {
    const body = await overlaps('serious-mental-illness')
    const res = await get('/api/public/categories/serious-mental-illness')
    const drill = drillResponseSchema.parse(await res.json())
    const fromOverlaps = new Map(
      body.intersections.flatMap((i) => i.codes.map((c) => [c.key, i.stateIds.length])),
    )
    const rows = drill.groups.flatMap((g) => g.rows)
    expect(rows).toHaveLength(fromOverlaps.size)
    for (const r of rows) expect(fromOverlaps.get(r.key), r.key).toBe(r.count)
  })

  it('handles other code systems, and a category no state lists', async () => {
    expect(outline(await overlaps('equipment'))).toEqual(['GA,MT 1: E0601', 'GA 1: E0602'])
    const kidney = await overlaps('kidney-failure')
    expect(kidney).toMatchObject({ states: [], totalCodes: 0, intersections: [] })
  })

  it('answers 400 without a valid category, 404 for a draft or unknown one', async () => {
    for (const search of ['', '?category=', '?category=Not%20a%20slug']) {
      expect((await get(`/api/public/overlaps${search}`)).status, search).toBe(400)
    }
    for (const slug of ['draft-psychoses', 'no-such-category']) {
      expect((await get(`/api/public/overlaps?category=${slug}`)).status, slug).toBe(404)
    }
  })

  it('caches in public mode until data_version changes, keyed on the category only', async () => {
    const host = 'overlaps-cache.example.com'
    const first = await get('/api/public/overlaps?category=equipment', { host })
    expect(first.headers.get('cache-control')).toBe('public, max-age=300')
    const body = overlapsResponseSchema.parse(await first.json())
    await db.update(states).set({ name: 'Renamed' }).where(eq(states.id, 'GA'))
    const cached = overlapsResponseSchema.parse(
      await (await get('/api/public/overlaps?category=equipment&utm_source=x', { host })).json(),
    )
    expect(cached.states.map((s) => s.name)).toContain('Georgia')
    await db
      .update(appMeta)
      .set({ value: String(body.dataVersion + 1) })
      .where(eq(appMeta.key, 'data_version'))
    const fresh = overlapsResponseSchema.parse(
      await (await get('/api/public/overlaps?category=equipment', { host })).json(),
    )
    expect(fresh.states.map((s) => s.name)).toContain('Renamed')

    const res = await get('/api/public/overlaps?category=equipment', {
      token: await accessToken(),
      vars: { SITE_MODE: 'private' },
    })
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })
})

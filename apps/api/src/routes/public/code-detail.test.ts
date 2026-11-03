import { codeDetailResponseSchema } from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import { appMeta, states } from '../../db/schema'
import { accessToken, call } from '../../test/access-fixtures'
import { seedOverview } from '../../test/overview-fixtures'

// GET /api/public/codes/:system/:code (roadmap M6 step 3): one code, every state's status. The
// fixture (src/test/overview-fixtures.ts): GA and MT have lists, LA is announced, NE has only a
// draft (which lists F20.0 and must never show).
//   GA: F20.0 (alone), F31.* (needs another code), F32 header without children, E0601, E0602
//   MT: F20.0–F20.9 (same-length range), F31.*–F32.* (range of wildcards), E0601

const db = createDb(env.DB)
let calls = 0

async function get(
  path: string,
  options: { host?: string; vars?: Partial<Env>; token?: string } = {},
) {
  calls += 1
  return call(path, {
    host: `code-${String(calls)}.example.com`,
    vars: { SITE_MODE: 'public' },
    ...options,
  })
}

async function detail(path: string) {
  const res = await get(`/api/public/codes/${path}`)
  expect(res.status).toBe(200)
  return codeDetailResponseSchema.parse(await res.json())
}

const statuses = (body: { states: { id: string; status: string }[] }) =>
  Object.fromEntries(body.states.map((s) => [s.id, s.status]))

beforeEach(async () => {
  await seedOverview()
})

describe('GET /api/public/codes/:system/:code', () => {
  it('gives the code, its CMS description and every state, by name', async () => {
    const body = await detail('icd-10-cm/F20.0')
    expect(body.code).toEqual({
      codeSystem: 'icd10cm',
      codeNorm: 'F200',
      display: 'F20.0',
      path: '/codes/icd-10-cm/F20.0',
      description: 'Code F200',
    })
    expect(body.states.map((s) => s.name)).toEqual(['Georgia', 'Louisiana', 'Montana', 'Nebraska'])
    // NE's draft lists F20.0, but only published versions count.
    expect(statuses(body)).toEqual({ GA: 'exact', LA: 'no_list', MT: 'covered', NE: 'no_list' })
    expect(body.showQualification).toBe('all')
  })

  it('returns the matching entries with the state’s text, rule and source', async () => {
    const body = await detail('icd-10-cm/F20.0')
    const ga = body.states.find((s) => s.id === 'GA')
    expect(ga?.entries).toEqual([
      {
        rawCode: 'F200',
        display: 'F20.0',
        matchKind: 'exact',
        description: null,
        stateCategory: 'Behavioral Health',
        stateSubcategory: '',
        tier: null,
        qualification: 'standalone',
        qualificationBasis: 'published',
        source: { title: 'GA list published', url: null, publisherDate: null, locator: null },
      },
    ])
    const mt = body.states.find((s) => s.id === 'MT')
    expect(mt?.entries.map((e) => e.display)).toEqual(['F20.0–F20.9'])
    expect(body.states.find((s) => s.id === 'LA')?.entries).toEqual([])
  })

  it('counts narrower codes under a header code, M4 rules for wildcards', async () => {
    const f20 = await detail('icd-10-cm/F20')
    expect(statuses(f20)).toMatchObject({ GA: 'narrower', MT: 'narrower' })
    expect(f20.states.find((s) => s.id === 'GA')?.narrowerCount).toBe(1)

    // GA's F32 header has no children; MT's F31.*–F32.* covers F32.0.
    const f320 = await detail('icd-10-cm/F32.0')
    expect(statuses(f320)).toMatchObject({ GA: 'not_listed', MT: 'covered' })

    const f3110 = await detail('icd-10-cm/F31.10')
    expect(statuses(f3110)).toMatchObject({ GA: 'covered', MT: 'covered' })
    expect(f3110.states.find((s) => s.id === 'GA')?.entries[0]).toMatchObject({
      display: 'F31.*',
      qualification: 'needs_support',
    })
  })

  it('accepts lowercase and undotted codes, and HCPCS codes a state lists', async () => {
    expect((await detail('icd-10-cm/f200')).code.path).toBe('/codes/icd-10-cm/F20.0')
    const e0601 = await detail('hcpcs/E0601')
    expect(e0601.code.description).toBeNull()
    expect(statuses(e0601)).toMatchObject({ GA: 'exact', MT: 'exact' })
  })

  it('answers 404 for a malformed code, or one CMS does not know and no state lists', async () => {
    for (const path of [
      'icd-10-cm/F20.*',
      'icd-10-cm/not-a-code',
      'nope/F20.0',
      // Not in ref_codes and nobody lists it.
      'icd-10-cm/Z99.2',
      'cpt/99213',
    ]) {
      const res = await get(`/api/public/codes/${path}`)
      expect(res.status, path).toBe(404)
    }
  })

  it('respects the show_qualification setting', async () => {
    await db.insert(appMeta).values({ key: 'show_qualification', value: 'none' })
    const body = await detail('icd-10-cm/F20.0')
    expect(body.showQualification).toBe('none')
    for (const e of body.states.flatMap((s) => s.entries)) {
      expect(e.qualification).toBeNull()
      expect(e.qualificationBasis).toBeNull()
    }
  })

  it('caches in public mode until data_version changes; never in private mode', async () => {
    const host = 'code-cache.example.com'
    const first = await get('/api/public/codes/icd-10-cm/F20.0', { host })
    expect(first.headers.get('cache-control')).toBe('public, max-age=300')
    const body = codeDetailResponseSchema.parse(await first.json())
    await db.update(states).set({ name: 'Renamed' }).where(eq(states.id, 'GA'))
    const cached = codeDetailResponseSchema.parse(
      await (await get('/api/public/codes/icd-10-cm/F20.0', { host })).json(),
    )
    expect(cached.states.map((s) => s.name)).toContain('Georgia')
    await db
      .update(appMeta)
      .set({ value: String(body.dataVersion + 1) })
      .where(eq(appMeta.key, 'data_version'))
    const fresh = codeDetailResponseSchema.parse(
      await (await get('/api/public/codes/icd-10-cm/F20.0', { host })).json(),
    )
    expect(fresh.states.map((s) => s.name)).toContain('Renamed')

    const res = await get('/api/public/codes/icd-10-cm/F20.0', {
      token: await accessToken(),
      vars: { SITE_MODE: 'private' },
    })
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })
})

import {
  drillDetailResponseSchema,
  drillQueryFromRecord,
  type DrillResponse,
  drillResponseSchema,
} from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import { publicDrill } from '../../db/public-drill'
import { appMeta, states } from '../../db/schema'
import { accessToken, call } from '../../test/access-fixtures'
import { seedOverview } from '../../test/overview-fixtures'

// GET /api/public/categories/:slug (roadmap M5 step 6): one unified category's codes, ranked by
// how many states list them. The fixture (src/test/overview-fixtures.ts) is small enough to
// check by hand. States with a list: GA and MT (LA announced, NE only a draft), so N = 2.
//
// Serious mental illness, universe F200 F201 F209 F3110 F3120 F320. Rows placed:
//   GA: F20.0 (alone), F31.* (needs another code), F32 header (doesn't say)
//   MT: F20.0–F20.9 (same-length range, alone), F31.*–F32.* (range of wildcards, alone)

const db = createDb(env.DB)
let calls = 0

async function get(
  path: string,
  options: { host?: string; vars?: Partial<Env>; token?: string } = {},
) {
  calls += 1
  return call(path, {
    host: `drill-${String(calls)}.example.com`,
    vars: { SITE_MODE: 'public' },
    ...options,
  })
}

async function drill(slug: string, search = '') {
  const res = await get(`/api/public/categories/${slug}${search}`)
  expect(res.status).toBe(200)
  return drillResponseSchema.parse(await res.json())
}

/** Every row as `display count`, group by group. */
const outline = (body: DrillResponse) =>
  body.groups.map((g) => [
    `${g.label} ${String(g.anyCount)}/${String(g.rowCount)}`,
    ...g.rows.map((r) => `${r.display} ${String(r.count)}`),
  ])

beforeEach(async () => {
  await seedOverview()
})

describe('GET /api/public/categories/:slug', () => {
  it('describes the category and the states with a list', async () => {
    const body = await drill('serious-mental-illness')
    expect(body.category).toMatchObject({
      slug: 'serious-mental-illness',
      label: 'Serious mental illness',
      definition: 'Test category.',
      federalCategory: 'disabling_mental_disorder',
      universeSize: 6,
      ccsr: [
        { id: 'TST001', description: 'Test TST001' },
        { id: 'TST002', description: 'Test TST002' },
        { id: 'TST003', description: 'Test TST003' },
      ],
    })
    expect(body.states.map((s) => s.id)).toEqual(['GA', 'MT'])
    expect(body.systems).toEqual(['icd10cm'])
    expect(body.query).toEqual({ show: 'all', system: null, all: false, focus: null })
  })

  it('counts exact, wildcard and range entries; groups by ICD-10-CM category', async () => {
    const body = await drill('serious-mental-illness')
    expect(outline(body)).toEqual([
      ['F20 2/2', 'F20.0 2', 'F20.0–F20.9 1'],
      ['F31 2/2', 'F31.* 2', 'F31.*–F32.* 1'],
      ['F32 2/1', 'F32 2'],
    ])
    expect(body).toMatchObject({ totalRows: 5, totalGroups: 3, page: 1, pageCount: 1 })
    const [f20] = body.groups
    expect(f20?.description).toBe('Code F20')
    expect(f20?.rows[0]).toMatchObject({
      key: 'icd10cm|exact|F200',
      codePath: '/codes/icd-10-cm/F20.0',
      description: 'Code F200',
      descriptionSource: 'cms',
      rules: [{ qualification: 'standalone', count: 2, inferred: 0 }],
      focus: null,
    })
    // A range has no CMS text and no state published one.
    expect(f20?.rows[1]).toMatchObject({ codePath: null, description: null, wildcard: false })
    expect(body.groups[1]?.rows[0]?.rules).toEqual([
      { qualification: 'standalone', count: 1, inferred: 0 },
      { qualification: 'needs_support', count: 1, inferred: 0 },
    ])
  })

  it('adds the codes no state lists with all=1, each with its own count', async () => {
    const body = await drill('serious-mental-illness', '?all=1')
    expect(body.query.all).toBe(true)
    expect(outline(body)).toEqual([
      ['F20 2/4', 'F20.0 2', 'F20.0–F20.9 1', 'F20.1 1', 'F20.9 1'],
      ['F31 2/4', 'F31.* 2', 'F31.10 2', 'F31.20 2', 'F31.*–F32.* 1'],
      ['F32 2/2', 'F32 2', 'F32.0 1'],
    ])
    const kidney = await drill('kidney-failure', '?all=1')
    expect(outline(kidney)).toEqual([['N18 0/1', 'N18.6 0']])
    expect(kidney.groups[0]?.rows[0]?.rules).toEqual([])
  })

  it('ignores all=1 for a category without a full code list; groups other systems by system', async () => {
    const body = await drill('equipment', '?all=1')
    expect(body.query.all).toBe(false)
    expect(body.category.universeSize).toBe(0)
    expect(outline(body)).toEqual([['HCPCS Level II 2/2', 'E0601 2', 'E0602 1']])
    expect(body.systems).toEqual(['hcpcs'])
    // A system the category has no rows in is dropped.
    expect((await drill('equipment', '?system=icd10cm')).query.system).toBeNull()
    const hcpcs = await drill('equipment', '?system=hcpcs&show=everyone')
    expect(hcpcs.query.system).toBe('hcpcs')
    expect(outline(hcpcs)).toEqual([['HCPCS Level II 2/1', 'E0601 2']])
    // Nothing kept: no groups, one empty page.
    const none = await drill('equipment', '?show=gaps')
    expect(none).toMatchObject({ groups: [], totalRows: 0, totalGroups: 0, page: 1, pageCount: 1 })
  })

  it('filters: listed by everyone, gaps, only one state', async () => {
    expect(outline(await drill('serious-mental-illness', '?show=everyone'))).toEqual([
      ['F20 2/1', 'F20.0 2'],
      ['F31 2/1', 'F31.* 2'],
      ['F32 2/1', 'F32 2'],
    ])
    expect(outline(await drill('serious-mental-illness', '?show=one'))).toEqual([
      ['F20 2/1', 'F20.0–F20.9 1'],
      ['F31 2/1', 'F31.*–F32.* 1'],
    ])
    // Under half of 2 is 0: only codes nobody lists.
    expect((await drill('serious-mental-illness', '?show=gaps')).groups).toEqual([])
    expect(outline(await drill('kidney-failure', '?show=gaps&all=1'))).toEqual([
      ['N18 0/1', 'N18.6 0'],
    ])
  })

  it('adds the focus state’s cell in the M4 words', async () => {
    const ga = await drill('serious-mental-illness', '?focus=ga')
    expect(ga.query.focus).toBe('GA')
    const cells = ga.groups.flatMap((g) => g.rows.map((r) => [r.display, r.focus]))
    expect(cells).toEqual([
      [
        'F20.0',
        {
          status: 'exact',
          narrowerCount: 0,
          match: {
            display: 'F20.0',
            tier: null,
            qualification: 'standalone',
            qualificationBasis: 'published',
            stateCategory: 'Behavioral Health',
            stateSubcategory: '',
          },
        },
      ],
      ['F20.0–F20.9', { status: 'narrower', narrowerCount: 1, match: null }],
      ['F31.*', expect.objectContaining({ status: 'exact' })],
      ['F31.*–F32.*', { status: 'narrower', narrowerCount: 2, match: null }],
      ['F32', expect.objectContaining({ status: 'exact' })],
    ])
    const mt = await drill('serious-mental-illness', '?focus=MT')
    expect(mt.groups[0]?.rows[0]?.focus).toMatchObject({
      status: 'covered',
      match: { display: 'F20.0–F20.9', stateCategory: 'SMI' },
    })
    // A state without a list cannot be the focus.
    expect((await drill('serious-mental-illness', '?focus=LA')).query.focus).toBeNull()
  })

  it('pages by groups: a page holds the groups that start within its rows', async () => {
    const page = (n: number) =>
      publicDrill(
        db,
        'serious-mental-illness',
        drillQueryFromRecord({ all: '1', page: String(n) }),
        {
          dataVersion: 0,
          pageRows: 4,
        },
      )
    const first = await page(1)
    expect(first?.groups.map((g) => g.label)).toEqual(['F20'])
    expect(first).toMatchObject({ page: 1, pageCount: 3, totalRows: 10, totalGroups: 3 })
    expect((await page(3))?.groups.map((g) => g.label)).toEqual(['F32'])
    // Past the end: the last page.
    expect((await page(9))?.page).toBe(3)
  })

  it('answers 404 for a draft, retired or unknown category', async () => {
    for (const slug of ['draft-psychoses', 'no-such-category', 'codes']) {
      const res = await get(`/api/public/categories/${slug}`)
      expect(res.status).toBe(404)
    }
    expect(
      (await get('/api/public/categories/draft-psychoses/detail?code=icd10cm|exact|F200')).status,
    ).toBe(404)
  })

  it('caches in public mode until data_version changes; never in private mode', async () => {
    const host = 'drill-cache.example.com'
    const first = await get('/api/public/categories/equipment', { host })
    expect(first.headers.get('cache-control')).toBe('public, max-age=300')
    const body = drillResponseSchema.parse(await first.json())
    await db.update(states).set({ name: 'Renamed' }).where(eq(states.id, 'GA'))
    const cached = drillResponseSchema.parse(
      await (await get('/api/public/categories/equipment', { host })).json(),
    )
    expect(cached.states.map((s) => s.name)).toContain('Georgia')
    await db
      .update(appMeta)
      .set({ value: String(body.dataVersion + 1) })
      .where(eq(appMeta.key, 'data_version'))
    const fresh = drillResponseSchema.parse(
      await (await get('/api/public/categories/equipment', { host })).json(),
    )
    expect(fresh.states.map((s) => s.name)).toContain('Renamed')

    const res = await get('/api/public/categories/equipment', {
      token: await accessToken(),
      vars: { SITE_MODE: 'private' },
    })
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('GET /api/public/categories/:slug/detail', () => {
  async function detail(code: string) {
    const res = await get(
      `/api/public/categories/serious-mental-illness/detail?code=${encodeURIComponent(code)}`,
    )
    expect(res.status).toBe(200)
    return drillDetailResponseSchema.parse(await res.json())
  }

  it('gives every state’s cell for one code', async () => {
    const body = await detail('icd10cm|exact|F200')
    expect(body.row).toMatchObject({ display: 'F20.0', count: 2, description: 'Code F200' })
    expect(body.statesWithList).toBe(2)
    expect(
      body.states.map((s) => [s.id, s.hasList, s.cell.status, s.cell.match?.display ?? null]),
    ).toEqual([
      ['GA', true, 'exact', 'F20.0'],
      ['LA', false, 'no_list', null],
      ['MT', true, 'covered', 'F20.0–F20.9'],
      ['NE', false, 'no_list', null],
    ])
  })

  it('counts narrower codes for a range, and works for a code no state lists', async () => {
    const range = await detail('icd10cm|range|F31|F32|*')
    expect(range.states.find((s) => s.id === 'GA')?.cell).toEqual({
      status: 'narrower',
      narrowerCount: 2,
      match: null,
    })
    const f321 = await detail('icd10cm|exact|F321')
    expect(f321.row.count).toBe(1)
    expect(f321.states.find((s) => s.id === 'GA')?.cell.status).toBe('not_listed')
  })

  it('refuses a missing or unreadable code', async () => {
    expect((await get('/api/public/categories/serious-mental-illness/detail')).status).toBe(400)
    expect(
      (await get('/api/public/categories/serious-mental-illness/detail?code=F20')).status,
    ).toBe(400)
  })
})

import { publicOverviewResponseSchema, unifiedSaveResponseSchema } from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import { appMeta, refCcsr, refCcsrCategories, refCodes, states } from '../../db/schema'
import { accessToken, call } from '../../test/access-fixtures'
import { send } from '../../test/draft-fixtures'
import { icd, publishVersion } from '../../test/public-fixtures'
import { resetDb } from '../../test/reset-db'

// GET /api/public/overview (roadmap M5 step 4): states × published unified categories, read
// from precomputed placements and universes. A fixture small enough to check by hand; CCSR ids
// are made up (TST…).

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

async function createCategory(fields: {
  label: string
  ccsr: string[]
  federalCategory: string
  sortOrder: number
  status?: string
}) {
  const res = await send('POST', '/api/admin/unified', {
    definition: 'Test category.',
    includes: null,
    excludes: null,
    status: 'published',
    ...fields,
  })
  expect(res.status).toBe(201)
  return unifiedSaveResponseSchema.parse(await res.json()).id
}

async function approve(stateId: string, stateCategory: string, unifiedId: number) {
  const res = await send('PUT', `/api/admin/states/${stateId}/unified-mappings`, {
    stateCategory,
    stateSubcategory: '',
    approve: true,
    targets: [{ unifiedId, relation: 'exact', basis: 'state_text', confidence: 'high' }],
  })
  expect(res.status).toBe(200)
}

let smi = 0
let equipment = 0
let kidney = 0

/**
 * Universe of "smi" (TST001–TST003): F200, F201, F209, F3110, F3120, F320 = 6 codes (F20 is a
 * header, F208 was deleted, F321 belongs to TST009 by the longest prefix). "kidney" (TST010):
 * N186. "equipment" has no CCSR group: union basis.
 *
 * GA (no mapping for Behavioral Health, so by CCSR, not reviewed): F20.0 exact, F31* prefix,
 * F32 exact header; equipment (approved): E0601, E0602.
 * MT (approved): ranges F20.0–F20.9 (same-length codes) and F31.*–F32.* (wildcards); E0601.
 * NE and LA have no list.
 */
beforeEach(async () => {
  await resetDb(env.DB)
  await db.insert(states).values([
    { id: 'GA', slug: 'ga', name: 'Georgia', fips: '13' },
    { id: 'LA', slug: 'la', name: 'Louisiana', fips: '22', status: 'announced' },
    { id: 'MT', slug: 'mt', name: 'Montana', fips: '30' },
    { id: 'NE', slug: 'ne', name: 'Nebraska', fips: '31' },
  ])
  await db.insert(refCcsrCategories).values(
    ['TST001', 'TST002', 'TST003', 'TST009', 'TST010'].map((ccsrCategory) => ({
      ccsrCategory,
      description: `Test ${ccsrCategory}`,
      bodySystem: 'Test',
      release: 'ccsr-dx-test',
    })),
  )
  await db.insert(refCcsr).values(
    [
      ['F20', 'TST001'],
      ['F31', 'TST002'],
      ['F32', 'TST003'],
      ['F321', 'TST009'],
      ['N18', 'TST010'],
    ].map(([codeNorm = '', ccsrCategory = '']) => ({
      codeNorm,
      ccsrCategory,
      isDefault: 1,
      release: 'ccsr-dx-test',
    })),
  )
  const code = (codeNorm: string, billable = 1, validTo: string | null = null) => ({
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
      code('F200'),
      code('F201'),
      code('F208', 1, '2026-09-30'),
      code('F209'),
      code('F31', 0),
      code('F3110'),
      code('F3120'),
      code('F32', 0),
      code('F320'),
      code('F321'),
      code('N186'),
    ])

  await publishVersion('GA', 'published', [
    icd('F200', 'Behavioral Health', { qualification: 'standalone' }),
    icd('F31', 'Behavioral Health', { matchKind: 'prefix', qualification: 'needs_support' }),
    icd('F32', 'Behavioral Health', { includesChildren: 0 }),
    {
      codeSystem: 'hcpcs',
      rawCode: 'E0601',
      codeNorm: 'E0601',
      stateCategory: 'DME',
      qualification: 'standalone',
    },
    { codeSystem: 'hcpcs', rawCode: 'E0602', codeNorm: 'E0602', stateCategory: 'DME' },
  ])
  await publishVersion('MT', 'published', [
    icd('F200', 'SMI', {
      matchKind: 'range',
      rangeEndNorm: 'F209',
      includesChildren: 0,
      qualification: 'standalone',
    }),
    icd('F31', 'SMI', {
      matchKind: 'range',
      rangeEndNorm: 'F32',
      includesChildren: 1,
      qualification: 'standalone',
    }),
    {
      codeSystem: 'hcpcs',
      rawCode: 'E0601',
      codeNorm: 'E0601',
      stateCategory: 'DME',
      qualification: 'standalone',
    },
  ])
  // A draft is never public, nor are draft categories.
  await publishVersion('NE', 'draft', [icd('F200', 'SMI')])

  smi = await createCategory({
    label: 'Serious mental illness',
    ccsr: ['TST001', 'TST002', 'TST003'],
    federalCategory: 'disabling_mental_disorder',
    sortOrder: 1,
  })
  kidney = await createCategory({
    label: 'Kidney failure',
    ccsr: ['TST010'],
    federalCategory: 'serious_complex_medical',
    sortOrder: 1,
  })
  equipment = await createCategory({
    label: 'Equipment',
    ccsr: [],
    federalCategory: 'physical_idd_adl',
    sortOrder: 2,
  })
  await createCategory({
    label: 'Draft psychoses',
    ccsr: ['TST001'],
    federalCategory: 'disabling_mental_disorder',
    sortOrder: 0,
    status: 'draft',
  })
  await approve('GA', 'DME', equipment)
  await approve('MT', 'SMI', smi)
  await approve('MT', 'DME', equipment)
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
        coverageBasis: 'universe',
        denominator: 6,
      },
      {
        id: equipment,
        slug: 'equipment',
        label: 'Equipment',
        federalCategory: 'physical_idd_adl',
        sortOrder: 2,
        coverageBasis: 'union',
        denominator: 2,
      },
      {
        id: kidney,
        slug: 'kidney-failure',
        label: 'Kidney failure',
        federalCategory: 'serious_complex_medical',
        sortOrder: 1,
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

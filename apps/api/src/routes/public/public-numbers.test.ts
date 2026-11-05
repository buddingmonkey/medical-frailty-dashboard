import { env } from 'cloudflare:workers'
import { asc } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import { includedCodePage } from '../../db/public-code-sitemap'
import { recomputePlacements } from '../../db/placement'
import { recomputeSimilarity } from '../../db/similarity'
import { refCodes, states, stateSimilarity } from '../../db/schema'
import { call } from '../../test/access-fixtures'
import { seedStatesCompare } from '../../test/overview-fixtures'
import { icd, publishVersion } from '../../test/public-fixtures'

// Pins every public number on one fixture (the review's duplication refactor, 2026-11-04): the
// overview, each drill-down, its detail, pair similarity, both comparisons, the code pages and
// the sitemap's codes. The code-matching rules live in SQL (src/db/code-match.ts) and in
// TypeScript (`entryCovers`, `comparePatternKey`); a change to either that moves a number fails
// here. Update the snapshot only when a number is meant to change.
//
// The fixture is the comparison fixture (src/test/overview-fixtures.ts) plus TX, whose list
// uses every rule: a code with children, a wildcard range, a same-length range, a prefix, a
// HCPCS range and CPT codes.

const db = createDb(env.DB)
let calls = 0

async function json(path: string): Promise<unknown> {
  calls += 1
  const res = await call(path, {
    host: `pin-${String(calls)}.example.com`,
    vars: { SITE_MODE: 'public' },
  })
  expect(res.status, path).toBe(200)
  return res.json()
}

/** Drops the fields that change from run to run (times, the data version). */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => k !== 'dataVersion' && !k.endsWith('At'))
        .map(([k, v]) => [k, stable(v)]),
    )
  }
  return value
}

const pin = async (path: string) => {
  expect(stable(await json(path))).toMatchSnapshot(path)
}

beforeAll(async () => {
  await seedStatesCompare()
  await db.insert(states).values({ id: 'TX', slug: 'tx', name: 'Texas', fips: '48' })
  await db.insert(refCodes).values(
    ['E0600', 'E0605', 'E0610', 'E0611'].map((codeNorm) => ({
      codeSystem: 'hcpcs' as const,
      codeNorm,
      description: `Item ${codeNorm}`,
      billable: 1,
      validFrom: '2026-10-01',
    })),
  )
  await publishVersion('TX', 'published', [
    icd('F20', 'Mental health', { includesChildren: 1, qualification: 'standalone' }),
    icd('F3110', 'Mental health', {
      matchKind: 'range',
      rangeEndNorm: 'F3120',
      qualification: 'needs_support',
    }),
    icd('F32', 'Mental health', {
      matchKind: 'range',
      rangeEndNorm: 'F32',
      includesChildren: 1,
    }),
    icd('N18', 'Kidney', { matchKind: 'prefix', qualification: 'standalone' }),
    icd('Z992', 'Kidney'),
    {
      codeSystem: 'hcpcs',
      rawCode: 'E0600-E0610',
      codeNorm: 'E0600',
      matchKind: 'range',
      rangeEndNorm: 'E0610',
      stateCategory: 'DME',
    },
    { codeSystem: 'hcpcs', rawCode: 'E0601', codeNorm: 'E0601', stateCategory: 'DME' },
    { codeSystem: 'cpt', rawCode: '90791', codeNorm: '90791', stateCategory: 'Mental health' },
    {
      codeSystem: 'cpt',
      rawCode: '90832-90838',
      codeNorm: '90832',
      matchKind: 'range',
      rangeEndNorm: '90838',
      stateCategory: 'Mental health',
    },
  ])
  await recomputePlacements(db, 'all')
  await recomputeSimilarity(db, 'all')
})

describe('public numbers', () => {
  it('overview', async () => {
    await pin('/api/public/overview')
  })

  it('drill-downs', async () => {
    for (const slug of ['serious-mental-illness', 'kidney-failure', 'equipment']) {
      for (const search of ['', '?all=1', '?show=everyone', '?show=gaps&all=1', '?show=one']) {
        await pin(`/api/public/categories/${slug}${search}`)
      }
    }
  })

  it('drill-down details', async () => {
    for (const code of [
      'icd10cm|exact|F200',
      'icd10cm|prefix|F31',
      'icd10cm|range|F31|F32|*',
      'icd10cm|range|F200|F209|',
      'icd10cm|exact|F3110',
    ]) {
      await pin(
        `/api/public/categories/serious-mental-illness/detail?code=${encodeURIComponent(code)}`,
      )
    }
  })

  it('pair similarity', async () => {
    const rows = await db
      .select()
      .from(stateSimilarity)
      .orderBy(asc(stateSimilarity.stateA), asc(stateSimilarity.stateB))
    expect(
      rows.map((r) => [r.stateA, r.stateB, r.shared, r.onlyA, r.onlyB, r.jaccard]),
    ).toMatchSnapshot()
  })

  it('state pages', async () => {
    for (const slug of ['ga', 'mt', 'ne', 'tx']) await pin(`/api/public/states/${slug}`)
  })

  it('compare by category', async () => {
    for (const category of [
      'disabling_mental_disorder',
      'serious_complex_medical',
      'physical_idd_adl',
      'unmapped',
    ]) {
      await pin(`/api/public/compare?states=GA,MT,NE,TX&category=${category}`)
    }
    await pin('/api/public/compare?states=TX,MT&category=disabling_mental_disorder&alone=1')
    await pin('/api/public/compare?states=GA,MT,TX&ownState=TX&ownCategory=Mental%20health')
  })

  it('compare across states', async () => {
    await pin('/api/public/states-compare?states=GA,MT,NE,TX')
    await pin('/api/public/states-compare?states=TX,GA')
  })

  it('code pages', async () => {
    for (const path of [
      'icd-10-cm/F20.0',
      'icd-10-cm/F20.9',
      'icd-10-cm/F31.10',
      'icd-10-cm/F32.1',
      'icd-10-cm/N18.6',
      'icd-10-cm/F20',
      'hcpcs/E0605',
      'hcpcs/E0611',
      'cpt/90834',
    ]) {
      calls += 1
      const res = await call(`/api/public/codes/${path}`, {
        host: `pin-${String(calls)}.example.com`,
        vars: { SITE_MODE: 'public' },
      })
      expect([res.status, res.status === 200 ? stable(await res.json()) : null]).toMatchSnapshot(
        path,
      )
    }
  })

  it('sitemap codes', async () => {
    expect(await includedCodePage(db, 0, 1000)).toMatchSnapshot()
  })
})

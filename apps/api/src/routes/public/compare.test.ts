import { compareResponseSchema } from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import { refCodes } from '../../db/schema'
import { call } from '../../test/access-fixtures'
import { icd, publishVersion, seedPublicStates } from '../../test/public-fixtures'

// GET /api/public/compare (roadmap M4 step 1). Fixture: GA published (F20.0 and F10.* under
// Mental health, F codes overridden to SUD by chapter 5; C50.* Cancer; E0250 Equipment), MT
// announced, NE none. Here MT also gets a published list.

const db = createDb(env.DB)

let calls = 0

async function compare(query: string) {
  calls += 1
  return call(`/api/public/compare?${query}`, {
    host: `compare-${String(calls)}.example.com`,
    vars: { SITE_MODE: 'public' },
  })
}

async function body(query: string) {
  const res = await compare(query)
  expect(res.status).toBe(200)
  return compareResponseSchema.parse(await res.json())
}

beforeEach(async () => {
  await seedPublicStates()
  await publishVersion('MT', 'published', [
    icd('F10', 'Substance use', {
      includesChildren: 1,
      qualification: 'standalone',
      tier: 'Tier 1',
    }),
    icd('F2', 'Mental health', { matchKind: 'prefix' }),
    icd('F319', 'Mental health', { descriptionPublished: 'Bipolar, unspecified' }),
  ])
  await db.insert(refCodes).values([
    {
      codeSystem: 'icd10cm',
      codeNorm: 'F200',
      description: 'Paranoid schizophrenia',
      validFrom: '2026-10-01',
      chapter: '5',
      billable: 1,
    },
    {
      codeSystem: 'icd10cm',
      codeNorm: 'F10',
      description: 'Alcohol related disorders',
      validFrom: '2026-10-01',
      chapter: '5',
      billable: 0,
    },
  ])
})

describe('GET /api/public/compare', () => {
  it('aligns the codes of a federal category across states', async () => {
    const res = await body('states=ga,mt,ne&category=sud')

    expect(res.states).toEqual([
      { id: 'GA', slug: 'ga', name: 'Georgia', published: true },
      { id: 'MT', slug: 'mt', name: 'Montana', published: true },
      { id: 'NE', slug: 'ne', name: 'Nebraska', published: false },
    ])
    // GA's F codes count as SUD (chapter override); MT has no SUD mapping, so none of its own.
    expect(res.rows.map((r) => r.display)).toEqual(['F10.*', 'F20.0'])
    const [f10, f200] = res.rows
    expect(f10?.cells.map((c) => c.status)).toEqual(['exact', 'exact', 'no_list'])
    expect(f10?.cells[1]?.match).toMatchObject({
      display: 'F10.*',
      tier: 'Tier 1',
      qualification: 'standalone',
      stateCategory: 'Substance use',
      federalCategories: ['unmapped'],
    })
    expect(f200?.cells.map((c) => c.status)).toEqual(['exact', 'covered', 'no_list'])
    expect(f200).toMatchObject({
      codePath: '/codes/icd-10-cm/F20.0',
      description: 'Paranoid schizophrenia',
      descriptionSource: 'cms',
    })
    expect(f10).toMatchObject({ codePath: null, description: 'Alcohol related disorders' })
    expect(res).toMatchObject({ totalRows: 2, page: 1, pageCount: 1, pageSize: 100 })
  })

  it("compares one state's own category, with the state's text where CMS has none", async () => {
    const res = await body('states=GA&ownState=MT&ownCategory=mental%20health')

    expect(res.states.map((s) => s.id)).toEqual(['MT', 'GA'])
    expect(res.rows.map((r) => r.display)).toEqual(['F2*', 'F31.9'])
    expect(res.rows[0]?.cells.map((c) => c.status)).toEqual(['exact', 'narrower'])
    expect(res.rows[0]?.cells[1]?.narrowerCount).toBe(1)
    expect(res.rows[1]).toMatchObject({
      description: 'Bipolar, unspecified',
      descriptionSource: 'MT',
    })
  })

  it('never shows draft entries', async () => {
    const res = await body('states=GA&ownState=GA&ownCategory=Draft%20only')
    expect(res.rows).toEqual([])
  })

  it('answers 400 for a bad query or an unknown state', async () => {
    for (const q of [
      'states=GA',
      'states=GA&category=cancer',
      'states=ZZ&category=sud',
      'states=GA&category=sud&page=x',
    ]) {
      const res = await compare(q)
      expect(res.status, q).toBe(400)
      expect(await res.json()).toHaveProperty('error')
    }
  })

  it('is cached on data_version like the other public routes', async () => {
    const res = await compare('states=GA&category=sud')
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
  })
})

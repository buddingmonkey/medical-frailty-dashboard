import {
  publicStateDetailResponseSchema,
  statesCompareDiffers,
  type StatesCompareResponse,
  statesCompareResponseSchema,
  statesCompareQueryFromRecord,
} from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import { publicStatesCompare } from '../../db/public-states-compare'
import { call } from '../../test/access-fixtures'
import { seedStatesCompare } from '../../test/overview-fixtures'

// GET /api/public/states-compare (roadmap M5 step 7): only the codes where 2–4 states differ,
// grouped by published unified category. The fixture (src/test/overview-fixtures.ts) is small
// enough to check by hand. States with a list: GA, MT, NE (LA announced, no list).
//
//   GA: F20.0 (alone), F31.* (needs another code), F32 header (doesn't say), E0601 (alone), E0602
//   MT: F20.0–F20.9 (alone), F31.*–F32.* (alone), E0601 (alone)
//   NE: F20.0 (needs another code), N18.6 (alone), Z99.2 (alone, in no unified category)
//
// GA vs MT: F20.0 GA listed, MT covered, both alone → same. F31.* and F32: both, different rules
// → differ. E0601 same. E0602 only GA. The two MT ranges: GA has narrower codes only → differ.

const db = createDb(env.DB)
let calls = 0

async function get(path: string) {
  calls += 1
  return call(path, { host: `sc-${String(calls)}.example.com`, vars: { SITE_MODE: 'public' } })
}

async function compare(search: string) {
  const res = await get(`/api/public/states-compare?${search}`)
  expect(res.status).toBe(200)
  return statesCompareResponseSchema.parse(await res.json())
}

/** Every group as `label counts rows/allRows`, then its rows with the cells in words. */
const outline = (body: StatesCompareResponse) =>
  body.groups.map((g) => [
    `${g.label} ${g.counts.join('/')} ${String(g.rowCount)}/${String(g.allRows)}${g.continued ? ' (continued)' : ''}`,
    ...g.rows.map(
      (r) =>
        `${r.display}: ${r.cells
          .map((c) =>
            c.match
              ? `${c.status} ${c.match.qualification}`
              : c.status === 'narrower'
                ? `narrower ${String(c.narrowerCount)}`
                : c.status,
          )
          .join(' | ')}${r.differs ? '' : ' (same)'}`,
    ),
  ])

beforeEach(async () => {
  await seedStatesCompare()
})

describe('GET /api/public/states-compare', () => {
  it('two states: only-in and shared counts, and their stored similarity', async () => {
    const body = await compare('states=GA,MT')
    expect(body.states).toEqual([
      { id: 'GA', slug: 'ga', name: 'Georgia', hasList: true },
      { id: 'MT', slug: 'mt', name: 'Montana', hasList: true },
    ])
    expect(body.choices.map((s) => s.id)).toEqual(['GA', 'MT', 'NE'])
    // GA set: F200 F3110 F3120 E0601 E0602; MT: F200 F201 F209 F3110 F3120 F320 F321 E0601.
    expect(body.summary).toEqual({
      only: [1, 2],
      all: 4,
      rows: 7,
      differing: 4,
      similarity: { jaccard: 4 / 9, shared: 4, onlyFirst: 1, onlySecond: 4 },
    })
    // The column order is the URL's; the pair is stored once.
    const swapped = await compare('states=MT,GA')
    expect(swapped.summary?.only).toEqual([2, 1])
    expect(swapped.summary?.similarity).toEqual({
      jaccard: 4 / 9,
      shared: 4,
      onlyFirst: 4,
      onlySecond: 1,
    })
  })

  it('shows only the differences by default, grouped by unified category in overview order', async () => {
    const body = await compare('states=GA,MT')
    expect(body.query).toEqual({ diff: true })
    expect(outline(body)).toEqual([
      [
        'Serious mental illness 3/5 3/5',
        'F20.0–F20.9: narrower 1 | exact standalone',
        'F31.*: exact needs_support | covered standalone',
        'F31.*–F32.*: narrower 2 | exact standalone',
      ],
      ['Equipment 2/1 1/2', 'E0602: exact unknown | not_listed'],
    ])
    expect(body).toMatchObject({ totalRows: 4, totalGroups: 2, page: 1, pageCount: 1 })
    const f31 = body.groups[0]?.rows[1]
    expect(f31).toMatchObject({
      key: 'icd10cm|prefix|F31',
      wildcard: true,
      codePath: null,
      description: 'Code F31',
      descriptionSource: 'cms',
    })
    expect(f31?.cells[1]?.match?.display).toBe('F31.*–F32.*')
    expect(body.groups[0]?.slug).toBe('serious-mental-illness')
  })

  it('diff=0 shows every code; a code all list under the same rule does not differ', async () => {
    const body = await compare('states=GA,MT&diff=0')
    expect(body.query).toEqual({ diff: false })
    expect(outline(body)).toEqual([
      [
        'Serious mental illness 3/5 5/5',
        'F20.0: exact standalone | covered standalone (same)',
        'F20.0–F20.9: narrower 1 | exact standalone',
        'F31.*: exact needs_support | covered standalone',
        'F31.*–F32.*: narrower 2 | exact standalone',
        'F32: exact unknown | covered standalone (same)',
      ],
      [
        'Equipment 2/1 2/2',
        'E0601: exact standalone | exact standalone (same)',
        'E0602: exact unknown | not_listed',
      ],
    ])
    expect(body.totalRows).toBe(7)
    // The SQL's rule is the shared one.
    for (const row of body.groups.flatMap((g) => g.rows)) {
      expect(row.differs, row.display).toBe(statesCompareDiffers(row.cells))
    }
  })

  it('three states: a code in no published unified category goes in a last group', async () => {
    const body = await compare('states=GA,MT,NE')
    expect(body.summary).toEqual({
      only: [1, 2, 2],
      all: 1,
      rows: 9,
      differing: 9,
      similarity: null,
    })
    expect(outline(body)).toEqual([
      [
        'Serious mental illness 3/5/1 5/5',
        'F20.0: exact standalone | covered standalone | exact needs_support',
        'F20.0–F20.9: narrower 1 | exact standalone | narrower 1',
        'F31.*: exact needs_support | covered standalone | not_listed',
        'F31.*–F32.*: narrower 2 | exact standalone | not_listed',
        'F32: exact unknown | covered standalone | not_listed',
      ],
      [
        'Equipment 2/1/0 2/2',
        'E0601: exact standalone | exact standalone | not_listed',
        'E0602: exact unknown | not_listed | not_listed',
      ],
      ['Kidney failure 0/0/1 1/1', 'N18.6: not_listed | not_listed | exact standalone'],
      [
        'Not in any comparison category 0/0/1 1/1',
        'Z99.2: not_listed | not_listed | exact standalone',
      ],
    ])
    expect(body.groups.at(-1)).toMatchObject({ key: 'none', slug: null })
  })

  it('pages by groups and splits a group longer than a page', async () => {
    const page = (n: number) =>
      publicStatesCompare(db, ['GA', 'MT'], statesCompareQueryFromRecord({ page: String(n) }), {
        dataVersion: 0,
        pageRows: 2,
      })
    const first = await page(1)
    expect(first).toMatchObject({ page: 1, pageCount: 2, totalRows: 4, totalGroups: 2 })
    expect(first && outline(first).map((g) => g[0])).toEqual(['Serious mental illness 3/5 3/5'])
    const second = await page(2)
    expect(second && outline(second)).toEqual([
      ['Serious mental illness 3/5 3/5 (continued)', 'F31.*–F32.*: narrower 2 | exact standalone'],
      ['Equipment 2/1 1/2', 'E0602: exact unknown | not_listed'],
    ])
    // Past the end: the last page.
    expect((await page(9))?.page).toBe(2)
  })

  it('a state without a list: the states, the pickers, nothing compared', async () => {
    const body = await compare('states=GA,LA')
    expect(body.states.map((s) => [s.id, s.hasList])).toEqual([
      ['GA', true],
      ['LA', false],
    ])
    expect(body).toMatchObject({ summary: null, groups: [], totalRows: 0, pageCount: 1 })
  })

  it('answers 404 for an unknown state and 400 for anything but 2–4 different states', async () => {
    expect((await get('/api/public/states-compare?states=GA,ZZ')).status).toBe(404)
    for (const bad of ['', 'states=GA', 'states=GA,GA', 'states=GA,MT,NE,LA,TX', 'states=G1,MT']) {
      expect((await get(`/api/public/states-compare?${bad}`)).status, bad).toBe(400)
    }
  })

  it('caches on data_version like every public route', async () => {
    const res = await get('/api/public/states-compare?states=GA,MT')
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
  })
})

describe('states like mine (GET /api/public/states/:slug)', () => {
  it('lists the most similar states with a list, most similar first', async () => {
    const res = await get('/api/public/states/ga')
    expect(res.status).toBe(200)
    const body = publicStateDetailResponseSchema.parse(await res.json())
    // GA–MT: 4 shared, 1 only GA, 4 only MT. GA–NE: F200 shared, 4 only GA, 2 only NE.
    expect(body.similar).toEqual([
      {
        id: 'MT',
        slug: 'mt',
        name: 'Montana',
        jaccard: 4 / 9,
        shared: 4,
        onlyThis: 1,
        onlyOther: 4,
      },
      {
        id: 'NE',
        slug: 'ne',
        name: 'Nebraska',
        jaccard: 1 / 7,
        shared: 1,
        onlyThis: 4,
        onlyOther: 2,
      },
    ])
    const ne = publicStateDetailResponseSchema.parse(
      await (await get('/api/public/states/ne')).json(),
    )
    expect(ne.similar.map((s) => [s.id, s.onlyThis, s.onlyOther])).toEqual([
      ['GA', 2, 4],
      ['MT', 2, 7],
    ])
  })

  it('is empty for a state without a list', async () => {
    const body = publicStateDetailResponseSchema.parse(
      await (await get('/api/public/states/la')).json(),
    )
    expect(body.similar).toEqual([])
  })
})

import { type CodeSystem, comparePatternKey, entryCovers, type MatchKind } from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { ADMIN } from '../test/access-fixtures'
import { publishVersion } from '../test/public-fixtures'
import { resetDb } from '../test/reset-db'
import { createDb } from './client'
import { includedCodePage } from './public-code-sitemap'
import {
  containsSql,
  entryCols,
  entryCoversSql,
  patternKeySql,
  rangeCoversSql,
  rowColumnsSql,
  rowCols,
} from './code-match'
import { keyOf, shared } from './public-drill'
import { coveredCodes, patternKey } from './public-overview'
import { entryUnified, refCodes, states, unifiedCategories, unifiedUniverse } from './schema'
import { similaritySetsCtes } from './similarity'

// Parity of the code-matching rules (docs/data-model.md, "Matching across states"): the
// TypeScript `entryCovers` and `comparePatternKey` are the reference, and the SQL builders of
// src/db/code-match.ts, alone and in every query that uses them, must give the same answers.
// Each fixture entry is the whole published list of its own state, so a (state, code) pair says
// "this entry covers this code". (Before the builders, 2026-11-04, five copies of the rules ran
// this test and agreed.)

interface Entry {
  codeSystem: CodeSystem
  codeNorm: string
  matchKind: MatchKind
  rangeEndNorm: string | null
  includesChildren: 0 | 1 | null
}

const exact = (system: CodeSystem, norm: string, kids: 0 | 1 | null = null): Entry => ({
  codeSystem: system,
  codeNorm: norm,
  matchKind: 'exact',
  rangeEndNorm: null,
  includesChildren: kids,
})
const prefix = (system: CodeSystem, norm: string, kids: 0 | 1 | null = null): Entry => ({
  ...exact(system, norm, kids),
  matchKind: 'prefix',
})
const range = (
  system: CodeSystem,
  start: string,
  end: string,
  kids: 0 | 1 | null = null,
): Entry => ({
  codeSystem: system,
  codeNorm: start,
  matchKind: 'range',
  rangeEndNorm: end,
  includesChildren: kids,
})

const fixture: Entry[] = [
  // Exact codes, with and without children (null is read as 0).
  exact('icd10cm', 'F200'),
  exact('icd10cm', 'F200', 0),
  exact('icd10cm', 'F20', 1),
  exact('icd10cm', 'F20', 0),
  exact('icd10cm', 'F3110', 1),
  exact('icd10cm', 'C7A010'),
  exact('icd10cm', 'S14111A', 1),
  // Wildcards at each level.
  prefix('icd10cm', 'F'),
  prefix('icd10cm', 'F3'),
  prefix('icd10cm', 'F31'),
  prefix('icd10cm', 'F311', 1),
  prefix('icd10cm', 'C7A', 0),
  // Wildcard ranges, including one that ends in its own category and mixed lengths.
  range('icd10cm', 'F41', 'F42', 1),
  range('icd10cm', 'F31', 'F32', 1),
  range('icd10cm', 'F32', 'F32', 1),
  range('icd10cm', 'F320', 'F329', 1),
  range('icd10cm', 'F2', 'F3', 1),
  range('icd10cm', 'F200', 'F21', 1),
  range('icd10cm', 'C7A', 'C7B', 1),
  // Same-length ranges.
  range('icd10cm', 'F41', 'F42'),
  range('icd10cm', 'F41', 'F42', 0),
  range('icd10cm', 'E08621', 'E08622'),
  range('icd10cm', 'E08621', 'E08623'),
  range('icd10cm', 'D80', 'D83'),
  range('icd10cm', 'F200', 'F209'),
  range('icd10cm', 'F3110', 'F3120', 0),
  range('icd10cm', 'F20', 'F209'),
  range('icd10cm', 'S14111A', 'S14111D'),
  // HCPCS: alphanumeric, ranges across letters.
  exact('hcpcs', 'E0601'),
  prefix('hcpcs', 'E06'),
  prefix('hcpcs', 'J75', 1),
  range('hcpcs', 'E0600', 'E0610'),
  range('hcpcs', 'E0600', 'E0610', 1),
  range('hcpcs', 'J7500', 'J7599'),
  range('hcpcs', 'A4000', 'B1000'),
  range('hcpcs', 'E06', 'E07', 1),
  // CPT, Category II included; no reference codes.
  exact('cpt', '90791'),
  exact('cpt', '90791', 1),
  range('cpt', '90832', '90838'),
  range('cpt', '0001F', '0010F'),
  range('cpt', '99201', '99205', 1),
  prefix('cpt', '9083'),
]

const icdCodes = [
  'F',
  'F2',
  'F20',
  'F200',
  'F201',
  'F208',
  'F209',
  'F2090',
  'F21',
  'F210',
  'F3',
  'F31',
  'F310',
  'F311',
  'F3110',
  'F3111',
  'F3112',
  'F3120',
  'F3121',
  'F312',
  'F32',
  'F320',
  'F321',
  'F329',
  'F33',
  'F40',
  'F409',
  'F41',
  'F411',
  'F42',
  'F429',
  'F43',
  'F430',
  'E08',
  'E0862',
  'E08621',
  'E08622',
  'E086219',
  'E08623',
  'E08624',
  'D80',
  'D81',
  'D810',
  'D83',
  'D84',
  'C7A',
  'C7A010',
  'C7A0101',
  'C7B',
  'C7B00',
  'C7C',
  'S14111A',
  'S14111B',
  'S14111D',
  'S14111E',
  'S14111',
  'Z992',
]
const hcpcsCodes = [
  'E06',
  'E0600',
  'E0601',
  'E0605',
  'E0610',
  'E0611',
  'E061',
  'E0700',
  'E0799',
  'E0800',
  'J7500',
  'J7550',
  'J7599',
  'J7600',
  'J75',
  'A4000',
  'A9999',
  'B0001',
  'B1000',
  'B1001',
]
const cptCodes = [
  '90791',
  '90792',
  '907910',
  '90832',
  '90834',
  '90838',
  '90839',
  '0001F',
  '0005F',
  '0010F',
  '0011F',
  '99201',
  '99205',
  '99206',
  '9920',
]
const codes: { system: CodeSystem; codeNorm: string }[] = [
  ...icdCodes.map((codeNorm) => ({ system: 'icd10cm' as const, codeNorm })),
  ...hcpcsCodes.map((codeNorm) => ({ system: 'hcpcs' as const, codeNorm })),
  ...cptCodes.map((codeNorm) => ({ system: 'cpt' as const, codeNorm })),
]
const refSet = codes.filter((c) => c.system !== 'cpt')

const db = createDb(env.DB)
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
/** The state holding fixture entry `i`. */
const stateOf = (i: number) => `${letters[Math.floor(i / 26)] ?? 'Z'}${letters[i % 26] ?? 'Z'}`
const isSingle = (e: Entry) => e.matchKind === 'exact' && e.includesChildren !== 1

/** Every (state, code) pair where the entry passes `keep`, as `state code` strings. */
function expected(keep: (e: Entry, c: (typeof codes)[number]) => boolean, among = codes) {
  const out: string[] = []
  fixture.forEach((e, i) => {
    for (const c of among) if (keep(e, c)) out.push(`${stateOf(i)} ${c.system} ${c.codeNorm}`)
  })
  return out.sort()
}
const pairs = (rows: { state: string; sys: string; code: string }[]) =>
  [...new Set(rows.map((r) => `${r.state} ${r.sys} ${r.code}`))].sort()

/** The codes as a subquery `(sys, norm)`. */
const codeRows = sql`SELECT json_extract(value, '$[0]') AS sys, json_extract(value, '$[1]') AS norm
  FROM json_each(${JSON.stringify(codes.map((c) => [c.system, c.codeNorm]))})`
const publishedEntries = sql.raw(`states s JOIN entries e ON e.version_id = s.published_version_id`)

beforeAll(async () => {
  await resetDb(env.DB)
  for (const [i, e] of fixture.entries()) {
    const id = stateOf(i)
    await db
      .insert(states)
      .values({ id, slug: id.toLowerCase(), name: `State ${id}`, fips: String(i) })
    await publishVersion(stateOf(i), 'published', [
      { ...e, rawCode: e.codeNorm, stateCategory: 'Test' },
    ])
  }
  for (const c of refSet) {
    await db.insert(refCodes).values({
      codeSystem: c.system === 'icd10cm' ? 'icd10cm' : 'hcpcs',
      codeNorm: c.codeNorm,
      description: `Code ${c.codeNorm}`,
      billable: 1,
      validFrom: '2026-10-01',
    })
  }
  const [category] = await db
    .insert(unifiedCategories)
    .values({
      slug: 'test',
      label: 'Test',
      definition: 'Test category.',
      federalCategory: 'state_specific',
      status: 'published',
      createdBy: ADMIN,
      updatedBy: ADMIN,
    })
    .returning()
  if (!category) throw new Error('insert failed')
  await db.run(sql`INSERT INTO ${entryUnified} (entry_id, unified_id, basis, reviewed)
    SELECT id, ${category.id}, 'mapping', 1 FROM entries`)
  for (const codeNorm of icdCodes) {
    await db.insert(unifiedUniverse).values({ unifiedId: category.id, codeNorm })
  }
})

describe('pattern key', () => {
  const want = fixture.map((e, i) => `${stateOf(i)} ${comparePatternKey(e)}`).sort()

  it('patternKeySql, keyOf (drill-down) and patternKey (overview) match comparePatternKey', async () => {
    const rows = await db.all<{ state: string; k0: string; k1: string; k2: string }>(sql`
      SELECT s.id AS state, ${patternKeySql(entryCols('e'))} AS k0, ${keyOf('e')} AS k1,
        ${patternKey} AS k2
      FROM ${publishedEntries}`)
    expect(rows.map((r) => `${r.state} ${r.k0}`).sort()).toEqual(want)
    expect(rows.map((r) => `${r.state} ${r.k1}`).sort()).toEqual(want)
    expect(rows.map((r) => `${r.state} ${r.k2}`).sort()).toEqual(want)
  })

  it('the drill-down row key (drows.rk) matches comparePatternKey', async () => {
    const rows0 = sql`SELECT DISTINCT ${rowColumnsSql(entryCols('e'))} FROM ${publishedEntries}`
    const rows = await db.all<{ rk: string }>(sql`${shared(rows0)} SELECT rk FROM drows`)
    expect(rows.map((r) => r.rk).sort()).toEqual(
      [...new Set(fixture.map((e) => comparePatternKey(e)))].sort(),
    )
  })

  it('similarity keys other code systems by comparePatternKey', async () => {
    const rows = await db.all<{ state: string; code: string }>(
      sql`WITH ${similaritySetsCtes} SELECT state_id AS state, code FROM others`,
    )
    expect(rows.map((r) => `${r.state} ${r.code}`).sort()).toEqual(
      fixture
        .flatMap((e, i) =>
          e.codeSystem === 'icd10cm' ? [] : [`${stateOf(i)} ${comparePatternKey(e)}`],
        )
        .sort(),
    )
  })
})

describe('coverage', () => {
  const covers = (e: Entry, c: (typeof codes)[number]) => entryCovers(e, c)

  it('entryCoversSql matches entryCovers, code systems included', async () => {
    const rows = await db.all<{ state: string; sys: string; code: string }>(sql`
      SELECT s.id AS state, c.sys, c.norm AS code
      FROM ${publishedEntries} CROSS JOIN (${codeRows}) c
      WHERE ${entryCoversSql(entryCols('e'), { system: 'c.sys', norm: 'c.norm' })}`)
    const want = expected(covers)
    expect(want.length).toBeGreaterThan(150)
    expect(pairs(rows)).toEqual(want)
  })

  it('the drill-down candidates (shared → cand) match entryCovers', async () => {
    const rows0 = sql`SELECT sys, 'exact' AS kind, norm, NULL AS end_norm, 0 AS wild
      FROM (${codeRows})`
    const rows = await db.all<{ state: string; sys: string; code: string }>(sql`${shared(rows0)}
      SELECT c.state_id AS state, r.sys, r.norm AS code FROM cand c JOIN drows r ON r.rk = c.rk`)
    expect(pairs(rows)).toEqual(expected(covers))
  })

  it('rangeCovers matches entryCovers for ranges', async () => {
    const rows = await db.all<{ state: string; sys: string; code: string }>(sql`
      SELECT s.id AS state, c.sys, c.norm AS code
      FROM ${publishedEntries} CROSS JOIN (${codeRows}) c
      WHERE e.match_kind = 'range' AND c.sys = e.code_system
        AND ${rangeCoversSql(entryCols('e'), 'c.norm')}`)
    expect(pairs(rows)).toEqual(expected((e, c) => e.matchKind === 'range' && covers(e, c)))
  })

  it('containsSql (narrower codes) matches entryCovers for wildcards and ranges', async () => {
    const want = expected((e, c) => !isSingle(e) && covers(e, c))
    const onEntries = await db.all<{ state: string; sys: string; code: string }>(sql`
      SELECT s.id AS state, c.sys, c.norm AS code
      FROM ${publishedEntries} CROSS JOIN (${codeRows}) c
      WHERE c.sys = e.code_system AND ${containsSql(entryCols('e'), 'c.norm')}`)
    expect(pairs(onEntries)).toEqual(want)
    // On drill-down rows, as narrowerCount reads it.
    const onRows = await db.all<{ state: string; sys: string; code: string }>(sql`
      WITH r AS (SELECT s.id AS state, ${rowColumnsSql(entryCols('e'))} FROM ${publishedEntries})
      SELECT r.state, c.sys, c.norm AS code FROM r CROSS JOIN (${codeRows}) c
      WHERE c.sys = r.sys AND ${containsSql(rowCols('r'), 'c.norm')}`)
    expect(pairs(onRows)).toEqual(want)
  })

  it('the overview universe coverage matches entryCovers', async () => {
    const rows = await db.all<{ state: string; sys: string; code: string }>(sql`
      SELECT state_id AS state, 'icd10cm' AS sys, code FROM (${coveredCodes})`)
    expect(pairs(rows)).toEqual(
      expected(
        covers,
        codes.filter((c) => c.system === 'icd10cm'),
      ),
    )
  })

  it('the similarity sets match entryCovers', async () => {
    const rows = await db.all<{ state: string; sys: string; code: string }>(
      sql`WITH ${similaritySetsCtes} SELECT state_id AS state, 'icd10cm' AS sys, code FROM hits`,
    )
    expect(pairs(rows)).toEqual(
      expected(
        covers,
        codes.filter((c) => c.system === 'icd10cm'),
      ),
    )
  })

  it("the sitemap's codes are the listed codes plus the reference codes covered", async () => {
    const want = new Set<string>()
    for (const e of fixture) {
      if (e.matchKind === 'exact') want.add(`${e.codeSystem} ${e.codeNorm}`)
      if (e.matchKind === 'range' && e.includesChildren !== 1 && e.rangeEndNorm !== null) {
        want.add(`${e.codeSystem} ${e.codeNorm}`)
        want.add(`${e.codeSystem} ${e.rangeEndNorm}`)
      }
      for (const c of refSet) if (covers(e, c)) want.add(`${c.system} ${c.codeNorm}`)
    }
    const rows = await includedCodePage(db, 0, 10_000)
    expect(rows.map((r) => `${r.sys} ${r.norm}`).sort()).toEqual([...want].sort())
  })
})

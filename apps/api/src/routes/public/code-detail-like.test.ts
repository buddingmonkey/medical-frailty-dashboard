import { type CodeDetailResponse, codeDetailResponseSchema } from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import { conditionGroups, conditionMembers, states } from '../../db/schema'
import { call } from '../../test/access-fixtures'
import { seedOverview } from '../../test/overview-fixtures'
import { publishVersion } from '../../test/public-fixtures'

// Like codes on GET /api/public/codes/:system/:code (roadmap M6 step 4; docs/data-model.md,
// "Like codes"). The overview fixture (src/test/overview-fixtures.ts):
//   GA: F20.0, F31.*, F32 (header only), HCPCS E0601, E0602
//   MT: F20.0–F20.9, F31.*–F32.*, HCPCS E0601
// plus TX, published here: CPT 96413, 96415 and 96401–96417, HCPCS J9035.
// Groups (made up for the test, not the seed):
//   "Psychoses" (published): ICD-10-CM F20 and HCPCS E0601–E0602.
//   "Test cancer" (published): ICD-10-CM C00–C96, CPT 96401–96549, HCPCS J9000–J9999.
//   "Draft group" (draft): ICD-10-CM F32 and HCPCS E0601. Never shown.

const db = createDb(env.DB)
let calls = 0

async function detail(path: string): Promise<CodeDetailResponse> {
  calls += 1
  const res = await call(`/api/public/codes/${path}`, {
    host: `like-${String(calls)}.example.com`,
    vars: { SITE_MODE: 'public' },
  })
  expect(res.status, path).toBe(200)
  return codeDetailResponseSchema.parse(await res.json())
}

const state = (body: CodeDetailResponse, id: string) => body.states.find((s) => s.id === id)
const likeOf = (body: CodeDetailResponse, id: string) =>
  (state(body, id)?.likeCodes ?? []).map((l) => ({
    group: l.group.slug,
    total: l.total,
    codes: l.entries.map((e) => `${e.codeSystem} ${e.display}`),
  }))

async function group(
  slug: string,
  name: string,
  status: 'draft' | 'published',
  members: {
    codeSystem: 'icd10cm' | 'cpt' | 'hcpcs'
    matchKind: 'exact' | 'prefix' | 'range'
    codeNorm: string
    rangeEndNorm?: string
  }[],
) {
  const [row] = await db
    .insert(conditionGroups)
    .values({ slug, name, status })
    .returning({ id: conditionGroups.id })
  await db
    .insert(conditionMembers)
    .values(members.map((m) => ({ rangeEndNorm: null, ...m, groupId: row?.id ?? 0 })))
}

beforeEach(async () => {
  await seedOverview()
  await db.insert(states).values({
    id: 'TX',
    slug: 'tx',
    name: 'Texas',
    fips: '48',
  })
  await publishVersion('TX', 'published', [
    { codeSystem: 'cpt', rawCode: '96413', codeNorm: '96413', stateCategory: 'Cancer' },
    { codeSystem: 'cpt', rawCode: '96415', codeNorm: '96415', stateCategory: 'Cancer' },
    {
      codeSystem: 'cpt',
      rawCode: '96401-96417',
      codeNorm: '96401',
      matchKind: 'range',
      rangeEndNorm: '96417',
      includesChildren: 0,
      stateCategory: 'Cancer',
    },
    { codeSystem: 'hcpcs', rawCode: 'J9035', codeNorm: 'J9035', stateCategory: 'Cancer' },
    { codeSystem: 'hcpcs', rawCode: 'J9045', codeNorm: 'J9045', stateCategory: 'Cancer' },
    { codeSystem: 'hcpcs', rawCode: 'J9060', codeNorm: 'J9060', stateCategory: 'Cancer' },
    { codeSystem: 'hcpcs', rawCode: 'J9065', codeNorm: 'J9065', stateCategory: 'Cancer' },
  ])
  await group('psychoses', 'Psychoses', 'published', [
    { codeSystem: 'icd10cm', matchKind: 'prefix', codeNorm: 'F20' },
    { codeSystem: 'hcpcs', matchKind: 'range', codeNorm: 'E0601', rangeEndNorm: 'E0602' },
  ])
  await group('test-cancer', 'Test cancer', 'published', [
    { codeSystem: 'icd10cm', matchKind: 'range', codeNorm: 'C00', rangeEndNorm: 'C96' },
    { codeSystem: 'cpt', matchKind: 'range', codeNorm: '96401', rangeEndNorm: '96549' },
    { codeSystem: 'hcpcs', matchKind: 'range', codeNorm: 'J9000', rangeEndNorm: 'J9999' },
  ])
  await group('draft-group', 'Draft group', 'draft', [
    { codeSystem: 'icd10cm', matchKind: 'exact', codeNorm: 'F32' },
    { codeSystem: 'hcpcs', matchKind: 'exact', codeNorm: 'E0601' },
  ])
})

describe('like codes on the code detail page', () => {
  it('names the published groups the code is in', async () => {
    expect((await detail('hcpcs/E0602')).conditionGroups).toEqual([
      { slug: 'psychoses', name: 'Psychoses' },
    ])
    // F32.0 is only in the draft group.
    expect((await detail('icd-10-cm/F32.0')).conditionGroups).toEqual([])
  })

  it('gives a state that does not list the code its codes in another system, same group', async () => {
    const body = await detail('hcpcs/E0602')
    // GA lists E0602: confirmed, so no like codes.
    expect(state(body, 'GA')).toMatchObject({ status: 'exact', likeCodes: [] })
    // MT does not list E0602, but lists F20.0–F20.9 (ICD-10-CM) in the same group. Its E0601 is
    // HCPCS, the code's own system, so it is not a like code.
    expect(state(body, 'MT')?.status).toBe('not_listed')
    expect(likeOf(body, 'MT')).toEqual([
      { group: 'psychoses', total: 1, codes: ['icd10cm F20.0–F20.9'] },
    ])
    expect(state(body, 'MT')?.likeCodes?.[0]?.entries[0]).toEqual({
      codeSystem: 'icd10cm',
      rawCode: 'F200',
      display: 'F20.0–F20.9',
      description: null,
      stateCategory: 'SMI',
      stateSubcategory: '',
      source: { title: 'MT list published', url: null, publisherDate: null, locator: null },
    })
    // A state with no list has no like codes; TX's codes are in another group.
    expect(state(body, 'LA')?.likeCodes).toEqual([])
    expect(state(body, 'TX')?.likeCodes).toEqual([])
  })

  it('also gives like codes to a state with only narrower codes', async () => {
    const body = await detail('icd-10-cm/F20')
    expect(state(body, 'GA')?.status).toBe('narrower')
    expect(likeOf(body, 'GA')).toEqual([
      { group: 'psychoses', total: 2, codes: ['hcpcs E0601', 'hcpcs E0602'] },
    ])
    expect(likeOf(body, 'MT')).toEqual([{ group: 'psychoses', total: 1, codes: ['hcpcs E0601'] }])
  })

  it('never uses a draft group', async () => {
    const body = await detail('icd-10-cm/F32.0')
    expect(state(body, 'GA')?.status).toBe('not_listed')
    expect(state(body, 'GA')?.likeCodes).toEqual([])
  })

  it('finds a diagnosis’s like codes among ranges, and lists five per group with the total', async () => {
    // C50.911 is not in this fixture's ref_codes, so the page exists only if a state lists it.
    await publishVersion('NE', 'published', [
      { codeSystem: 'icd10cm', rawCode: 'C50.911', codeNorm: 'C50911', stateCategory: 'Cancer' },
    ])
    const body = await detail('icd-10-cm/C50.911')
    expect(state(body, 'NE')?.status).toBe('exact')
    expect(body.conditionGroups).toEqual([{ slug: 'test-cancer', name: 'Test cancer' }])
    expect(likeOf(body, 'TX')).toEqual([
      {
        group: 'test-cancer',
        total: 7,
        codes: ['cpt 96401–96417', 'cpt 96413', 'cpt 96415', 'hcpcs J9035', 'hcpcs J9045'],
      },
    ])
    expect(state(body, 'GA')?.likeCodes).toEqual([])
  })

  it('finds a service’s like codes through a state’s wildcard diagnosis', async () => {
    await publishVersion('NE', 'published', [
      {
        codeSystem: 'icd10cm',
        rawCode: 'C*',
        codeNorm: 'C',
        matchKind: 'prefix',
        stateCategory: 'Cancer',
      },
      {
        codeSystem: 'icd10cm',
        rawCode: 'B90-C01',
        codeNorm: 'B90',
        matchKind: 'range',
        rangeEndNorm: 'C01',
        includesChildren: 1,
        stateCategory: 'Cancer',
      },
      { codeSystem: 'icd10cm', rawCode: 'D50', codeNorm: 'D50', stateCategory: 'Other' },
    ])
    const body = await detail('cpt/96413')
    expect(state(body, 'TX')?.status).toBe('exact')
    expect(likeOf(body, 'NE')).toEqual([
      { group: 'test-cancer', total: 2, codes: ['icd10cm B90.*–C01.*', 'icd10cm C*'] },
    ])
  })
})

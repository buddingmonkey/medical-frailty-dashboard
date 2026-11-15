import {
  compareResponseSchema,
  publicStateDetailResponseSchema,
  publicStatesResponseSchema,
} from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import { categoryMappings, entries, states } from '../../db/schema'
import { ADMIN, call } from '../../test/access-fixtures'
import { send } from '../../test/draft-fixtures'
import { seedOverview } from '../../test/overview-fixtures'

// A code's federal category follows its unified categories' federal parents (roadmap M5 step
// 5b; docs/data-model.md, "Federal categories"), the M2 mapping only for a code placed nowhere.
// Fixture: the overview's (GA's Behavioral Health placed by CCSR in "Serious mental illness",
// not reviewed; DME approved to "Equipment"; MT approved throughout), plus a published
// "Bipolar" (TST002, parent serious_complex_medical) so GA's F31.* sits in two categories with
// different parents, and one GA entry placed nowhere (HCPCS G0001 under "Other", mapped by hand
// to SUD).

const db = createDb(env.DB)
let calls = 0

async function get(path: string) {
  calls += 1
  const res = await call(path, {
    host: `federal-${String(calls)}.example.com`,
    vars: { SITE_MODE: 'public' },
  })
  expect(res.status).toBe(200)
  return res
}

beforeEach(async () => {
  await seedOverview()
  const bipolar = await send('POST', '/api/admin/unified', {
    label: 'Bipolar',
    definition: 'Test category.',
    includes: null,
    excludes: null,
    federalCategory: 'serious_complex_medical',
    status: 'published',
    sortOrder: 3,
    ccsr: ['TST002'],
  })
  expect(bipolar.status).toBe(201)
  const [ga] = await db
    .select({ versionId: states.publishedVersionId, sourceDocumentId: entries.sourceDocumentId })
    .from(states)
    .innerJoin(entries, eq(entries.versionId, states.publishedVersionId))
    .where(eq(states.id, 'GA'))
    .limit(1)
  if (!ga?.versionId) throw new Error('GA has no published version')
  await db.insert(entries).values({
    versionId: ga.versionId,
    sourceDocumentId: ga.sourceDocumentId,
    codeSystem: 'hcpcs',
    rawCode: 'G0001',
    codeNorm: 'G0001',
    stateCategory: 'Other',
  })
  await db.insert(categoryMappings).values({
    stateId: 'GA',
    stateCategory: 'Other',
    federalCategory: 'sud',
    method: 'manual',
    mappedBy: ADMIN,
  })
})

describe('federal categories through unified categories', () => {
  it('counts each entry once under every federal parent of its placements', async () => {
    const body = publicStatesResponseSchema.parse(await (await get('/api/public/states')).json())
    const ga = body.items.find((s) => s.id === 'GA')?.published
    expect(ga?.totalEntries).toBe(6)
    expect(ga?.byFederalCategory).toEqual({
      blind_or_disabled: 0,
      // G0001: placed nowhere, so its M2 mapping.
      sud: 1,
      // F20.0, F31.*, F32 in "Serious mental illness".
      disabling_mental_disorder: 3,
      // E0601, E0602 in "Equipment".
      physical_idd_adl: 2,
      // F31.* in "Bipolar" too: it counts under both.
      serious_complex_medical: 1,
      state_specific: 0,
      unmapped: 0,
    })
    // CCSR placements nobody reviewed.
    expect(ga?.mappingsConfirmed).toBe(false)
    // Every MT placement comes from an approved mapping; MT has no M2 mapping at all.
    const mt = body.items.find((s) => s.id === 'MT')?.published
    expect(mt?.byFederalCategory).toMatchObject({
      disabling_mental_disorder: 2,
      physical_idd_adl: 1,
    })
    expect(mt?.mappingsConfirmed).toBe(true)
  })

  it('lists a state category once per federal category, confirmed by review', async () => {
    const body = publicStateDetailResponseSchema.parse(
      await (await get('/api/public/states/ga')).json(),
    )
    expect(body.categories).toEqual([
      {
        stateCategory: 'Behavioral Health',
        stateSubcategory: '',
        federalCategory: 'disabling_mental_disorder',
        confirmed: false,
        stated: false,
        entries: 3,
      },
      {
        stateCategory: 'Behavioral Health',
        stateSubcategory: '',
        federalCategory: 'serious_complex_medical',
        confirmed: false,
        stated: false,
        entries: 1,
      },
      {
        stateCategory: 'DME',
        stateSubcategory: '',
        federalCategory: 'physical_idd_adl',
        confirmed: true,
        stated: false,
        entries: 2,
      },
      {
        stateCategory: 'Other',
        stateSubcategory: '',
        federalCategory: 'sud',
        confirmed: true,
        stated: false,
        entries: 1,
      },
    ])
  })

  it('an unplaced entry with only a keyword guess is not confirmed', async () => {
    await db
      .update(categoryMappings)
      .set({ method: 'auto', mappedBy: null })
      .where(and(eq(categoryMappings.stateId, 'GA'), eq(categoryMappings.stateCategory, 'Other')))
    const body = publicStateDetailResponseSchema.parse(
      await (await get('/api/public/states/ga')).json(),
    )
    expect(body.categories.find((c) => c.stateCategory === 'Other')?.confirmed).toBe(false)
  })

  it('downloads list every federal category of a code', async () => {
    const csv = (await (await get('/states/ga/codes.csv')).text()).trimEnd().split('\r\n')
    expect(csv[0]).toContain(',state_subcategory,federal_categories,tier,')
    const f31 = csv.find((l) => l.includes(',F31,'))
    expect(f31).toContain(',Disabling mental disorder; Serious or complex medical condition,')
    expect(csv.find((l) => l.includes(',G0001,'))).toContain(',Substance use disorder,')

    const json = await (
      await get('/states/ga/codes.json')
    ).json<{
      entries: { code: string; federalCategories: string[] }[]
    }>()
    expect(json.entries.find((e) => e.code === 'F31')?.federalCategories).toEqual([
      'disabling_mental_disorder',
      'serious_complex_medical',
    ])
  })

  it('the code table filters and files by every federal category of a code', async () => {
    const body = compareResponseSchema.parse(
      await (await get('/api/public/compare?states=GA,MT&category=serious_complex_medical')).json(),
    )
    expect(body.rows.map((r) => r.display)).toEqual(['F31.*'])
    const [ga, mt] = body.rows[0]?.cells ?? []
    expect(ga?.match?.federalCategories).toEqual([
      'disabling_mental_disorder',
      'serious_complex_medical',
    ])
    // MT's range sits in "Serious mental illness" only.
    expect(mt?.match?.federalCategories).toEqual(['disabling_mental_disorder'])
  })
})

describe('federal categories the state published (Indiana’s column)', () => {
  beforeEach(async () => {
    // G0001 ("Other", mapped by hand to SUD) and F20.0 (placed by an unreviewed CCSR guess).
    await db
      .update(entries)
      .set({ stateFederalCategories: 'blind_or_disabled,serious_complex_medical' })
      .where(eq(entries.codeNorm, 'G0001'))
    await db
      .update(entries)
      .set({ stateFederalCategories: 'sud' })
      .where(and(eq(entries.codeNorm, 'F200'), eq(entries.stateCategory, 'Behavioral Health')))
  })

  it('counts an entry under exactly the state’s federal categories, ahead of everything', async () => {
    const body = publicStatesResponseSchema.parse(await (await get('/api/public/states')).json())
    const ga = body.items.find((s) => s.id === 'GA')?.published
    expect(ga?.byFederalCategory).toEqual({
      blind_or_disabled: 1,
      // F20.0 by the state, not its placement in "Serious mental illness".
      sud: 1,
      disabling_mental_disorder: 2,
      physical_idd_adl: 2,
      // F31.* in "Bipolar", and G0001 by the state.
      serious_complex_medical: 2,
      state_specific: 0,
      unmapped: 0,
    })
    // F31.* and F32 are still unreviewed CCSR placements.
    expect(ga?.mappingsConfirmed).toBe(false)
  })

  it('shows those rows as stated by the state, which counts as confirmed', async () => {
    const body = publicStateDetailResponseSchema.parse(
      await (await get('/api/public/states/ga')).json(),
    )
    const rows = body.categories.map((c) => [
      c.stateCategory,
      c.federalCategory,
      c.confirmed,
      c.stated,
      c.entries,
    ])
    expect(rows).toEqual([
      ['Behavioral Health', 'sud', true, true, 1],
      ['Behavioral Health', 'disabling_mental_disorder', false, false, 2],
      ['Behavioral Health', 'serious_complex_medical', false, false, 1],
      ['DME', 'physical_idd_adl', true, false, 2],
      ['Other', 'blind_or_disabled', true, true, 1],
      ['Other', 'serious_complex_medical', true, true, 1],
    ])
  })

  it('makes a state confirmed when every entry is stated or reviewed', async () => {
    await db
      .update(entries)
      .set({ stateFederalCategories: 'disabling_mental_disorder' })
      .where(eq(entries.stateCategory, 'Behavioral Health'))
    const body = publicStatesResponseSchema.parse(await (await get('/api/public/states')).json())
    expect(body.items.find((s) => s.id === 'GA')?.published?.mappingsConfirmed).toBe(true)
  })

  it('uses them in downloads and the code table', async () => {
    const csv = (await (await get('/states/ga/codes.csv')).text()).trimEnd().split('\r\n')
    expect(csv.find((l) => l.includes(',G0001,'))).toContain(
      ',Blind or disabled; Serious or complex medical condition,',
    )
    const body = compareResponseSchema.parse(
      await (await get('/api/public/compare?states=GA,MT&category=blind_or_disabled')).json(),
    )
    expect(body.rows.map((r) => r.display)).toEqual(['G0001'])
  })
})

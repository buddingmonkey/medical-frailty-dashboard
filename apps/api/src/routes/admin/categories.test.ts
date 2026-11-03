import {
  auditListResponseSchema,
  remapPreviewResponseSchema,
  stateCategoriesResponseSchema,
} from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import {
  appMeta,
  categoryMappings,
  chapterMappings,
  datasetVersions,
  entries,
  entryUnified,
  sourceDocuments,
  states,
  unifiedCategories,
} from '../../db/schema'
import { ADMIN, accessToken, call } from '../../test/access-fixtures'
import { resetDb } from '../../test/reset-db'

const db = createDb(env.DB)

async function send(method: string, path: string, body?: unknown) {
  return call(path, { token: await accessToken(), method, ...(body === undefined ? {} : { body }) })
}

async function categories(stateId = 'MT') {
  const res = await send('GET', `/api/admin/states/${stateId}/categories`)
  expect(res.status).toBe(200)
  return stateCategoriesResponseSchema.parse(await res.json())
}

let publishedId = 0
let draftId = 0

/** MT: a published version (SMI ×2, SUD ×1) and a draft (SMI, a new "Tier 2" category). */
async function seed() {
  await db.insert(states).values([
    { id: 'MT', slug: 'mt', name: 'Montana', fips: '30' },
    { id: 'NE', slug: 'ne', name: 'Nebraska', fips: '31' },
  ])
  const [doc] = await db
    .insert(sourceDocuments)
    .values({
      stateId: 'MT',
      title: 'MT list',
      fileType: 'pdf',
      sha256: 'a'.repeat(64),
      r2Key: 'sources/mt',
      byteSize: 1,
      uploadedBy: ADMIN,
    })
    .returning()
  const [published, draft] = await db
    .insert(datasetVersions)
    .values([
      {
        stateId: 'MT',
        versionNo: 1,
        status: 'published' as const,
        createdBy: ADMIN,
        contentUpdatedAt: '2026-11-01T00:00:00.000Z',
      },
      { stateId: 'MT', versionNo: 2, status: 'draft' as const, createdBy: ADMIN },
    ])
    .returning()
  publishedId = published?.id ?? 0
  draftId = draft?.id ?? 0
  const row = (versionId: number, codeNorm: string, stateCategory: string) => ({
    versionId,
    codeSystem: 'icd10cm' as const,
    rawCode: codeNorm,
    codeNorm,
    stateCategory,
    sourceDocumentId: doc?.id ?? 0,
  })
  await db
    .insert(entries)
    .values([
      row(publishedId, 'F200', 'SMI'),
      row(publishedId, 'F310', 'SMI'),
      row(publishedId, 'F1020', 'SUD'),
      row(draftId, 'F200', 'SMI'),
      row(draftId, 'Z7409', 'Tier 2 - Frailty Indicators'),
    ])
  await db.update(states).set({ publishedVersionId: publishedId }).where(eq(states.id, 'MT'))
}

describe('/api/admin/states/:stateId/categories', () => {
  beforeEach(async () => {
    await resetDb(env.DB)
    await seed()
  })

  it('lists the categories of the published version and open drafts, with suggestions', async () => {
    await db.insert(categoryMappings).values({
      stateId: 'MT',
      stateCategory: 'SUD',
      federalCategory: 'sud',
      method: 'auto',
      confidence: 0.9,
    })
    const { categories: list } = await categories()
    expect(list.map((c) => [c.stateCategory, c.publishedEntries, c.draftEntries])).toEqual([
      ['SMI', 2, 1],
      ['SUD', 1, 0],
      ['Tier 2 - Frailty Indicators', 0, 1],
    ])
    expect(list[0]).toMatchObject({
      mapping: null,
      suggestion: { federalCategory: 'disabling_mental_disorder', keyword: 'smi' },
    })
    expect(list[1]?.mapping).toMatchObject({ federalCategory: 'sud', method: 'auto' })
    expect(list[2]?.suggestion?.federalCategory).toBe('state_specific')
  })

  it('says how many published entries follow their unified categories, and under what', async () => {
    const category = (slug: string, federalCategory: 'sud' | 'serious_complex_medical') => ({
      slug,
      label: slug,
      definition: 'Test.',
      federalCategory,
      status: 'published' as const,
      createdBy: ADMIN,
      updatedBy: ADMIN,
    })
    const [a, b, retired] = await db
      .insert(unifiedCategories)
      .values([
        category('a', 'sud'),
        category('b', 'serious_complex_medical'),
        { ...category('c', 'sud'), status: 'retired' as const },
      ])
      .returning()
    const smi = await db.select().from(entries).where(eq(entries.stateCategory, 'SMI'))
    const [f200, f310] = smi.filter((e) => e.versionId === publishedId)
    const sud = await db.select().from(entries).where(eq(entries.stateCategory, 'SUD'))
    if (!a || !b || !retired || !f200 || !f310 || !sud[0]) throw new Error('seed failed')
    const placed = (entryId: number, unifiedId: number) => ({
      entryId,
      unifiedId,
      basis: 'by_code' as const,
      reviewed: 0,
    })
    await db
      .insert(entryUnified)
      .values([placed(f200.id, a.id), placed(f310.id, a.id), placed(f310.id, b.id)])
    // A retired category never counts (placements are removed on retire; this one was left).
    await db.insert(entryUnified).values(placed(sud[0].id, retired.id))

    const { categories: list } = await categories()
    expect(list.map((c) => [c.stateCategory, c.placedEntries, c.placedFederal])).toEqual([
      ['SMI', 2, ['sud', 'serious_complex_medical']],
      ['SUD', 0, []],
      ['Tier 2 - Frailty Indicators', 0, []],
    ])
  })

  it('counts ICD-10-CM entries per chapter, for chapter overrides', async () => {
    const { chapters } = await categories()
    expect(chapters).toHaveLength(22)
    expect(chapters.find((c) => c.chapter === 5)).toMatchObject({
      title: expect.stringMatching(/Mental/) as unknown,
      publishedEntries: 3,
      draftEntries: 1,
      override: null,
    })
    expect(chapters.find((c) => c.chapter === 21)?.draftEntries).toBe(1)
  })

  it('confirms mappings, moves the public update date and the data version, and audits', async () => {
    await db.insert(categoryMappings).values([
      {
        stateId: 'MT',
        stateCategory: 'SMI',
        federalCategory: 'disabling_mental_disorder',
        method: 'auto',
        confidence: 0.9,
      },
      { stateId: 'MT', stateCategory: 'SUD', federalCategory: 'sud', method: 'auto' },
    ])
    const res = await send('PUT', '/api/admin/states/MT/categories', {
      items: [
        {
          stateCategory: 'SMI',
          stateSubcategory: '',
          federalCategory: 'disabling_mental_disorder',
        },
        { stateCategory: 'SUD', stateSubcategory: '', federalCategory: 'sud' },
      ],
    })
    expect(res.status).toBe(200)
    const { categories: list } = await categories()
    expect(list[0]?.mapping).toMatchObject({
      federalCategory: 'disabling_mental_disorder',
      method: 'manual',
      confidence: null,
      mappedBy: ADMIN,
    })
    const [version] = await db
      .select()
      .from(datasetVersions)
      .where(eq(datasetVersions.id, publishedId))
    expect(version?.contentUpdatedAt).not.toBe('2026-11-01T00:00:00.000Z')
    const [meta] = await db.select().from(appMeta).where(eq(appMeta.key, 'data_version'))
    expect(meta?.value).toBe('1')
    const audit = auditListResponseSchema.parse(
      await (await send('GET', '/api/admin/audit')).json(),
    )
    expect(audit.items[0]).toMatchObject({ action: 'category.map', target: 'state:MT' })
  })

  it('refuses "unmapped" and other states’ rows stay untouched', async () => {
    await db.insert(categoryMappings).values([
      { stateId: 'NE', stateCategory: 'SMI', federalCategory: 'sud', method: 'manual' },
      { stateId: 'MT', stateCategory: 'SMI', federalCategory: 'state_specific', method: 'auto' },
    ])
    const bad = await send('PUT', '/api/admin/states/MT/categories', {
      items: [{ stateCategory: 'SMI', stateSubcategory: '', federalCategory: 'unmapped' }],
    })
    expect(bad.status).toBe(400)
    await send('PUT', '/api/admin/states/MT/categories', {
      items: [{ stateCategory: 'SMI', stateSubcategory: '', federalCategory: 'state_specific' }],
    })
    const ne = await db.select().from(categoryMappings).where(eq(categoryMappings.stateId, 'NE'))
    expect(ne.map((m) => m.federalCategory)).toEqual(['sud'])
  })

  it('refuses a confirm that would change a federal category: that needs the preview', async () => {
    await db
      .insert(categoryMappings)
      .values({ stateId: 'MT', stateCategory: 'SMI', federalCategory: 'sud', method: 'auto' })
    for (const items of [
      // A different federal category from the stored one.
      [{ stateCategory: 'SMI', stateSubcategory: '', federalCategory: 'state_specific' }],
      // No stored mapping: its entries are unmapped now and would move.
      [{ stateCategory: 'SUD', stateSubcategory: '', federalCategory: 'sud' }],
    ]) {
      expect((await send('PUT', '/api/admin/states/MT/categories', { items })).status).toBe(409)
    }
    const [smi] = await db.select().from(categoryMappings)
    expect(smi).toMatchObject({ federalCategory: 'sud', method: 'auto' })
    // The chapter override route is gone: overrides change only through /remap.
    expect(
      (await send('PUT', '/api/admin/states/MT/chapters/5', { federalCategory: 'sud' })).status,
    ).toBe(404)
  })

  it('answers 404 for an unknown state', async () => {
    expect((await send('GET', '/api/admin/states/ZZ/categories')).status).toBe(404)
    expect(
      (
        await send('PUT', '/api/admin/states/ZZ/categories', {
          items: [{ stateCategory: 'A', stateSubcategory: '', federalCategory: 'sud' }],
        })
      ).status,
    ).toBe(404)
  })
})

describe('/api/admin/states/:stateId/categories/preview and /remap', () => {
  beforeEach(async () => {
    await resetDb(env.DB)
    await seed()
    await db.insert(categoryMappings).values([
      {
        stateId: 'MT',
        stateCategory: 'SMI',
        federalCategory: 'disabling_mental_disorder',
        method: 'auto',
        confidence: 0.9,
      },
      { stateId: 'MT', stateCategory: 'SUD', federalCategory: 'sud', method: 'manual' },
    ])
  })

  const changes = {
    categories: [{ stateCategory: 'SMI', stateSubcategory: '', federalCategory: 'sud' }],
    chapters: [],
  }

  async function preview(body: unknown = changes) {
    const res = await send('POST', '/api/admin/states/MT/categories/preview', body)
    expect(res.status).toBe(200)
    return remapPreviewResponseSchema.parse(await res.json())
  }

  it('says which published entries move, which stay because a placement wins, and the drafts', async () => {
    const [unified] = await db
      .insert(unifiedCategories)
      .values({
        slug: 'smi',
        label: 'SMI',
        definition: 'Test.',
        federalCategory: 'serious_complex_medical',
        status: 'published',
        createdBy: ADMIN,
        updatedBy: ADMIN,
      })
      .returning()
    const [f310] = await db.select().from(entries).where(eq(entries.codeNorm, 'F310'))
    if (!unified || !f310) throw new Error('seed failed')
    await db
      .insert(entryUnified)
      .values({ entryId: f310.id, unifiedId: unified.id, basis: 'by_code', reviewed: 0 })

    const result = await preview()
    expect(result.token).toMatch(/^[0-9a-f]{64}$/)
    expect(result.changes[0]).toMatchObject({
      kind: 'category',
      entries: 2,
      moves: [{ from: 'disabling_mental_disorder', to: 'sud', n: 1 }],
      placed: { n: 1, federal: ['serious_complex_medical'] },
      sample: [{ code: 'F200', from: ['disabling_mental_disorder'], to: ['sud'] }],
      draftEntries: 1,
    })
    expect(result.totals).toEqual([
      { federalCategory: 'sud', before: 1, after: 2 },
      { federalCategory: 'disabling_mental_disorder', before: 1, after: 0 },
      { federalCategory: 'serious_complex_medical', before: 1, after: 1 },
    ])
    // A preview writes nothing.
    const [meta] = await db.select().from(appMeta).where(eq(appMeta.key, 'data_version'))
    expect(meta).toBeUndefined()
  })

  it('says which entries stay because a chapter override wins', async () => {
    await db
      .insert(chapterMappings)
      .values({ stateId: 'MT', chapter: 5, federalCategory: 'blind_or_disabled', mappedBy: ADMIN })
    const result = await preview()
    expect(result.changes[0]).toMatchObject({
      movingTotal: 0,
      chapterOverride: [{ chapter: 5, federalCategory: 'blind_or_disabled', n: 2 }],
    })
  })

  it('saves categories and chapters in one batch, with the data version, date and audit', async () => {
    const body = {
      categories: [
        { stateCategory: 'SMI', stateSubcategory: '', federalCategory: 'sud' },
        { stateCategory: 'SUD', stateSubcategory: '', federalCategory: 'serious_complex_medical' },
      ],
      chapters: [{ chapter: 21, federalCategory: 'state_specific' }],
    }
    const { token } = await preview(body)
    const res = await send('POST', '/api/admin/states/MT/categories/remap', { ...body, token })
    expect(res.status).toBe(200)
    const mappings = await db
      .select()
      .from(categoryMappings)
      .where(eq(categoryMappings.stateId, 'MT'))
    expect(mappings.map((m) => [m.stateCategory, m.federalCategory, m.method, m.mappedBy])).toEqual(
      [
        ['SMI', 'sud', 'manual', ADMIN],
        ['SUD', 'serious_complex_medical', 'manual', ADMIN],
      ],
    )
    expect((await db.select().from(chapterMappings)).map((c) => c.chapter)).toEqual([21])
    const [meta] = await db.select().from(appMeta).where(eq(appMeta.key, 'data_version'))
    expect(meta?.value).toBe('1')
    const [version] = await db
      .select()
      .from(datasetVersions)
      .where(eq(datasetVersions.id, publishedId))
    expect(version?.contentUpdatedAt).not.toBe('2026-11-01T00:00:00.000Z')
    const audit = auditListResponseSchema.parse(
      await (await send('GET', '/api/admin/audit')).json(),
    )
    expect(audit.items[0]).toMatchObject({
      action: 'category.remap',
      target: 'state:MT',
      details: {
        categories: [
          { stateCategory: 'SMI', from: 'disabling_mental_disorder', to: 'sud', moved: 2 },
          { stateCategory: 'SUD', from: 'sud', to: 'serious_complex_medical', moved: 1 },
        ],
        chapters: [{ chapter: 21, from: null, to: 'state_specific', moved: 0 }],
      },
    })
  })

  it('Confirm changes no entry’s federal category', async () => {
    // Every category and chapter, so the preview covers every published entry.
    const everything = {
      categories: [
        {
          stateCategory: 'SMI',
          stateSubcategory: '',
          federalCategory: 'disabling_mental_disorder',
        },
        { stateCategory: 'SUD', stateSubcategory: '', federalCategory: 'sud' },
      ],
      chapters: [],
    }
    const before = await preview(everything)
    const res = await send('PUT', '/api/admin/states/MT/categories', {
      items: everything.categories,
    })
    expect(res.status).toBe(200)
    const after = await preview(everything)
    expect(after.totals).toEqual(before.totals)
    expect(after.changes.map((c) => c.movingTotal)).toEqual([0, 0])
    const smi = await db.select().from(categoryMappings).where(eq(categoryMappings.stateId, 'MT'))
    expect(smi.map((m) => m.method)).toEqual(['manual', 'manual'])
  })

  it('refuses a stale preview with 409 and writes nothing', async () => {
    const { token } = await preview()
    // Another admin changes the SMI mapping after the preview.
    await db
      .update(categoryMappings)
      .set({ federalCategory: 'state_specific' })
      .where(eq(categoryMappings.stateCategory, 'SMI'))
    const res = await send('POST', '/api/admin/states/MT/categories/remap', { ...changes, token })
    expect(res.status).toBe(409)
    const [smi] = await db
      .select()
      .from(categoryMappings)
      .where(eq(categoryMappings.stateCategory, 'SMI'))
    expect(smi?.federalCategory).toBe('state_specific')
    const bad = await send('POST', '/api/admin/states/MT/categories/remap', {
      ...changes,
      token: 'x'.repeat(64),
    })
    expect(bad.status).toBe(409)
  })

  it('refuses invalid changes, unknown states and non-admins', async () => {
    expect(
      (
        await send('POST', '/api/admin/states/MT/categories/preview', {
          categories: [],
          chapters: [],
        })
      ).status,
    ).toBe(400)
    expect((await send('POST', '/api/admin/states/ZZ/categories/preview', changes)).status).toBe(
      404,
    )
    for (const path of ['preview', 'remap']) {
      const res = await call(`/api/admin/states/MT/categories/${path}`, {
        token: await accessToken({ email: 'guest@example.org' }),
        method: 'POST',
        body: { ...changes, token: 'x' },
      })
      expect(res.status).toBe(403)
    }
    const crossSite = await call('/api/admin/states/MT/categories/preview', {
      token: await accessToken(),
      method: 'POST',
      body: changes,
      origin: 'https://evil.example',
    })
    expect(crossSite.status).toBe(403)
  })
})

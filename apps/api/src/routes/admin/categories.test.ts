import { auditListResponseSchema, stateCategoriesResponseSchema } from '@mfcd/shared'
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
    await db.insert(categoryMappings).values({
      stateId: 'NE',
      stateCategory: 'SMI',
      federalCategory: 'sud',
      method: 'manual',
    })
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

  it('sets and clears a chapter override', async () => {
    const path = '/api/admin/states/MT/chapters/5'
    expect((await send('PUT', path, { federalCategory: 'disabling_mental_disorder' })).status).toBe(
      200,
    )
    expect((await categories()).chapters.find((c) => c.chapter === 5)?.override).toMatchObject({
      federalCategory: 'disabling_mental_disorder',
      mappedBy: ADMIN,
    })
    expect((await send('PUT', path, { federalCategory: null })).status).toBe(200)
    expect(await db.select().from(chapterMappings)).toEqual([])
    expect(
      (await send('PUT', '/api/admin/states/MT/chapters/23', { federalCategory: 'sud' })).status,
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

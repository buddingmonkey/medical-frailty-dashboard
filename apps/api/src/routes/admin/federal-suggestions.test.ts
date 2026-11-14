import {
  auditListResponseSchema,
  stateCategoriesResponseSchema,
  suggestionRunPreviewSchema,
} from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import {
  loadSuggestionReference,
  planSuggestions,
  writeSuggestionPlan,
} from '../../db/federal-suggestions'
import { publicSummaries } from '../../db/public-summary'
import {
  categoryMappings,
  datasetVersions,
  entries,
  entryFederalSuggestions,
  sourceDocuments,
  states,
} from '../../db/schema'
import { ADMIN, accessToken, call } from '../../test/access-fixtures'
import { resetDb } from '../../test/reset-db'

// Suggestions by code (docs/data-model.md, "Federal categories", rules 4 and 6): Indiana's
// published list names a federal category per code; Montana's does not.

const db = createDb(env.DB)

async function send(method: string, path: string, body?: unknown) {
  return call(path, { token: await accessToken(), method, ...(body === undefined ? {} : { body }) })
}

const base = '/api/admin/states/MT/categories'
let mtVersion = 0
let mtDoc = 0

async function seed() {
  await db.insert(states).values([
    { id: 'IN', slug: 'in', name: 'Indiana', fips: '18' },
    { id: 'MT', slug: 'mt', name: 'Montana', fips: '30' },
  ])
  const docs = await db
    .insert(sourceDocuments)
    .values(
      ['IN', 'MT'].map((stateId) => ({
        stateId,
        title: `${stateId} list`,
        fileType: 'pdf' as const,
        sha256: (stateId === 'IN' ? 'a' : 'b').repeat(64),
        r2Key: `sources/${stateId}`,
        byteSize: 1,
        uploadedBy: ADMIN,
      })),
    )
    .returning()
  const versions = await db
    .insert(datasetVersions)
    .values(
      ['IN', 'MT'].map((stateId) => ({
        stateId,
        versionNo: 1,
        status: 'published' as const,
        createdBy: ADMIN,
      })),
    )
    .returning()
  const [inVersion, mt] = versions
  mtVersion = mt?.id ?? 0
  mtDoc = docs[1]?.id ?? 0
  const row = (versionId: number, doc: number, codeNorm: string, stateCategory: string) => ({
    versionId,
    sourceDocumentId: doc,
    codeSystem: 'icd10cm' as const,
    rawCode: codeNorm,
    codeNorm,
    stateCategory,
  })
  await db.insert(entries).values([
    {
      ...row(inVersion?.id ?? 0, docs[0]?.id ?? 0, 'E1065', 'Tier 1'),
      stateFederalCategories: 'serious_complex_medical',
    },
    {
      ...row(inVersion?.id ?? 0, docs[0]?.id ?? 0, 'G800', 'Tier 1'),
      stateFederalCategories: 'physical_idd_adl',
    },
    row(mtVersion, mtDoc, 'E1065', 'Chronic'),
    row(mtVersion, mtDoc, 'G809', 'Chronic'),
    row(mtVersion, mtDoc, 'Z9999', 'Chronic'),
  ])
  await db
    .update(states)
    .set({ publishedVersionId: inVersion?.id ?? 0 })
    .where(eq(states.id, 'IN'))
  await db.update(states).set({ publishedVersionId: mtVersion }).where(eq(states.id, 'MT'))
  await db.insert(categoryMappings).values({
    stateId: 'MT',
    stateCategory: 'Chronic',
    federalCategory: 'blind_or_disabled',
    method: 'auto',
    confidence: 0.5,
  })
}

async function stored() {
  return db
    .select({
      code: entries.codeNorm,
      category: entryFederalSuggestions.federalCategory,
      level: entryFederalSuggestions.level,
      reviewed: entryFederalSuggestions.reviewed,
    })
    .from(entryFederalSuggestions)
    .innerJoin(entries, eq(entries.id, entryFederalSuggestions.entryId))
    .where(eq(entries.versionId, mtVersion))
    .orderBy(asc(entries.codeNorm))
}

async function preview() {
  const res = await send('POST', `${base}/suggestions/preview`, {})
  expect(res.status).toBe(200)
  return suggestionRunPreviewSchema.parse(await res.json())
}

async function run() {
  const { token } = await preview()
  const res = await send('POST', `${base}/suggestions/run`, { token })
  expect(res.status).toBe(200)
}

describe('suggestions by code', () => {
  beforeEach(async () => {
    await resetDb(env.DB)
    await seed()
  })

  it('previews the re-run, then saves it with the token, and audits it', async () => {
    const p = await preview()
    expect(p).toMatchObject({
      reference: ['Indiana'],
      entries: 3,
      gain: 2,
      change: 0,
      lose: 0,
      byCategory: [
        { federalCategory: 'physical_idd_adl', gain: 1, lose: 0 },
        { federalCategory: 'serious_complex_medical', gain: 1, lose: 0 },
      ],
    })
    expect(p.sample.map((s) => s.code).sort()).toEqual(['E1065', 'G809'])
    expect(await stored()).toEqual([])

    const stale = await send('POST', `${base}/suggestions/run`, { token: 'x' })
    expect(stale.status).toBe(409)

    const res = await send('POST', `${base}/suggestions/run`, { token: p.token })
    expect(res.status).toBe(200)
    expect(await stored()).toEqual([
      { code: 'E1065', category: 'serious_complex_medical', level: 'exact', reviewed: 0 },
      { code: 'G809', category: 'physical_idd_adl', level: 'category3', reviewed: 0 },
    ])
    // The automatic mapping is left alone.
    const [mapping] = await db.select().from(categoryMappings)
    expect(mapping?.method).toBe('auto')
    const audit = auditListResponseSchema.parse(
      await (await send('GET', '/api/admin/audit')).json(),
    )
    expect(audit.items[0]).toMatchObject({ action: 'category.suggest', target: 'state:MT' })
    // A second run changes nothing.
    expect(await preview()).toMatchObject({ gain: 0, change: 0, lose: 0, unchanged: 2 })
  })

  it('shows suggested entries publicly above the automatic mapping, named by the reference', async () => {
    await run()
    const { categories } = await publicSummaries(db, 'MT')
    const mt = categories.get('MT') ?? []
    expect(mt.map((c) => [c.federalCategory, c.entries, c.confirmed, c.suggestedFrom])).toEqual([
      // Z9999 has no suggestion: the automatic mapping, a plain guess.
      ['blind_or_disabled', 1, false, undefined],
      ['physical_idd_adl', 1, false, ['Indiana']],
      ['serious_complex_medical', 1, false, ['Indiana']],
    ])
  })

  it('confirms the suggestions of a category, which then count as reviewed', async () => {
    await run()
    const before = stateCategoriesResponseSchema.parse(await (await send('GET', base)).json())
    expect(before.categories[0]?.codeSuggested).toEqual({
      entries: 2,
      pending: 2,
      federal: ['physical_idd_adl', 'serious_complex_medical'],
      referenceNames: ['Indiana'],
    })
    const res = await send('POST', `${base}/suggestions/confirm`, {
      items: [{ stateCategory: 'Chronic', stateSubcategory: '' }],
    })
    expect(res.status).toBe(200)
    expect((await stored()).map((s) => s.reviewed)).toEqual([1, 1])
    const after = stateCategoriesResponseSchema.parse(await (await send('GET', base)).json())
    expect(after.categories[0]?.codeSuggested.pending).toBe(0)
    const mt = (await publicSummaries(db, 'MT')).categories.get('MT') ?? []
    expect(
      mt.filter((c) => c.federalCategory !== 'blind_or_disabled').map((c) => c.confirmed),
    ).toEqual([true, true])
    // A re-run keeps reviewed suggestions.
    expect(await preview()).toMatchObject({ keptReviewed: 2, gain: 0, lose: 0 })
  })

  it('confirming a mapping also confirms the suggestions it would otherwise hide', async () => {
    await run()
    const res = await send('PUT', base, {
      items: [
        { stateCategory: 'Chronic', stateSubcategory: '', federalCategory: 'blind_or_disabled' },
      ],
    })
    expect(res.status).toBe(200)
    expect((await stored()).map((s) => s.reviewed)).toEqual([1, 1])
    // Nothing moved: the suggested entries keep their federal categories.
    const mt = (await publicSummaries(db, 'MT')).categories.get('MT') ?? []
    expect(mt.map((c) => [c.federalCategory, c.confirmed])).toEqual([
      ['blind_or_disabled', true],
      ['physical_idd_adl', true],
      ['serious_complex_medical', true],
    ])
  })

  it('carries reviewed suggestions over to a new version on publish', async () => {
    await run()
    await db.update(entryFederalSuggestions).set({ reviewed: 1, reviewedBy: ADMIN })
    await db
      .update(datasetVersions)
      .set({ status: 'superseded' })
      .where(eq(datasetVersions.id, mtVersion))
    const [next] = await db
      .insert(datasetVersions)
      .values({ stateId: 'MT', versionNo: 2, status: 'published' as const, createdBy: ADMIN })
      .returning()
    await db.insert(entries).values([
      {
        versionId: next?.id ?? 0,
        sourceDocumentId: mtDoc,
        codeSystem: 'icd10cm' as const,
        rawCode: 'G809',
        codeNorm: 'G809',
        stateCategory: 'Chronic',
      },
    ])
    await db
      .update(states)
      .set({ publishedVersionId: next?.id ?? 0 })
      .where(eq(states.id, 'MT'))
    const { reference } = await loadSuggestionReference(db)
    await writeSuggestionPlan(
      db,
      await planSuggestions(db, 'MT', reference, { carryFrom: mtVersion }),
    )
    const rows = await db
      .select()
      .from(entryFederalSuggestions)
      .innerJoin(entries, eq(entries.id, entryFederalSuggestions.entryId))
      .where(eq(entries.versionId, next?.id ?? 0))
    expect(
      rows.map((r) => [
        r.entry_federal_suggestions.federalCategory,
        r.entry_federal_suggestions.reviewed,
        r.entry_federal_suggestions.reviewedBy,
      ]),
    ).toEqual([['physical_idd_adl', 1, ADMIN]])
  })

  it('never suggests for entries the state gave federal categories', async () => {
    const { reference } = await loadSuggestionReference(db)
    const plan = await planSuggestions(db, 'IN', reference)
    expect(plan.upserts).toEqual([])
    expect(plan.entries).toBe(0)
  })
})

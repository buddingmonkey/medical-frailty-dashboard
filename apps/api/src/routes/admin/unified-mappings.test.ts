import {
  auditListResponseSchema,
  stateUnifiedMappingsResponseSchema,
  unifiedMappingSaveResponseSchema,
} from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import {
  appMeta,
  datasetVersions,
  entries,
  refCcsr,
  sourceDocuments,
  states,
  unifiedCategories,
  unifiedCcsr,
  unifiedMappings,
} from '../../db/schema'
import { ADMIN, accessToken, call } from '../../test/access-fixtures'
import { resetDb } from '../../test/reset-db'

// Mappings from a state category to unified categories (roadmap M5 step 3). CCSR ids are made
// up (TST…). Rows are never deleted: a change supersedes the current rows.
const db = createDb(env.DB)
const SECOND = 'second.admin@example.org'
const PATH = '/api/admin/states/LA/unified-mappings'

async function send(method: string, path: string, body?: unknown, email = ADMIN) {
  return call(path, {
    token: await accessToken({ email }),
    method,
    ...(body === undefined ? {} : { body }),
  })
}

async function mappingsOf(stateId = 'LA') {
  const res = await send('GET', `/api/admin/states/${stateId}/unified-mappings`)
  expect(res.status).toBe(200)
  return stateUnifiedMappingsResponseSchema.parse(await res.json()).categories
}

async function allRows() {
  return db.select().from(unifiedMappings).orderBy(asc(unifiedMappings.id))
}

async function dataVersion() {
  const [row] = await db.select().from(appMeta).where(eq(appMeta.key, 'data_version'))
  return row?.value ?? null
}

let smi = 0
let mood = 0
let kidney = 0

/**
 * LA: a published version ("Behavioral Health": F20.0, the header F31, Z99.11 and a HCPCS
 * code; "Pharmacy": a drug class) and a draft with a category of its own. Unified categories:
 * SMI (published, TST001), Mood (draft, TST002 + TST003), Kidney (published, TST009).
 */
async function seed() {
  await db.insert(states).values([
    { id: 'LA', slug: 'la', name: 'Louisiana', fips: '22' },
    { id: 'MT', slug: 'mt', name: 'Montana', fips: '30' },
  ])
  const [doc] = await db
    .insert(sourceDocuments)
    .values({
      stateId: 'LA',
      title: 'LA list',
      fileType: 'pdf',
      sha256: 'b'.repeat(64),
      r2Key: 'sources/la',
      byteSize: 1,
      uploadedBy: ADMIN,
    })
    .returning()
  const [published, draft] = await db
    .insert(datasetVersions)
    .values([
      { stateId: 'LA', versionNo: 1, status: 'published' as const, createdBy: ADMIN },
      { stateId: 'LA', versionNo: 2, status: 'draft' as const, createdBy: ADMIN },
    ])
    .returning()
  const row = (
    versionId: number,
    codeNorm: string,
    stateCategory: string,
    codeSystem: 'icd10cm' | 'hcpcs' | 'drug_class' = 'icd10cm',
  ) => ({
    versionId,
    codeSystem,
    rawCode: codeNorm,
    codeNorm,
    stateCategory,
    sourceDocumentId: doc?.id ?? 0,
  })
  const p = published?.id ?? 0
  await db
    .insert(entries)
    .values([
      row(p, 'F200', 'Behavioral Health'),
      row(p, 'F31', 'Behavioral Health'),
      row(p, 'Z9911', 'Behavioral Health'),
      row(p, 'E0601', 'Behavioral Health', 'hcpcs'),
      row(p, 'H2A', 'Pharmacy', 'drug_class'),
      row(draft?.id ?? 0, 'F200', 'Draft only'),
    ])
  await db.update(states).set({ publishedVersionId: p }).where(eq(states.id, 'LA'))
  await db.insert(refCcsr).values(
    [
      ['F20', 'TST001'],
      ['F310', 'TST002'],
      ['F311', 'TST003'],
    ].map(([codeNorm = '', ccsrCategory = '']) => ({
      codeNorm,
      ccsrCategory,
      isDefault: 1,
      release: 'test',
    })),
  )
  const made = await db
    .insert(unifiedCategories)
    .values(
      (
        [
          ['smi', 'Serious mental illness', 'published'],
          ['mood', 'Mood disorders', 'draft'],
          ['kidney', 'Kidney failure', 'published'],
        ] as const
      ).map(([slug, label, status]) => ({
        slug,
        label,
        status,
        definition: 'Test.',
        federalCategory: 'disabling_mental_disorder' as const,
        createdBy: ADMIN,
        updatedBy: ADMIN,
      })),
    )
    .returning()
  smi = made[0]?.id ?? 0
  mood = made[1]?.id ?? 0
  kidney = made[2]?.id ?? 0
  await db.insert(unifiedCcsr).values([
    { unifiedId: smi, ccsrCategory: 'TST001' },
    { unifiedId: mood, ccsrCategory: 'TST002' },
    { unifiedId: mood, ccsrCategory: 'TST003' },
    { unifiedId: kidney, ccsrCategory: 'TST009' },
  ])
}

const key = { stateCategory: 'Behavioral Health', stateSubcategory: '' }
const target = (unifiedId: number, relation = 'broad') => ({
  unifiedId,
  relation,
  basis: 'admin_judgement',
  confidence: 'medium',
  rationale: 'Most codes are psychotic disorders.',
})

describe('/api/admin/states/:stateId/unified-mappings', () => {
  beforeEach(async () => {
    await resetDb(env.DB)
    await seed()
  })

  it('refuses a request without a signed Access token', async () => {
    expect((await call(PATH)).status).toBe(401)
    expect((await call(PATH, { method: 'PUT', body: { ...key, byCode: true } })).status).toBe(401)
  })

  it('lists the published categories with counts, CCSR spread and unified suggestions', async () => {
    const list = await mappingsOf()
    expect(list.map((c) => [c.stateCategory, c.entries, c.icdEntries])).toEqual([
      ['Behavioral Health', 4, 3],
      ['Pharmacy', 1, 0],
    ])
    // F20.0 → TST001; the header F31 → the groups of the codes under it; Z99.11 → none.
    expect(list[0]?.suggestion).toEqual({
      ccsr: [
        { ccsrCategory: 'TST001', count: 1, description: null },
        { ccsrCategory: 'TST002', count: 1, description: null },
        { ccsrCategory: 'TST003', count: 1, description: null },
      ],
      unified: [
        {
          unifiedId: smi,
          label: 'Serious mental illness',
          status: 'published',
          covered: 1,
          share: 1 / 3,
        },
        { unifiedId: mood, label: 'Mood disorders', status: 'draft', covered: 1, share: 1 / 3 },
      ],
      withoutCcsr: 1,
    })
    expect(list[0]?.mappings).toEqual([])
    expect(list[1]?.suggestion).toEqual({ ccsr: [], unified: [], withoutCcsr: 0 })
  })

  it('saves a proposal: proposed rows, an audit row, no data_version bump', async () => {
    const res = await send('PUT', PATH, {
      ...key,
      approve: false,
      targets: [target(smi), target(mood, 'related')],
    })
    expect(res.status).toBe(200)
    expect(unifiedMappingSaveResponseSchema.parse(await res.json())).toEqual({
      ok: true,
      status: 'proposed',
      review: 'Proposed',
    })
    const rows = await allRows()
    expect(rows.map((r) => [r.unifiedId, r.relation, r.status, r.mappedBy, r.reviewedBy])).toEqual([
      [smi, 'broad', 'proposed', ADMIN, null],
      [mood, 'related', 'proposed', ADMIN, null],
    ])
    expect(await dataVersion()).toBeNull()
    const audit = auditListResponseSchema.parse(
      await (await send('GET', '/api/admin/audit')).json(),
    )
    expect(audit.items[0]).toMatchObject({ action: 'unified-mapping.save', target: 'state:LA' })
    expect((await mappingsOf())[0]?.mappings).toHaveLength(2)
  })

  it('supersedes the current proposal with a new one; rows are never deleted', async () => {
    await send('PUT', PATH, { ...key, approve: false, targets: [target(smi), target(mood)] })
    await send('PUT', PATH, { ...key, approve: false, targets: [target(kidney, 'related')] })
    const rows = await allRows()
    expect(rows).toHaveLength(3)
    const newId = rows[2]?.id
    expect(rows.map((r) => [r.unifiedId, r.status, r.supersededBy])).toEqual([
      [smi, 'superseded', newId],
      [mood, 'superseded', newId],
      [kidney, 'proposed', null],
    ])
  })

  it('approving supersedes the approved and proposed rows, sets reviewed_by/at, bumps data_version', async () => {
    // Each approval bumps twice: its own batch, then once more when placements change
    // (src/db/placement.ts). A proposal changes nothing public.
    await send('PUT', PATH, { ...key, approve: true, targets: [target(smi)] })
    expect(await dataVersion()).toBe('2')
    await send('PUT', PATH, { ...key, approve: false, targets: [target(mood)] })
    expect(await dataVersion()).toBe('2')
    const res = await send('PUT', PATH, { ...key, approve: true, byCode: true }, SECOND)
    expect(unifiedMappingSaveResponseSchema.parse(await res.json())).toEqual({
      ok: true,
      status: 'approved',
      review: 'Reviewed by one admin',
    })
    expect(await dataVersion()).toBe('4')
    const rows = await allRows()
    const last = rows[2]
    expect(rows.map((r) => [r.unifiedId, r.relation, r.status, r.supersededBy])).toEqual([
      [smi, 'broad', 'superseded', last?.id],
      [mood, 'broad', 'superseded', last?.id],
      [null, 'by_code', 'approved', null],
    ])
    expect(last).toMatchObject({
      basis: 'admin_judgement',
      confidence: 'high',
      mappedBy: SECOND,
      reviewedBy: SECOND,
    })
    expect(last?.reviewedAt).toMatch(/^\d{4}-\d\d-\d\dT/)
    expect(rows[0]?.reviewedBy).toBe(ADMIN)
  })

  it('a proposal leaves the approved mapping in place', async () => {
    await send('PUT', PATH, { ...key, approve: true, targets: [target(smi)] })
    await send('PUT', PATH, { ...key, approve: false, targets: [target(mood)] })
    const current = (await mappingsOf())[0]?.mappings ?? []
    expect(current.map((m) => [m.unifiedId, m.status])).toEqual([
      [smi, 'approved'],
      [mood, 'proposed'],
    ])
  })

  it('approves an existing proposal as is', async () => {
    await send('PUT', PATH, { ...key, approve: true, targets: [target(kidney)] })
    await send('PUT', PATH, { ...key, approve: false, targets: [target(smi), target(mood)] })
    const before = await allRows()
    const res = await send('POST', `${PATH}/approve`, key, SECOND)
    expect(res.status).toBe(200)
    expect(unifiedMappingSaveResponseSchema.parse(await res.json()).review).toBe(
      'Reviewed by one admin',
    )
    const rows = await allRows()
    expect(rows).toHaveLength(before.length)
    const firstProposed = before[1]?.id
    expect(
      rows.map((r) => [r.unifiedId, r.status, r.supersededBy, r.mappedBy, r.reviewedBy]),
    ).toEqual([
      [kidney, 'superseded', firstProposed, ADMIN, ADMIN],
      [smi, 'approved', null, ADMIN, SECOND],
      [mood, 'approved', null, ADMIN, SECOND],
    ])
    // Two approvals, each bumping for itself and for the placements it moved.
    expect(await dataVersion()).toBe('4')
    const audit = auditListResponseSchema.parse(
      await (await send('GET', '/api/admin/audit')).json(),
    )
    expect(audit.items[0]).toMatchObject({ action: 'unified-mapping.approve', actorEmail: SECOND })
    // Nothing left to approve.
    const again = await send('POST', `${PATH}/approve`, key)
    expect(again.status).toBe(409)
    expect(await dataVersion()).toBe('4')
  })

  it('refuses bad bodies, unknown targets and categories not in the published list', async () => {
    for (const bad of [
      { ...key, approve: false },
      { ...key, approve: false, targets: [] },
      { ...key, approve: false, targets: [target(smi), target(smi, 'close')] },
      { ...key, approve: false, byCode: true, targets: [target(smi)] },
      { ...key, approve: false, targets: [{ ...target(smi), relation: 'by_code' }] },
      { ...key, approve: 'yes', byCode: true },
      'nope',
    ]) {
      expect((await send('PUT', PATH, bad)).status).toBe(400)
    }
    const unknownTarget = await send('PUT', PATH, {
      ...key,
      approve: false,
      targets: [target(9999)],
    })
    expect(unknownTarget.status).toBe(400)
    expect(await unknownTarget.json()).toEqual({ error: 'Unknown unified category: 9999' })
    const draftOnly = await send('PUT', PATH, {
      stateCategory: 'Draft only',
      stateSubcategory: '',
      approve: false,
      byCode: true,
    })
    expect(draftOnly.status).toBe(400)
    expect((await send('POST', `${PATH}/approve`, { stateCategory: 1 })).status).toBe(400)
    expect(await allRows()).toEqual([])
  })

  it('answers 404 for an unknown state and leaves other states’ rows alone', async () => {
    expect((await send('GET', '/api/admin/states/ZZ/unified-mappings')).status).toBe(404)
    await db.insert(unifiedMappings).values({
      stateId: 'MT',
      ...key,
      unifiedId: smi,
      relation: 'exact',
      basis: 'state_text',
      confidence: 'high',
      mappedBy: ADMIN,
      status: 'proposed',
    })
    await send('PUT', PATH, { ...key, approve: true, byCode: true })
    const mt = await db.select().from(unifiedMappings).where(eq(unifiedMappings.stateId, 'MT'))
    expect(mt.map((r) => r.status)).toEqual(['proposed'])
  })
})

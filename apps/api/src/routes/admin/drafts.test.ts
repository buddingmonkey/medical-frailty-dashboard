import {
  auditListResponseSchema,
  type DraftEntry,
  draftChecksResponseSchema,
  draftDetailSchema,
  draftListResponseSchema,
  draftSummarySchema,
} from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import {
  datasetVersions,
  entries,
  refCodes,
  sourceDocuments,
  states,
  versionSources,
} from '../../db/schema'
import { ADMIN, accessToken, call } from '../../test/access-fixtures'
import { resetDb } from '../../test/reset-db'

const db = createDb(env.DB)

const entry = (code: string, patch: Partial<DraftEntry> = {}): DraftEntry => ({
  codeSystem: 'icd10cm',
  rawCode: code,
  codeNorm: code.replace('.', ''),
  matchKind: 'exact',
  rangeEndNorm: null,
  includesChildren: 0,
  descriptionPublished: `Description of ${code}`,
  stateCategory: 'SMI',
  stateSubcategory: '',
  tier: '',
  qualification: 'standalone',
  qualificationBasis: 'published',
  sourceLocator: `row ${code}`,
  attributes: { included: true, flags: [] },
  ...patch,
})

async function send(method: string, path: string, body?: unknown) {
  return call(path, { token: await accessToken(), method, ...(body === undefined ? {} : { body }) })
}

async function createDraft(stateId = 'MT') {
  const res = await send('POST', '/api/admin/drafts', { stateId })
  expect(res.status).toBe(201)
  const body: { item: unknown } = await res.json()
  return draftSummarySchema.parse(body.item)
}

const source = (expectedEntries: number, extra: object = {}) => ({
  expectedEntries,
  invalidRowCount: 0,
  namedStateIds: [],
  ...extra,
})

async function detail(id: number) {
  return draftDetailSchema.parse(
    await (await send('GET', `/api/admin/drafts/${String(id)}`)).json(),
  )
}

async function checks(id: number) {
  const res = await send('GET', `/api/admin/drafts/${String(id)}/checks`)
  expect(res.status).toBe(200)
  return draftChecksResponseSchema.parse(await res.json())
}

const triggered = (report: Awaited<ReturnType<typeof checks>>['report']) =>
  report.checks.filter((c) => c.triggered).map((c) => c.id)

/** Stores a published MT version with F20.0 and F31.0, as publish (step 8) will. */
async function publishedMt(sourceId: number) {
  const [version] = await db
    .insert(datasetVersions)
    .values({ stateId: 'MT', versionNo: 1, status: 'published', createdBy: ADMIN, rowCount: 2 })
    .returning()
  if (!version) throw new Error('no version')
  await db.insert(versionSources).values({ versionId: version.id, sourceDocumentId: sourceId })
  await db.insert(entries).values(
    ['F20.0', 'F31.0'].map((code) => ({
      versionId: version.id,
      codeSystem: 'icd10cm' as const,
      rawCode: code,
      codeNorm: code.replace('.', ''),
      stateCategory: 'SMI',
      descriptionPublished: `Description of ${code}`,
      sourceDocumentId: sourceId,
      attributesJson: JSON.stringify({ included: true, flags: [] }),
    })),
  )
  await db.update(states).set({ publishedVersionId: version.id }).where(eq(states.id, 'MT'))
  return version.id
}

let mtSource = 0
let neSource = 0

describe('/api/admin/drafts', () => {
  beforeEach(async () => {
    await resetDb(env.DB)
    await db.insert(states).values([
      { id: 'MT', slug: 'mt', name: 'Montana', fips: '30' },
      { id: 'NE', slug: 'ne', name: 'Nebraska', fips: '31' },
    ])
    const doc = (stateId: string, sha256: string) => ({
      stateId,
      title: `${stateId} list`,
      fileType: 'pdf',
      sha256,
      r2Key: `sources/${sha256}`,
      byteSize: 10,
      uploadedBy: ADMIN,
    })
    const docs = await db
      .insert(sourceDocuments)
      .values([doc('MT', 'a'.repeat(64)), doc('NE', 'b'.repeat(64))])
      .returning()
    mtSource = docs[0]?.id ?? 0
    neSource = docs[1]?.id ?? 0
    await db.insert(refCodes).values(
      ['F20', 'F200', 'F310', 'F329'].map((codeNorm) => ({
        codeSystem: 'icd10cm' as const,
        codeNorm,
        description: 'x',
        validFrom: '2026-10-01',
        billable: 1,
      })),
    )
  })

  it('creates numbered drafts per state, lists them and audits the creation', async () => {
    const first = await createDraft()
    const second = await createDraft()
    expect([first.versionNo, second.versionNo]).toEqual([1, 2])
    expect(first).toMatchObject({ stateId: 'MT', status: 'draft', createdBy: ADMIN, rowCount: 0 })

    const res = await send('GET', '/api/admin/drafts?stateId=MT')
    const { items } = draftListResponseSchema.parse(await res.json())
    expect(items.map((d) => d.versionNo)).toEqual([2, 1])

    const audit = auditListResponseSchema.parse(
      await (await send('GET', '/api/admin/audit')).json(),
    )
    expect(audit.items[0]).toMatchObject({
      action: 'draft.create',
      target: `version:${String(second.id)}`,
    })
  })

  it('refuses an unknown state', async () => {
    expect((await send('POST', '/api/admin/drafts', { stateId: 'ZZ' })).status).toBe(400)
  })

  it('stores rows in chunks for a source and counts them', async () => {
    const draft = await createDraft()
    const path = `/api/admin/drafts/${String(draft.id)}`
    expect((await send('PUT', `${path}/sources/${String(mtSource)}`, source(3))).status).toBe(200)
    await send('POST', `${path}/rows`, { sourceDocumentId: mtSource, entries: [entry('F20.0')] })
    const res = await send('POST', `${path}/rows`, {
      sourceDocumentId: mtSource,
      entries: [entry('F31.0'), entry('F32.9', { attributes: { included: false, flags: [] } })],
    })
    expect(res.status).toBe(200)

    const d = await detail(draft.id)
    expect(d.rowCount).toBe(3)
    expect(d.sources).toEqual([
      expect.objectContaining({ sourceDocumentId: mtSource, expectedEntries: 3, storedEntries: 3 }),
    ])
    const stored = await db.select().from(entries).where(eq(entries.versionId, draft.id))
    expect(stored.map((e) => e.codeNorm)).toEqual(['F200', 'F310', 'F329'])
    expect(JSON.parse(stored[2]?.attributesJson ?? '')).toEqual({ included: false, flags: [] })
  })

  it('starts a source over when it is sent again', async () => {
    const draft = await createDraft()
    const path = `/api/admin/drafts/${String(draft.id)}`
    await send('PUT', `${path}/sources/${String(mtSource)}`, source(1))
    await send('POST', `${path}/rows`, { sourceDocumentId: mtSource, entries: [entry('F20.0')] })
    await send('PUT', `${path}/sources/${String(mtSource)}`, source(1))
    await send('POST', `${path}/rows`, { sourceDocumentId: mtSource, entries: [entry('F31.0')] })
    const stored = await db.select().from(entries).where(eq(entries.versionId, draft.id))
    expect(stored.map((e) => e.codeNorm)).toEqual(['F310'])
  })

  it('refuses rows whose code does not read the same on the server, and says which', async () => {
    const draft = await createDraft()
    const path = `/api/admin/drafts/${String(draft.id)}`
    await send('PUT', `${path}/sources/${String(mtSource)}`, source(2))
    const res = await send('POST', `${path}/rows`, {
      sourceDocumentId: mtSource,
      entries: [entry('F20.0'), entry('F31.0', { codeNorm: 'F999' })],
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ index: 1 })
    expect(await db.select().from(entries)).toEqual([])
  })

  it('refuses rows for a source not added to the draft, or more rows than announced', async () => {
    const draft = await createDraft()
    const path = `/api/admin/drafts/${String(draft.id)}`
    const rows = { sourceDocumentId: mtSource, entries: [entry('F20.0'), entry('F31.0')] }
    expect((await send('POST', `${path}/rows`, rows)).status).toBe(400)
    await send('PUT', `${path}/sources/${String(mtSource)}`, source(1))
    expect((await send('POST', `${path}/rows`, rows)).status).toBe(400)
  })

  it('refuses another state’s source document', async () => {
    const draft = await createDraft('MT')
    const res = await send(
      'PUT',
      `/api/admin/drafts/${String(draft.id)}/sources/${String(neSource)}`,
      source(1),
    )
    expect(res.status).toBe(400)
  })

  it('runs the checks on a first upload and stores the report with a token', async () => {
    const draft = await createDraft()
    const path = `/api/admin/drafts/${String(draft.id)}`
    await send('PUT', `${path}/sources/${String(mtSource)}`, source(2, { namedStateIds: ['MT'] }))
    await send('POST', `${path}/rows`, {
      sourceDocumentId: mtSource,
      entries: [
        entry('F20.0'),
        entry('F20', {
          codeNorm: 'F20',
          includesChildren: null,
          attributes: { included: true, flags: ['category_scope'] },
        }),
      ],
    })
    const result = await checks(draft.id)
    expect(result.hasPublished).toBe(false)
    expect(result.report.canPublish).toBe(true)
    expect(triggered(result.report)).toEqual(['unresolved_flags'])
    expect(result.report.diff.totals.added).toBe(2)
    expect(result.token).toMatch(/^[0-9a-f]{64}$/)

    const [version] = await db
      .select()
      .from(datasetVersions)
      .where(eq(datasetVersions.id, draft.id))
    expect(JSON.parse(version?.checkReportJson ?? '{}')).toMatchObject({ token: result.token })

    // Same rows, same token; different rows, different token.
    expect((await checks(draft.id)).token).toBe(result.token)
    await send('PUT', `${path}/sources/${String(mtSource)}`, source(1))
    await send('POST', `${path}/rows`, { sourceDocumentId: mtSource, entries: [entry('F20.0')] })
    expect((await checks(draft.id)).token).not.toBe(result.token)
  })

  it('blocks an incomplete upload, and compares with the published version', async () => {
    await publishedMt(mtSource)
    const draft = await createDraft()
    const path = `/api/admin/drafts/${String(draft.id)}`
    await send('PUT', `${path}/sources/${String(mtSource)}`, source(3, { namedStateIds: ['NE'] }))
    await send('POST', `${path}/rows`, {
      sourceDocumentId: mtSource,
      entries: [entry('F20.0'), entry('F32.9')],
    })

    const { report, hasPublished } = await checks(draft.id)
    expect(hasPublished).toBe(true)
    expect(report.canPublish).toBe(false)
    expect(triggered(report)).toEqual(
      expect.arrayContaining(['incomplete_upload', 'state_mismatch', 'same_source']),
    )
    expect(report.diff.totals).toMatchObject({ added: 1, removed: 1 })
  })

  it('counts ICD-10-CM codes CMS does not list', async () => {
    const draft = await createDraft()
    const path = `/api/admin/drafts/${String(draft.id)}`
    await send('PUT', `${path}/sources/${String(mtSource)}`, source(2))
    await send('POST', `${path}/rows`, {
      sourceDocumentId: mtSource,
      entries: [entry('F20.0'), entry('G41')],
    })
    const { report } = await checks(draft.id)
    expect(report.checks.find((c) => c.id === 'unknown_icd10cm')).toMatchObject({
      triggered: true,
      count: 1,
    })
  })

  it('discards a draft, which then takes no more rows', async () => {
    const draft = await createDraft()
    const path = `/api/admin/drafts/${String(draft.id)}`
    expect((await send('POST', `${path}/discard`, {})).status).toBe(200)
    expect((await detail(draft.id)).status).toBe('discarded')
    expect((await send('PUT', `${path}/sources/${String(mtSource)}`, source(1))).status).toBe(409)
    const res = await send('GET', '/api/admin/drafts?stateId=MT')
    expect(draftListResponseSchema.parse(await res.json()).items).toEqual([])
  })

  it('never writes to a published version', async () => {
    const published = await publishedMt(mtSource)
    const path = `/api/admin/drafts/${String(published)}`
    expect((await send('PUT', `${path}/sources/${String(mtSource)}`, source(1))).status).toBe(409)
    expect((await send('POST', `${path}/discard`, {})).status).toBe(409)
  })

  it('answers 404 for a draft that does not exist', async () => {
    expect((await send('GET', '/api/admin/drafts/999')).status).toBe(404)
    expect((await send('GET', '/api/admin/drafts/abc')).status).toBe(404)
  })
})

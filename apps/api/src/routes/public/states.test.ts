import { publicStateDetailResponseSchema, publicStatesResponseSchema } from '@mfcd/shared'
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
  sourceDocuments,
  states,
  versionSources,
} from '../../db/schema'
import { ADMIN, accessToken, call } from '../../test/access-fixtures'
import { resetDb } from '../../test/reset-db'

// GET /api/public/states (roadmap M3 step 1): the home map's data, cached on data_version.

const db = createDb(env.DB)

type NewEntry = typeof entries.$inferInsert

async function publishVersion(
  stateId: string,
  status: 'published' | 'draft',
  rows: Omit<NewEntry, 'versionId' | 'sourceDocumentId'>[],
  dates: { version?: string | null; source?: string | null } = {},
) {
  const [doc] = await db
    .insert(sourceDocuments)
    .values({
      stateId,
      title: `${stateId} list ${status}`,
      fileType: 'pdf',
      sha256: `${stateId}${status}`.padEnd(64, '0'),
      r2Key: `sources/${stateId}/${status}`,
      byteSize: 10,
      uploadedBy: ADMIN,
      publisherDate: dates.source ?? null,
    })
    .returning()
  const [version] = await db
    .insert(datasetVersions)
    .values({
      stateId,
      versionNo: status === 'published' ? 1 : 2,
      status,
      createdBy: ADMIN,
      statePublishedDate: dates.version ?? null,
      contentUpdatedAt: status === 'published' ? '2026-11-02T10:00:00.000Z' : null,
      rowCount: rows.length,
    })
    .returning()
  if (!doc || !version) throw new Error('insert failed')
  await db.insert(versionSources).values({ versionId: version.id, sourceDocumentId: doc.id })
  await db
    .insert(entries)
    .values(rows.map((r) => ({ ...r, versionId: version.id, sourceDocumentId: doc.id })))
  if (status === 'published') {
    await db
      .update(states)
      .set({ publishedVersionId: version.id, status: 'published' })
      .where(eq(states.id, stateId))
  }
}

const icd = (codeNorm: string, stateCategory: string, patch: Partial<NewEntry> = {}) => ({
  codeSystem: 'icd10cm' as const,
  rawCode: codeNorm,
  codeNorm,
  stateCategory,
  ...patch,
})

let calls = 0

/** Public mode by default. Each call gets its own host (cache key) unless one is given. */
async function getStates(options: { host?: string; vars?: Partial<Env>; token?: string } = {}) {
  calls += 1
  const res = await call('/api/public/states', {
    host: `call-${String(calls)}.example.com`,
    vars: { SITE_MODE: 'public' },
    ...options,
  })
  return { res, body: publicStatesResponseSchema.parse(await res.json()) }
}

beforeEach(async () => {
  await resetDb(env.DB)
  await db.insert(states).values([
    { id: 'NE', slug: 'ne', name: 'Nebraska', fips: '31' },
    { id: 'GA', slug: 'ga', name: 'Georgia', fips: '13' },
    { id: 'MT', slug: 'mt', name: 'Montana', fips: '30', status: 'announced' },
  ])
  await publishVersion(
    'GA',
    'published',
    [
      icd('F200', 'Mental health'),
      icd('F10', 'Mental health', { matchKind: 'prefix', qualification: 'needs_support' }),
      icd('C50', 'Cancer', { matchKind: 'prefix', qualification: 'standalone' }),
      { codeSystem: 'hcpcs', rawCode: 'E0250', codeNorm: 'E0250', stateCategory: 'Equipment' },
    ],
    { version: null, source: '2026-09-15' },
  )
  // A draft is never public.
  await publishVersion('GA', 'draft', [icd('Z99', 'Draft only')])
  await db.insert(categoryMappings).values([
    {
      stateId: 'GA',
      stateCategory: 'Mental health',
      federalCategory: 'disabling_mental_disorder',
      method: 'manual',
      mappedBy: ADMIN,
    },
    {
      stateId: 'GA',
      stateCategory: 'Cancer',
      federalCategory: 'serious_complex_medical',
      method: 'auto',
      confidence: 0.8,
    },
  ])
  // Chapter 5 (F01–F99) override: F10 counts as SUD even though its category says mental health.
  await db.insert(chapterMappings).values({
    stateId: 'GA',
    chapter: 5,
    federalCategory: 'sud',
    mappedBy: ADMIN,
  })
})

describe('GET /api/public/states', () => {
  it('lists every state by name, with null for states not published yet', async () => {
    const { res, body } = await getStates()

    expect(res.status).toBe(200)
    expect(body.items.map((s) => s.id)).toEqual(['GA', 'MT', 'NE'])
    const mt = body.items[1]
    expect(mt).toMatchObject({ slug: 'mt', name: 'Montana', status: 'announced', published: null })
  })

  it('counts the published entries by code system, federal category and qualification', async () => {
    const { body } = await getStates()
    const ga = body.items[0]?.published

    expect(ga).toMatchObject({
      versionNo: 1,
      sourceDate: '2026-09-15',
      updatedAt: '2026-11-02T10:00:00.000Z',
      totalEntries: 4,
      mappingsConfirmed: false,
    })
    expect(ga?.bySystem).toMatchObject({ icd10cm: 3, hcpcs: 1, cpt: 0 })
    // The chapter override wins for F codes; Cancer's auto guess counts; Equipment is unmapped.
    expect(ga?.byFederalCategory).toEqual({
      blind_or_disabled: 0,
      sud: 2,
      disabling_mental_disorder: 0,
      physical_idd_adl: 0,
      serious_complex_medical: 1,
      state_specific: 0,
      unmapped: 1,
    })
    expect(ga?.byQualification).toEqual({
      standalone: 1,
      needs_support: 1,
      supporting_only: 0,
      unknown: 2,
    })
  })

  it("prefers the version's own date and confirms mappings when every one is manual", async () => {
    await db.update(datasetVersions).set({ statePublishedDate: '2026-10-01' })
    await db.update(categoryMappings).set({ method: 'manual' })
    await db.insert(categoryMappings).values({
      stateId: 'GA',
      stateCategory: 'Equipment',
      federalCategory: 'physical_idd_adl',
      method: 'manual',
    })

    const ga = (await getStates()).body.items[0]?.published

    expect(ga?.sourceDate).toBe('2026-10-01')
    expect(ga?.mappingsConfirmed).toBe(true)
  })

  it('caches in public mode until data_version changes', async () => {
    const host = 'cache-test.example.com'
    const first = await getStates({ host })
    expect(first.res.headers.get('cache-control')).toBe('public, max-age=300')
    expect(first.body.dataVersion).toBe(0)

    await db.update(states).set({ name: 'Renamed' }).where(eq(states.id, 'NE'))
    const cached = await getStates({ host })
    expect(cached.body.items.map((s) => s.name)).toContain('Nebraska')

    await db.insert(appMeta).values({ key: 'data_version', value: '7' })
    const fresh = await getStates({ host })
    expect(fresh.body.dataVersion).toBe(7)
    expect(fresh.body.items.map((s) => s.name)).toContain('Renamed')
  })

  it('never stores a response in private mode', async () => {
    const host = 'private-test.example.com'
    const token = await accessToken()
    const first = await getStates({ host, token, vars: { SITE_MODE: 'private' } })
    expect(first.res.headers.get('cache-control')).toBe('private, no-store')

    await db.update(states).set({ name: 'Renamed' }).where(eq(states.id, 'NE'))
    const again = await getStates({ host, token, vars: { SITE_MODE: 'private' } })
    expect(again.body.items.map((s) => s.name)).toContain('Renamed')

    // Nor serves one stored while public.
    await getStates({ host: 'mixed.example.com' })
    await db.update(states).set({ name: 'Renamed twice' }).where(eq(states.id, 'NE'))
    const priv = await getStates({
      host: 'mixed.example.com',
      token,
      vars: { SITE_MODE: 'private' },
    })
    expect(priv.body.items.map((s) => s.name)).toContain('Renamed twice')
  })

  it('needs a sign-in in private mode', async () => {
    const res = await call('/api/public/states', { vars: { SITE_MODE: 'private' } })
    expect(res.status).toBe(401)
  })
})

describe('GET /api/public/states/:slug', () => {
  async function getState(slug: string) {
    calls += 1
    return call(`/api/public/states/${slug}`, {
      host: `detail-${String(calls)}.example.com`,
      vars: { SITE_MODE: 'public' },
    })
  }

  it("returns the state's summary, sources, published versions and categories", async () => {
    await db.insert(datasetVersions).values({
      stateId: 'GA',
      // A v3 that was rolled back to v1.
      versionNo: 3,
      status: 'superseded',
      createdBy: ADMIN,
      publishedAt: '2026-10-01T00:00:00.000Z',
      rowCount: 3,
    })
    await db
      .update(states)
      .set({ notesMd: 'Two attachments, **A** and **B**.' })
      .where(eq(states.id, 'GA'))
    await db
      .update(sourceDocuments)
      .set({ url: 'https://medicaid.georgia.gov/list.pdf' })
      .where(eq(sourceDocuments.title, 'GA list published'))

    const res = await getState('ga')

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
    const body = publicStateDetailResponseSchema.parse(await res.json())
    expect(body.state.published?.totalEntries).toBe(4)
    expect(body.notesMd).toBe('Two attachments, **A** and **B**.')
    expect(body.sources).toEqual([
      expect.objectContaining({
        title: 'GA list published',
        url: 'https://medicaid.georgia.gov/list.pdf',
        publisherDate: '2026-09-15',
        fileType: 'pdf',
      }),
    ])
    // The draft (v2) is not listed.
    expect(body.versions.map((v) => [v.versionNo, v.status])).toEqual([
      [3, 'superseded'],
      [1, 'published'],
    ])
    expect(body.categories).toEqual([
      {
        stateCategory: 'Cancer',
        stateSubcategory: '',
        federalCategory: 'serious_complex_medical',
        confirmed: false,
        entries: 1,
      },
      {
        stateCategory: 'Equipment',
        stateSubcategory: '',
        federalCategory: 'unmapped',
        confirmed: false,
        entries: 1,
      },
      {
        stateCategory: 'Mental health',
        stateSubcategory: '',
        federalCategory: 'sud',
        confirmed: true,
        entries: 2,
      },
    ])
  })

  it('answers for a state with no list yet, upper case included', async () => {
    const body = publicStateDetailResponseSchema.parse(await (await getState('MT')).json())

    expect(body.state).toMatchObject({ id: 'MT', status: 'announced', published: null })
    expect(body.sources).toEqual([])
    expect(body.versions).toEqual([])
    expect(body.categories).toEqual([])
  })

  it('never shows a source URL that is not http(s)', async () => {
    await db
      .update(sourceDocuments)
      .set({ url: 'javascript:alert(1)' })
      .where(eq(sourceDocuments.title, 'GA list published'))

    const body = publicStateDetailResponseSchema.parse(await (await getState('ga')).json())

    expect(body.sources[0]?.url).toBeNull()
  })

  it.each(['zz', 'georgia', 'g', '%27'])('answers 404 for %s, never cached', async (slug) => {
    const res = await getState(slug)
    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})

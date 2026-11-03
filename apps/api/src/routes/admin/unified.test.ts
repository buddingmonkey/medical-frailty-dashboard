import {
  auditListResponseSchema,
  ccsrCategoryListResponseSchema,
  unifiedListResponseSchema,
  unifiedSaveResponseSchema,
} from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import {
  appMeta,
  refCcsrCategories,
  states,
  unifiedCategories,
  unifiedCcsr,
  unifiedMappings,
} from '../../db/schema'
import { ADMIN, accessToken, call } from '../../test/access-fixtures'
import { resetDb } from '../../test/reset-db'

// Unified categories (roadmap M5 step 3). CCSR ids and names here are made up (TST…).
const db = createDb(env.DB)

async function send(method: string, path: string, body?: unknown) {
  return call(path, { token: await accessToken(), method, ...(body === undefined ? {} : { body }) })
}

async function list() {
  const res = await send('GET', '/api/admin/unified')
  expect(res.status).toBe(200)
  return unifiedListResponseSchema.parse(await res.json()).items
}

async function dataVersion() {
  const [row] = await db.select().from(appMeta).where(eq(appMeta.key, 'data_version'))
  return row?.value ?? null
}

async function audits() {
  const res = await send('GET', '/api/admin/audit')
  return auditListResponseSchema.parse(await res.json()).items
}

const body = {
  label: 'Serious mental illness',
  definition: 'Psychotic and major mood disorders.',
  federalCategory: 'disabling_mental_disorder',
  ccsr: ['TST001', 'TST002'],
}

async function create(fields: Record<string, unknown> = {}) {
  const res = await send('POST', '/api/admin/unified', { ...body, ...fields })
  expect(res.status).toBe(201)
  return unifiedSaveResponseSchema.parse(await res.json())
}

describe('/api/admin/unified', () => {
  beforeEach(async () => {
    await resetDb(env.DB)
    await db.insert(states).values({ id: 'LA', slug: 'la', name: 'Louisiana', fips: '22' })
    await db.insert(refCcsrCategories).values(
      ['TST001', 'TST002', 'TST003'].map((id, i) => ({
        ccsrCategory: id,
        description: `Test group ${String(i + 1)}`,
        bodySystem: 'Test system',
        release: 'test',
      })),
    )
  })

  it('refuses a request without a signed Access token', async () => {
    expect((await call('/api/admin/unified')).status).toBe(401)
    const outsider = await accessToken({ email: 'someone@example.org' })
    expect((await call('/api/admin/unified', { token: outsider })).status).toBe(403)
  })

  it('creates a draft with a slug from the label, its CCSR groups, and an audit row', async () => {
    const saved = await create()
    expect(saved).toEqual({ id: saved.id, slug: 'serious-mental-illness', version: 1 })
    const [item] = await list()
    expect(item).toMatchObject({
      slug: 'serious-mental-illness',
      status: 'draft',
      version: 1,
      includes: null,
      createdBy: ADMIN,
      ccsr: ['TST001', 'TST002'],
      ccsrGroups: [
        { ccsrCategory: 'TST001', description: 'Test group 1' },
        { ccsrCategory: 'TST002', description: 'Test group 2' },
      ],
      approvedMappings: 0,
    })
    expect((await audits())[0]).toMatchObject({
      action: 'unified.create',
      target: 'unified:serious-mental-illness',
    })
    // A draft is not public: no data_version bump.
    expect(await dataVersion()).toBeNull()
  })

  it('bumps data_version when a category is created published', async () => {
    await create({ status: 'published' })
    expect(await dataVersion()).toBe('1')
  })

  it('refuses invalid bodies, unknown CCSR groups and a retired category on create', async () => {
    for (const bad of [
      { ...body, label: '' },
      { ...body, federalCategory: 'unmapped' },
      { ...body, slug: 'Not A Slug' },
      { ...body, ccsr: ['nope'] },
      { ...body, label: '!!!' },
      'not json',
    ]) {
      expect((await send('POST', '/api/admin/unified', bad)).status).toBe(400)
    }
    const unknown = await send('POST', '/api/admin/unified', { ...body, ccsr: ['TST999'] })
    expect(unknown.status).toBe(400)
    expect(await unknown.json()).toEqual({ error: 'Unknown CCSR group: TST999' })
    expect((await send('POST', '/api/admin/unified', { ...body, status: 'retired' })).status).toBe(
      400,
    )
    expect(await list()).toEqual([])
  })

  it('refuses the reserved slug "codes", given or made from the label', async () => {
    const fromLabel = await send('POST', '/api/admin/unified', { ...body, label: 'Codes' })
    expect(fromLabel.status).toBe(400)
    expect(await fromLabel.json()).toEqual({
      error: 'The slug "codes" is reserved for the site; choose another slug',
    })
    expect((await send('POST', '/api/admin/unified', { ...body, slug: 'codes' })).status).toBe(400)
    expect(await list()).toEqual([])
  })

  it('answers 409 when the slug is taken, on create and on edit', async () => {
    const first = await create()
    const clash = await send('POST', '/api/admin/unified', body)
    expect(clash.status).toBe(409)
    expect(await clash.json()).toEqual({
      error: 'The slug "serious-mental-illness" is already used by another unified category',
    })
    const second = await create({ label: 'Depression' })
    const edit = await send('PUT', `/api/admin/unified/${String(second.id)}`, {
      ...body,
      slug: first.slug,
    })
    expect(edit.status).toBe(409)
  })

  it('adds 1 to the version only when the label, definition, includes or excludes change', async () => {
    const { id } = await create()
    const path = `/api/admin/unified/${String(id)}`
    const put = async (fields: Record<string, unknown>) => {
      const res = await send('PUT', path, { ...body, ...fields })
      expect(res.status).toBe(200)
      return unifiedSaveResponseSchema.parse(await res.json()).version
    }
    expect(await put({ sortOrder: 5, ccsr: ['TST003'], federalCategory: 'sud' })).toBe(1)
    expect(await put({ sortOrder: 5, ccsr: ['TST003'], federalCategory: 'sud' })).toBe(1)
    expect(await put({ definition: 'Changed.' })).toBe(2)
    expect(await put({ definition: 'Changed.', includes: 'Schizophrenia' })).toBe(3)
    expect(await put({ definition: 'Changed.', includes: 'Schizophrenia', label: 'SMI' })).toBe(4)
    const [item] = await list()
    // The slug is kept when the body leaves it out.
    expect(item).toMatchObject({ slug: 'serious-mental-illness', label: 'SMI', version: 4 })
    expect(item?.ccsr).toEqual(['TST001', 'TST002'])
  })

  it('replaces the CCSR group set', async () => {
    const { id } = await create()
    await send('PUT', `/api/admin/unified/${String(id)}`, { ...body, ccsr: ['TST003', 'TST002'] })
    const rows = await db.select().from(unifiedCcsr).where(eq(unifiedCcsr.unifiedId, id))
    expect(rows.map((r) => r.ccsrCategory).sort()).toEqual(['TST002', 'TST003'])
  })

  it('allows draft → published ⇄ retired, never back to draft, and bumps data_version', async () => {
    const { id } = await create()
    const path = `/api/admin/unified/${String(id)}`
    const to = (status: string, fields: Record<string, unknown> = {}) =>
      send('PUT', path, { ...body, ...fields, status })

    expect((await to('draft', { sortOrder: 2 })).status).toBe(200)
    expect(await dataVersion()).toBeNull()
    expect((await to('published')).status).toBe(200)
    expect(await dataVersion()).toBe('1')
    const back = await to('draft')
    expect(back.status).toBe(409)
    expect(await back.json()).toEqual({
      error: 'A unified category cannot go from published back to draft',
    })
    // An edit of a published category changes public pages.
    expect((await to('published', { sortOrder: 3 })).status).toBe(200)
    expect(await dataVersion()).toBe('2')
    expect((await to('retired')).status).toBe(200)
    expect((await to('published')).status).toBe(200)
    expect(await dataVersion()).toBe('4')
    expect((await audits()).map((a) => a.action)).toContain('unified.update')
  })

  it('retires a draft that was never published, without touching public pages', async () => {
    const { id } = await create()
    const path = `/api/admin/unified/${String(id)}`
    const res = await send('PUT', path, { ...body, status: 'retired' })
    expect(res.status).toBe(200)
    const [row] = await db.select().from(unifiedCategories).where(eq(unifiedCategories.id, id))
    expect(row?.status).toBe('retired')
    // A draft was never public, so retiring it changes no public page.
    expect(await dataVersion()).toBeNull()
    expect((await send('PUT', path, { ...body, status: 'draft' })).status).toBe(409)
    const last = (await audits()).find((a) => a.action === 'unified.update')
    expect(last?.details).toMatchObject({ status: ['draft', 'retired'] })
  })

  it('answers 404 for an unknown id', async () => {
    expect((await send('PUT', '/api/admin/unified/999', body)).status).toBe(404)
    expect((await send('PUT', '/api/admin/unified/abc', body)).status).toBe(404)
  })

  it('counts approved mappings only', async () => {
    const { id } = await create()
    const row = { stateId: 'LA', stateCategory: 'SMI', unifiedId: id, relation: 'exact' as const }
    const fields = { basis: 'state_text' as const, confidence: 'high' as const, mappedBy: ADMIN }
    await db.insert(unifiedMappings).values([
      { ...row, ...fields, status: 'approved', reviewedBy: ADMIN, reviewedAt: '2026-11-02' },
      { ...row, ...fields, stateCategory: 'Other', status: 'proposed' },
    ])
    expect((await list())[0]?.approvedMappings).toBe(1)
  })
})

describe('/api/admin/ccsr-categories', () => {
  beforeEach(async () => {
    await resetDb(env.DB)
    await db.insert(refCcsrCategories).values([
      { ccsrCategory: 'TST002', description: 'B', bodySystem: 'Test', release: 'test' },
      { ccsrCategory: 'TST001', description: 'A', bodySystem: 'Test', release: 'test' },
    ])
  })

  it('lists every CCSR category for the picker, by id', async () => {
    const res = await send('GET', '/api/admin/ccsr-categories')
    expect(res.status).toBe(200)
    expect(ccsrCategoryListResponseSchema.parse(await res.json()).items).toEqual([
      { ccsrCategory: 'TST001', description: 'A', bodySystem: 'Test' },
      { ccsrCategory: 'TST002', description: 'B', bodySystem: 'Test' },
    ])
  })
})

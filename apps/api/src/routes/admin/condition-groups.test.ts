import {
  auditListResponseSchema,
  conditionGroupListResponseSchema,
  conditionGroupSaveResponseSchema,
} from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import { appMeta, conditionMembers } from '../../db/schema'
import { accessToken, call } from '../../test/access-fixtures'
import { resetDb } from '../../test/reset-db'

// Condition groups (roadmap M6 step 4; docs/data-model.md, "Like codes").
const db = createDb(env.DB)

async function send(method: string, path: string, body?: unknown) {
  return call(path, { token: await accessToken(), method, ...(body === undefined ? {} : { body }) })
}

async function list() {
  const res = await send('GET', '/api/admin/condition-groups')
  expect(res.status).toBe(200)
  return conditionGroupListResponseSchema.parse(await res.json()).items
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
  name: 'Cancer and chemotherapy',
  definition: 'Malignant cancers and their treatment.',
  sources: 'ICD-10-CM Chapter 2; CPT chemotherapy administration (numbers only).',
  members: [
    { codeSystem: 'icd10cm', text: 'C00-C96' },
    { codeSystem: 'cpt', text: '96401-96549' },
    { codeSystem: 'hcpcs', text: 'J9000-J9999, Q0083' },
  ],
}

async function create(fields: Record<string, unknown> = {}) {
  const res = await send('POST', '/api/admin/condition-groups', { ...body, ...fields })
  expect(res.status).toBe(201)
  return conditionGroupSaveResponseSchema.parse(await res.json())
}

describe('/api/admin/condition-groups', () => {
  beforeEach(async () => {
    await resetDb(env.DB)
  })

  it('refuses a request without a signed Access token, or from a non-admin', async () => {
    expect((await call('/api/admin/condition-groups')).status).toBe(401)
    const outsider = await accessToken({ email: 'someone@example.org' })
    expect((await call('/api/admin/condition-groups', { token: outsider })).status).toBe(403)
  })

  it('creates a draft with a slug from the name, its parsed members and an audit row', async () => {
    const before = await dataVersion()
    const saved = await create()
    expect(saved).toEqual({ id: saved.id, slug: 'cancer-and-chemotherapy', members: 4 })
    const [group] = await list()
    expect(group).toMatchObject({
      slug: 'cancer-and-chemotherapy',
      name: 'Cancer and chemotherapy',
      status: 'draft',
      updatedBy: 'admin@example.org',
    })
    expect(group?.members.map((m) => [m.codeSystem, m.matchKind, m.text])).toEqual([
      ['cpt', 'range', '96401-96549'],
      ['hcpcs', 'range', 'J9000-J9999'],
      ['hcpcs', 'exact', 'Q0083'],
      ['icd10cm', 'range', 'C00-C96'],
    ])
    expect(group?.members[3]).toMatchObject({ codeNorm: 'C00', rangeEndNorm: 'C96' })
    const [audit] = await audits()
    expect(audit).toMatchObject({
      action: 'condition_group.create',
      target: 'condition_group:cancer-and-chemotherapy',
    })
    expect(audit?.details).toMatchObject({ status: 'draft', members: 4 })
    // Every change bumps data_version: public code pages read published groups.
    expect(await dataVersion()).not.toBe(before)
  })

  it('edits a group: replaces its members, keeps its slug, and records what changed', async () => {
    const { id } = await create()
    const v1 = await dataVersion()
    const res = await send('PUT', `/api/admin/condition-groups/${String(id)}`, {
      ...body,
      name: 'Cancer',
      status: 'published',
      members: [
        { codeSystem: 'icd10cm', text: 'C00-C96' },
        { codeSystem: 'hcpcs', text: 'J9000-J9999' },
        { codeSystem: 'icd10cm', text: 'Z51.1' },
      ],
    })
    expect(res.status).toBe(200)
    expect(conditionGroupSaveResponseSchema.parse(await res.json())).toEqual({
      id,
      slug: 'cancer-and-chemotherapy',
      members: 3,
    })
    const [group] = await list()
    expect(group).toMatchObject({ name: 'Cancer', status: 'published' })
    expect(group?.members.map((m) => m.text)).toEqual(['J9000-J9999', 'C00-C96', 'Z51.1'])
    expect(await db.select().from(conditionMembers)).toHaveLength(3)
    const [audit] = await audits()
    expect(audit).toMatchObject({ action: 'condition_group.update' })
    expect(audit?.details).toEqual({
      id,
      name: ['Cancer and chemotherapy', 'Cancer'],
      status: ['draft', 'published'],
      added: ['icd10cm Z51.1'],
      removed: ['cpt 96401-96549', 'hcpcs Q0083'],
    })
    expect(Number(await dataVersion())).toBe(Number(v1) + 1)
  })

  it('drops repeated members', async () => {
    const saved = await create({
      members: [
        { codeSystem: 'icd10cm', text: 'B20' },
        { codeSystem: 'icd10cm', text: 'b20, Z21' },
      ],
    })
    expect(saved.members).toBe(2)
  })

  it('refuses a member the parser cannot read, naming it, and writes nothing', async () => {
    const res = await send('POST', '/api/admin/condition-groups', {
      ...body,
      members: [
        { codeSystem: 'icd10cm', text: 'C00-C96' },
        { codeSystem: 'cpt', text: 'C50' },
      ],
    })
    expect(res.status).toBe(400)
    expect((await res.json<{ error: string }>()).error).toMatch(/^Member 2 \(CPT\): C50: /)
    expect(await list()).toEqual([])
    expect(await audits()).toEqual([])
  })

  it('refuses an invalid body, a reserved or taken slug, and unknown ids', async () => {
    const bad = await send('POST', '/api/admin/condition-groups', { name: '', members: [] })
    expect(bad.status).toBe(400)
    await create({ slug: 'cancer' })
    const clash = await send('POST', '/api/admin/condition-groups', { ...body, slug: 'cancer' })
    expect(clash.status).toBe(409)
    const nameless = await send('POST', '/api/admin/condition-groups', { ...body, name: '!!!' })
    expect(nameless.status).toBe(400)
    expect((await send('PUT', '/api/admin/condition-groups/999', body)).status).toBe(404)
    expect((await send('PUT', '/api/admin/condition-groups/abc', body)).status).toBe(404)
  })

  it('refuses a write that is not JSON from this site (adminWriteGuard)', async () => {
    const res = await call('/api/admin/condition-groups', {
      token: await accessToken(),
      method: 'POST',
      body,
      origin: 'https://evil.example',
    })
    expect(res.status).toBe(403)
    const form = await call('/api/admin/condition-groups', {
      token: await accessToken(),
      method: 'POST',
      rawBody: 'name=x',
      contentType: 'application/x-www-form-urlencoded',
    })
    expect(form.status).toBe(415)
  })
})

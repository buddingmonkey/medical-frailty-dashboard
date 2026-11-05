import {
  auditListResponseSchema,
  sha256Hex,
  sourceDocumentSchema,
  sourceListResponseSchema,
  sourceUploadResponseSchema,
} from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import { appMeta, datasetVersions, sourceDocuments, states, versionSources } from '../../db/schema'
import { ADMIN, accessToken, call } from '../../test/access-fixtures'
import { resetDb } from '../../test/reset-db'

const db = createDb(env.DB)
/** UTF-8 bytes on a plain ArrayBuffer (what fetch bodies and Web Crypto take). */
const bytes = (s: string) => new Uint8Array(new TextEncoder().encode(s))
const pdf = bytes('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n')
const csv = bytes('code,description\nF20.0,Paranoid schizophrenia\n')

interface UploadOptions {
  stateId?: string
  title?: string
  fileType?: string
  sha256?: string
  url?: string
  publisherDate?: string
  contentType?: string
}

async function upload(bytes: Uint8Array<ArrayBuffer>, options: UploadOptions = {}) {
  const query = new URLSearchParams({
    stateId: options.stateId ?? 'MT',
    title: options.title ?? 'DPHHS Medically Frail Condition List',
    fileType: options.fileType ?? 'pdf',
    sha256: options.sha256 ?? (await sha256Hex(bytes)),
    url: options.url ?? 'https://dphhs.mt.gov/list.pdf',
    publisherDate: options.publisherDate ?? '2026-09-29',
  })
  return call(`/api/admin/sources?${query.toString()}`, {
    token: await accessToken(),
    method: 'POST',
    rawBody: bytes,
    contentType: options.contentType ?? 'application/octet-stream',
  })
}

async function list(query: string) {
  const res = await call(`/api/admin/sources?${query}`, { token: await accessToken() })
  return sourceListResponseSchema.parse(await res.json()).items
}

async function storedKeys() {
  return (await env.FILES.list({ prefix: 'sources/' })).objects.map((o) => o.key)
}

describe('/api/admin/sources', () => {
  beforeEach(async () => {
    await resetDb(env.DB)
    const keys = await storedKeys()
    if (keys.length > 0) await env.FILES.delete(keys)
    await db.insert(states).values([
      { id: 'MT', slug: 'mt', name: 'Montana', fips: '30' },
      { id: 'NE', slug: 'ne', name: 'Nebraska', fips: '31' },
    ])
  })

  it('stores the original file in R2 as a download, records it and audits it', async () => {
    const res = await upload(pdf)

    expect(res.status).toBe(201)
    const { source, duplicate } = sourceUploadResponseSchema.parse(await res.json())
    expect(duplicate).toBe(false)
    expect(source).toMatchObject({
      stateId: 'MT',
      title: 'DPHHS Medically Frail Condition List',
      url: 'https://dphhs.mt.gov/list.pdf',
      publisherDate: '2026-09-29',
      fileType: 'pdf',
      sha256: await sha256Hex(pdf),
      byteSize: pdf.byteLength,
      uploadedBy: ADMIN,
      versions: [],
    })

    const [key] = await storedKeys()
    expect(key).toMatch(/^sources\/[0-9a-f-]{36}$/)
    const object = await env.FILES.get(key ?? '')
    expect(object?.httpMetadata).toMatchObject({
      contentType: 'application/octet-stream',
      contentDisposition: 'attachment',
    })
    expect(new Uint8Array((await object?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(pdf)

    const audit = auditListResponseSchema.parse(
      await (await call('/api/admin/audit', { token: await accessToken() })).json(),
    )
    expect(audit.items[0]).toMatchObject({
      action: 'source.upload',
      target: `source:${String(source.id)}`,
      details: { stateId: 'MT', sha256: source.sha256, byteSize: pdf.byteLength },
    })
  })

  it('returns the stored source for the same file and state, and writes nothing new', async () => {
    const first = sourceUploadResponseSchema.parse(await (await upload(pdf)).json())
    const version = await db
      .insert(datasetVersions)
      .values({ stateId: 'MT', versionNo: 1, createdBy: ADMIN })
      .returning()
    await db
      .insert(versionSources)
      .values({ versionId: version[0]?.id ?? 0, sourceDocumentId: first.source.id })

    const res = await upload(pdf, { title: 'Same file, new name' })

    expect(res.status).toBe(200)
    const again = sourceUploadResponseSchema.parse(await res.json())
    expect(again.duplicate).toBe(true)
    expect(again.source.id).toBe(first.source.id)
    expect(again.source.title).toBe('DPHHS Medically Frail Condition List')
    expect(again.source.versions).toEqual([{ id: version[0]?.id, versionNo: 1, status: 'draft' }])
    expect(await storedKeys()).toHaveLength(1)
  })

  it('stores the same file again for another state', async () => {
    await upload(pdf)
    expect((await upload(pdf, { stateId: 'NE' })).status).toBe(201)
    expect(await storedKeys()).toHaveLength(2)
  })

  it('refuses a file whose hash or type does not match what the browser said', async () => {
    const wrongHash = await upload(pdf, { sha256: 'b'.repeat(64) })
    expect(wrongHash.status).toBe(400)
    expect(await wrongHash.json()).toEqual({
      error: 'The file the server received does not match the file you picked. Upload it again.',
    })

    const notPdf = await upload(csv, { fileType: 'pdf' })
    expect(notPdf.status).toBe(400)
    expect(await notPdf.json()).toEqual({
      error: 'The file name ends in .pdf, but the file is not a .pdf file.',
    })

    expect(await storedKeys()).toEqual([])
  })

  it('refuses an unknown state, a bad query and an empty file', async () => {
    expect((await upload(pdf, { stateId: 'ZZ' })).status).toBe(400)
    expect((await upload(pdf, { fileType: 'exe' })).status).toBe(400)
    expect((await upload(new Uint8Array(), { fileType: 'csv' })).status).toBe(400)
    expect(await storedKeys()).toEqual([])
  })

  it('takes only a raw file body, up to 25 MB', async () => {
    expect((await upload(pdf, { contentType: 'application/json' })).status).toBe(415)
    expect((await upload(pdf, { contentType: 'multipart/form-data; boundary=x' })).status).toBe(415)

    const big = new Uint8Array(25 * 1024 * 1024 + 1)
    big.set(pdf)
    expect((await upload(big, { sha256: 'c'.repeat(64) })).status).toBe(413)
    expect(await storedKeys()).toEqual([])
  })

  it('takes JSON, not a raw file, on other admin writes', async () => {
    const res = await call('/api/admin/watch', {
      token: await accessToken(),
      method: 'POST',
      rawBody: pdf,
      contentType: 'application/octet-stream',
    })
    expect(res.status).toBe(415)
  })

  it('lists a state’s sources newest first, or finds one by hash', async () => {
    await upload(pdf)
    await upload(csv, { fileType: 'csv', title: 'CSV copy' })
    await upload(csv, { fileType: 'csv', stateId: 'NE' })

    expect((await list('stateId=MT')).map((s) => s.title)).toEqual([
      'CSV copy',
      'DPHHS Medically Frail Condition List',
    ])
    const byHash = await list(`stateId=MT&sha256=${await sha256Hex(pdf)}`)
    expect(byHash.map((s) => s.fileType)).toEqual(['pdf'])
    expect(await list(`stateId=GA&sha256=${await sha256Hex(pdf)}`)).toEqual([])

    const bad = await call('/api/admin/sources?stateId=montana', { token: await accessToken() })
    expect(bad.status).toBe(400)
  })

  it('lists more sources than D1 binds parameters (100), each with its versions', async () => {
    // One insert per row: a multi-row insert would hit the same limit.
    const [one, ...more] = Array.from({ length: 108 }, (_, i) =>
      db
        .insert(sourceDocuments)
        .values({
          stateId: 'MT',
          title: `File ${String(i)}`,
          fileType: 'pdf',
          sha256: i.toString(16).padStart(64, '0'),
          r2Key: `sources/MT/${String(i)}`,
          byteSize: 1,
          uploadedBy: ADMIN,
        })
        .returning(),
    )
    if (!one) throw new Error('no inserts')
    const docs = (await db.batch([one, ...more])).flat()
    const [version] = await db
      .insert(datasetVersions)
      .values({ stateId: 'MT', versionNo: 1, status: 'draft', createdBy: ADMIN })
      .returning()
    const first = docs[0]
    const last = docs.at(-1)
    if (!version || !first || !last) throw new Error('insert failed')
    await db.insert(versionSources).values([
      { versionId: version.id, sourceDocumentId: first.id },
      { versionId: version.id, sourceDocumentId: last.id },
    ])

    const items = await list('stateId=MT')
    expect(items).toHaveLength(108)
    const withVersion = items.filter((s) => s.versions.length > 0).map((s) => s.title)
    expect(withVersion).toEqual(['File 107', 'File 0'])
  })

  it('downloads the original file as an attachment, never inline', async () => {
    const { source } = sourceUploadResponseSchema.parse(await (await upload(pdf)).json())

    const res = await call(`/api/admin/sources/${String(source.id)}/file`, {
      token: await accessToken(),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/octet-stream')
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename="MT-source-${String(source.id)}.pdf"`,
    )
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(pdf)

    const missing = await call('/api/admin/sources/999/file', { token: await accessToken() })
    expect(missing.status).toBe(404)
  })
})

describe('PUT /api/admin/sources/:id', () => {
  const details = {
    title: 'Georgia Pathways frailty codes',
    url: 'https://dch.georgia.gov/frailty.pdf',
    publisherDate: '2026-07-01',
  }

  async function put(id: number | string, body: unknown, token?: string) {
    return call(`/api/admin/sources/${String(id)}`, {
      token: token ?? (await accessToken()),
      method: 'PUT',
      body,
    })
  }

  async function dataVersion() {
    const [meta] = await db.select().from(appMeta).where(eq(appMeta.key, 'data_version'))
    return meta?.value ?? null
  }

  async function storedSource() {
    const res = await upload(pdf, { url: '', publisherDate: '' })
    return sourceUploadResponseSchema.parse(await res.json()).source
  }

  async function link(sourceId: number, status: 'draft' | 'published' | 'superseded') {
    const [version] = await db
      .insert(datasetVersions)
      .values({ stateId: 'MT', versionNo: 1, status, createdBy: ADMIN })
      .returning()
    await db
      .insert(versionSources)
      .values({ versionId: version?.id ?? 0, sourceDocumentId: sourceId })
  }

  beforeEach(async () => {
    await resetDb(env.DB)
    const keys = await storedKeys()
    if (keys.length > 0) await env.FILES.delete(keys)
    await db.insert(states).values({ id: 'MT', slug: 'mt', name: 'Montana', fips: '30' })
  })

  it('refuses a request without a signed Access token, or from a non-admin', async () => {
    const res = await call('/api/admin/sources/1', { method: 'PUT', body: details })
    expect(res.status).toBe(401)
    const outsider = await accessToken({ email: 'someone@example.org' })
    expect((await put(1, details, outsider)).status).toBe(403)
  })

  it('refuses a write that is not JSON from this site (adminWriteGuard)', async () => {
    const source = await storedSource()
    const cross = await call(`/api/admin/sources/${String(source.id)}`, {
      token: await accessToken(),
      method: 'PUT',
      body: details,
      origin: 'https://evil.example',
    })
    expect(cross.status).toBe(403)
    const form = await call(`/api/admin/sources/${String(source.id)}`, {
      token: await accessToken(),
      method: 'PUT',
      rawBody: 'title=x',
      contentType: 'application/x-www-form-urlencoded',
    })
    expect(form.status).toBe(415)
  })

  it('refuses a bad body: non-https or invalid URL, future date, empty title', async () => {
    const source = await storedSource()
    for (const change of [
      { url: 'http://dch.georgia.gov/frailty.pdf' },
      { url: 'not a url' },
      { url: 'javascript:alert(1)' },
      { publisherDate: '2999-01-01' },
      { publisherDate: '07/01/2026' },
      { title: '' },
    ]) {
      expect((await put(source.id, { ...details, ...change })).status).toBe(400)
    }
    const [row] = await db.select().from(sourceDocuments)
    expect(row).toMatchObject({ url: null, publisherDate: null })
  })

  it('returns 404 for an unknown id', async () => {
    expect((await put(999, details)).status).toBe(404)
    expect((await put('abc', details)).status).toBe(404)
  })

  it('updates the details, never the file, and audits old and new values', async () => {
    const source = await storedSource()
    const [before] = await db.select().from(sourceDocuments)

    const res = await put(source.id, details)

    expect(res.status).toBe(200)
    const updated = sourceDocumentSchema.parse(await res.json())
    expect(updated).toMatchObject({ id: source.id, ...details })
    const [after] = await db.select().from(sourceDocuments)
    expect(after).toEqual({ ...before, ...details })

    const audit = auditListResponseSchema.parse(
      await (await call('/api/admin/audit', { token: await accessToken() })).json(),
    )
    expect(audit.items[0]).toMatchObject({
      action: 'source.update',
      target: `source:${String(source.id)}`,
      details: {
        stateId: 'MT',
        before: { title: source.title, url: null, publisherDate: null },
        after: details,
      },
    })
    // A draft-only source is not on any public page: the cache stays.
    expect(await dataVersion()).toBeNull()
  })

  it('clears the URL and date with null', async () => {
    const source = await storedSource()
    await put(source.id, details)
    const res = await put(source.id, { ...details, url: null, publisherDate: null })
    expect(res.status).toBe(200)
    const [row] = await db.select().from(sourceDocuments)
    expect(row).toMatchObject({ url: null, publisherDate: null })
  })

  it.each(['published', 'superseded'] as const)(
    'bumps data_version when the source belongs to a %s version',
    async (status) => {
      const source = await storedSource()
      await link(source.id, status)

      expect((await put(source.id, details)).status).toBe(200)
      expect(await dataVersion()).toBe('1')
    },
  )
})

it('never sends the R2 key to the browser', async () => {
  await resetDb(env.DB)
  await db.insert(states).values({ id: 'MT', slug: 'mt', name: 'Montana', fips: '30' })
  const res = await upload(pdf)
  expect(await res.text()).not.toContain('sources/')
})

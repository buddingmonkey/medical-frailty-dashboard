import {
  BACKUP_EXCLUDED_TABLES,
  BACKUP_TABLES,
  fullBackupSchema,
  parseBackup,
  restoreMappingsSchema,
  restorePlan,
  restoreSourceResponseSchema,
} from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { unzipSync } from 'fflate'
import { beforeEach, describe, expect, it } from 'vitest'

import { backupBaseName, writeFullBackup } from '../../db/backup-dump'
import { createDb } from '../../db/client'
import { publishedEntries } from '../../db/published'
import {
  auditLog,
  categoryMappings,
  chapterMappings,
  entries,
  sourceDocuments,
  states,
} from '../../db/schema'
import { accessToken, ADMIN, call } from '../../test/access-fixtures'
import { draftWith, entry, publishAll, send, sourceIds } from '../../test/draft-fixtures'
import { resetDb } from '../../test/reset-db'

// Backup download and restore path 2 (docs/deployment.md, "Backups and restore").

const db = createDb(env.DB)

async function download() {
  return call('/api/admin/backup', { token: await accessToken() })
}

/** The one JSON file inside the download. */
async function downloadJson() {
  const res = await download()
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()))
  const names = Object.keys(files)
  const [name] = names
  const bytes = name === undefined ? undefined : files[name]
  if (names.length !== 1 || !name || !bytes) throw new Error(`zip holds ${names.join(', ')}`)
  return { res, name, text: new TextDecoder().decode(bytes) }
}

async function audits(action: string) {
  return db.select().from(auditLog).where(eq(auditLog.action, action))
}

beforeEach(async () => {
  await resetDb(env.DB)
  await db.insert(states).values([
    { id: 'MT', slug: 'mt', name: 'Montana', fips: '30' },
    { id: 'NE', slug: 'ne', name: 'Nebraska', fips: '31' },
  ])
  for (const stateId of ['MT', 'NE']) {
    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        stateId,
        title: `${stateId} list`,
        url: `https://example.gov/${stateId}.pdf`,
        fileType: 'pdf',
        sha256: stateId === 'MT' ? 'a'.repeat(64) : 'b'.repeat(64),
        r2Key: `sources/${stateId}`,
        byteSize: 10,
        uploadedBy: ADMIN,
      })
      .returning()
    sourceIds[stateId] = doc?.id ?? 0
  }
})

describe('GET /api/admin/backup', () => {
  it('streams a zip holding one JSON file of every state-data table', async () => {
    const id = await draftWith('MT', [entry('F20.0'), entry('F31.0')])
    expect((await publishAll(id, 'MT')).status).toBe(200)

    const { res, name, text } = await downloadJson()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('cache-control')).toBe('no-store')
    const disposition = res.headers.get('content-disposition') ?? ''
    expect(disposition).toMatch(/^attachment; filename="frailty-backup-test-\d{8}T\d{6}Z\.zip"$/)
    expect(disposition).toContain(name.replace('.json', '.zip'))

    const backup = fullBackupSchema.parse(JSON.parse(text))
    expect(Object.keys(backup.tables)).toEqual([...BACKUP_TABLES])
    for (const table of Object.keys(BACKUP_EXCLUDED_TABLES)) {
      expect(text).not.toContain(`"${table}":[`)
    }
    expect(backup.environment).toBe('test')
    expect(backup.migration).toMatch(/^\d{4}_/)
    expect(backup.dataVersion).toBe(1)
    expect(backup.notes.join(' ')).toContain('ref_codes')
    expect(backup.tables.states.map((s) => s.id)).toEqual(['MT', 'NE'])
    expect(backup.tables.entries.map((e) => e.rawCode)).toEqual(['F20.0', 'F31.0'])
    // camelCase like the per-publish backup, so one importer reads both.
    expect(backup.tables.entries[0]).toMatchObject({ versionId: id, codeNorm: 'F200' })
    // The R2 key never leaves the Worker (docs/security.md); the hash does.
    expect(backup.tables.source_documents[0]).not.toHaveProperty('r2Key')
    expect(backup.tables.source_documents[0]).toMatchObject({ sha256: 'a'.repeat(64) })
    // Nothing from the request (the Access token, headers) ends up in the file.
    expect(text).not.toMatch(/eyJ|Cf-Access|cf-access|jwt/i)
    expect(await audits('backup.download')).toHaveLength(1)
  })

  it('reads every table in pages, keyset on rowid', async () => {
    const id = await draftWith('MT', [entry('F20.0'), entry('F31.0'), entry('F32.9')])
    const chunks: string[] = []
    const stats = await writeFullBackup(
      env.DB,
      { environment: 'test', writtenAt: '2026-11-03T00:00:00.000Z' },
      (chunk) => {
        chunks.push(chunk)
        return Promise.resolve()
      },
      { pageRows: 2 },
    )
    const backup = fullBackupSchema.parse(JSON.parse(chunks.join('')))
    expect(backup.tables.entries.map((e) => e.versionId)).toEqual([id, id, id])
    expect(stats.tables.entries).toBe(3)
    expect(stats.tables.states).toBe(2)
    expect(stats.rows).toBe(Object.values(backup.tables).reduce((n, rows) => n + rows.length, 0))
    // Two head queries, then per table one page per 2 rows plus the last (short or empty) one.
    const pages = Object.values(stats.tables).reduce((n, rows) => n + Math.floor(rows / 2) + 1, 0)
    expect(stats.queries).toBe(2 + pages)
    expect(stats.rowsRead).toBeGreaterThanOrEqual(stats.rows)
  })

  it('knows every table of the database: backed up, or left out on purpose', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    ).all<{ name: string }>()
    const ours = results
      .map((r) => r.name)
      .filter(
        (n) =>
          !n.startsWith('sqlite_') &&
          !n.startsWith('_cf_') &&
          n !== 'd1_migrations' &&
          // FTS5 shadow tables of entries_fts and ref_codes_fts.
          !/^(entries|ref_codes)_fts_(data|idx|content|docsize|config)$/.test(n),
      )
    const known = new Set<string>([...BACKUP_TABLES, ...Object.keys(BACKUP_EXCLUDED_TABLES)])
    expect(ours.filter((n) => !known.has(n))).toEqual([])
    expect([...known].filter((n) => !ours.includes(n))).toEqual([])
  })

  it('names the file by environment and UTC time', () => {
    expect(backupBaseName('preview', '2026-11-03T12:34:56.789Z')).toBe(
      'frailty-backup-preview-20261103T123456Z',
    )
    expect(backupBaseName('Pro d"uction', '2026-11-03T12:34:56.789Z')).toBe(
      'frailty-backup-production-20261103T123456Z',
    )
  })

  it('is admin-only: 401 without a token, 403 for a non-admin', async () => {
    expect((await call('/api/admin/backup')).status).toBe(401)
    const res = await call('/api/admin/backup', {
      token: await accessToken({ email: 'guest@example.org' }),
    })
    expect(res.status).toBe(403)
    expect(await audits('backup.download')).toHaveLength(0)
  })
})

describe('restore path 2', () => {
  it('restores a lost version through a draft, checks and publish', async () => {
    const original = await draftWith('MT', [entry('F20.0'), entry('F31.0', { tier: 'B' })])
    expect((await publishAll(original, 'MT')).status).toBe(200)
    const { text } = await downloadJson()
    const bundle = parseBackup(text)
    const version = bundle.versions.find((v) => v.version.id === original)
    if (!version) throw new Error('version missing from the backup')
    const plan = restorePlan(version)
    expect(plan.problems).toEqual([])

    // History lost: the entries are gone (the version row stays, it is the FK target).
    await db.delete(entries).where(eq(entries.versionId, original))

    const [source] = plan.sources
    if (!source) throw new Error('no source')
    const restored = restoreSourceResponseSchema.parse(
      await (
        await send('POST', '/api/admin/backup/sources', {
          stateId: 'MT',
          title: source.title,
          url: source.url,
          publisherDate: source.publisherDate,
          fileType: 'pdf',
          sha256: source.sha256,
          byteSize: 10,
        })
      ).json(),
    )
    expect(restored).toEqual({ sourceDocumentId: sourceIds['MT'], reused: true })

    const created = await send('POST', '/api/admin/drafts', {
      stateId: 'MT',
      fromBackup: {
        writtenAt: bundle.writtenAt,
        environment: bundle.environment,
        versionNo: plan.versionNo,
        format: 2,
      },
    })
    expect(created.status).toBe(201)
    const { item } = await created.json<{ item: { id: number } }>()
    const path = `/api/admin/drafts/${String(item.id)}`
    for (const part of plan.parts) {
      const put = await send('PUT', `${path}/sources/${String(restored.sourceDocumentId)}`, {
        part: part.part,
        expectedEntries: part.entries.length,
        invalidRowCount: part.invalidRowCount,
        namedStateIds: part.namedStateIds,
      })
      expect(put.status).toBe(200)
      const rows = await send('POST', `${path}/rows`, {
        sourceDocumentId: restored.sourceDocumentId,
        part: part.part,
        entries: part.entries,
      })
      expect(rows.status).toBe(200)
    }
    expect((await publishAll(item.id, 'MT')).status).toBe(200)
    const published = await publishedEntries(db, 'MT')
    expect(published.map((e) => [e.rawCode, e.tier])).toEqual([
      ['F20.0', null],
      ['F31.0', 'B'],
    ])
    const [audit] = await audits('draft.restore')
    expect(JSON.parse(audit?.detailsJson ?? '{}')).toMatchObject({
      stateId: 'MT',
      backupWrittenAt: bundle.writtenAt,
      backupEnvironment: 'test',
      backupVersionNo: plan.versionNo,
    })
  })

  it('stores a source whose file is gone as metadata only', async () => {
    const res = await send('POST', '/api/admin/backup/sources', {
      stateId: 'NE',
      title: 'NE list 2026',
      url: 'https://example.gov/ne-2026.pdf',
      publisherDate: '2026-09-01',
      fileType: 'pdf',
      sha256: 'c'.repeat(64),
      byteSize: null,
    })
    expect(res.status).toBe(201)
    const body = restoreSourceResponseSchema.parse(await res.json())
    expect(body.reused).toBe(false)
    const [row] = await db
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.id, body.sourceDocumentId))
    expect(row).toMatchObject({ stateId: 'NE', title: 'NE list 2026', byteSize: 0 })
    expect(row?.r2Key).toMatch(/^restored\//)
    const file = await send('GET', `/api/admin/sources/${String(body.sourceDocumentId)}/file`)
    expect(file.status).toBe(404)
    expect(await file.json()).toEqual({
      error: 'Restored from a backup: the file is not available.',
    })
    expect(await audits('source.restore')).toHaveLength(1)
  })

  it('refuses a bad source and an unknown state', async () => {
    const good = {
      stateId: 'NE',
      title: 'x',
      url: null,
      publisherDate: null,
      fileType: 'pdf',
      sha256: 'c'.repeat(64),
      byteSize: 1,
    }
    expect((await send('POST', '/api/admin/backup/sources', { ...good, sha256: 'x' })).status).toBe(
      400,
    )
    expect(
      (await send('POST', '/api/admin/backup/sources', { ...good, stateId: 'ZZ' })).status,
    ).toBe(400)
    expect(
      (await send('POST', '/api/admin/backup/sources', { ...good, url: 'javascript:alert(1)' }))
        .status,
    ).toBe(400)
  })

  it('replaces a state’s mappings only when asked, and only that state’s', async () => {
    await db.insert(categoryMappings).values([
      {
        stateId: 'MT',
        stateCategory: 'SMI',
        federalCategory: 'state_specific',
        method: 'manual',
        mappedBy: ADMIN,
      },
      {
        stateId: 'NE',
        stateCategory: 'SMI',
        federalCategory: 'state_specific',
        method: 'manual',
        mappedBy: ADMIN,
      },
    ])
    const current = restoreMappingsSchema.parse(
      await (await send('GET', '/api/admin/backup/mappings?stateId=MT')).json(),
    )
    expect(current.categoryMappings).toHaveLength(1)

    const fromFile = {
      categoryMappings: [
        {
          stateId: 'MT',
          stateCategory: 'Behavioral',
          stateSubcategory: '',
          federalCategory: 'disabling_mental_disorder',
          method: 'manual',
          confidence: null,
          mappedBy: 'old-admin@example.org',
          mappedAt: '2026-10-01T00:00:00.000Z',
        },
      ],
      chapterMappings: [
        {
          stateId: 'MT',
          chapter: 5,
          federalCategory: 'disabling_mental_disorder',
          mappedBy: 'old-admin@example.org',
          mappedAt: '2026-10-01T00:00:00.000Z',
        },
      ],
      columnProfiles: [],
    }
    expect((await send('PUT', '/api/admin/backup/mappings/MT', fromFile)).status).toBe(200)
    const mt = await db.select().from(categoryMappings).where(eq(categoryMappings.stateId, 'MT'))
    expect(mt.map((m) => m.stateCategory)).toEqual(['Behavioral'])
    expect(mt[0]?.mappedBy).toBe('old-admin@example.org')
    expect(await db.select().from(chapterMappings)).toHaveLength(1)
    const ne = await db.select().from(categoryMappings).where(eq(categoryMappings.stateId, 'NE'))
    expect(ne).toHaveLength(1)
    expect(await audits('mappings.restore')).toHaveLength(1)

    // A row of another state is refused, and nothing changes.
    const other = {
      ...fromFile,
      categoryMappings: [{ ...fromFile.categoryMappings[0], stateId: 'NE' }],
    }
    expect((await send('PUT', '/api/admin/backup/mappings/MT', other)).status).toBe(400)
    expect((await send('PUT', '/api/admin/backup/mappings/ZZ', fromFile)).status).toBe(404)
  })
})

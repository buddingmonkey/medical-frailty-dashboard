// The migrated database itself: tables, constraints and the FTS index (docs/data-model.md).
// Raw SQL on purpose, so these tests check what D1 enforces, not what Drizzle's types allow.
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

import { resetDb } from '../test/reset-db'

const db = env.DB

const TABLES = [
  'states',
  'source_documents',
  'dataset_versions',
  'version_sources',
  'entries',
  'category_mappings',
  'ref_codes',
  'condition_groups',
  'condition_members',
  'app_meta',
  'audit_log',
  'watch_items',
  'entries_fts',
]

/** One state with a source document and a draft version; returns their ids. */
async function seedState(id = 'LA', slug = id.toLowerCase()) {
  await db
    .prepare(`INSERT INTO states (id, slug, name, fips) VALUES (?, ?, ?, ?)`)
    .bind(id, slug, `State ${id}`, '22')
    .run()
  const doc = await db
    .prepare(
      `INSERT INTO source_documents (state_id, title, file_type, sha256, r2_key, byte_size, uploaded_by)
       VALUES (?, 'Code list', 'pdf', ?, ?, 100, 'admin') RETURNING id`,
    )
    .bind(id, `sha-${id}`, `sources/${id}/list.pdf`)
    .first<{ id: number }>()
  const version = await db
    .prepare(
      `INSERT INTO dataset_versions (state_id, version_no, created_by) VALUES (?, 1, 'admin') RETURNING id`,
    )
    .bind(id)
    .first<{ id: number }>()
  if (!doc || !version) throw new Error('seed failed')
  return { docId: doc.id, versionId: version.id }
}

function insertEntry(
  versionId: number,
  docId: number,
  fields: Partial<Record<'code_system' | 'raw_code' | 'code_norm' | 'description', string>> = {},
) {
  return db
    .prepare(
      `INSERT INTO entries (version_id, source_document_id, code_system, raw_code, code_norm,
                            description_published, state_category)
       VALUES (?, ?, ?, ?, ?, ?, 'SMI') RETURNING id`,
    )
    .bind(
      versionId,
      docId,
      fields.code_system ?? 'icd10cm',
      fields.raw_code ?? 'F20.0',
      fields.code_norm ?? 'F200',
      fields.description ?? 'Paranoid schizophrenia',
    )
    .first<{ id: number }>()
}

async function ftsIds(query: string): Promise<number[]> {
  const { results } = await db
    .prepare(`SELECT rowid AS id FROM entries_fts WHERE entries_fts MATCH ? ORDER BY rowid`)
    .bind(query)
    .all<{ id: number }>()
  return results.map((r) => r.id)
}

describe('schema', () => {
  let ids: { docId: number; versionId: number }
  beforeEach(async () => {
    await resetDb(db)
    ids = await seedState()
  })

  it('has every table in docs/data-model.md', async () => {
    const { results } = await db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all<{ name: string }>()
    const names = results.map((r) => r.name)
    for (const table of TABLES) expect(names).toContain(table)
  })

  it('fills defaults: status, empty subcategory, unknown qualification, timestamps', async () => {
    const entry = await insertEntry(ids.versionId, ids.docId)
    const row = await db.prepare(`SELECT * FROM entries WHERE id = ?`).bind(entry?.id).first()
    expect(row).toMatchObject({
      match_kind: 'exact',
      state_subcategory: '',
      qualification: 'unknown',
      qualification_basis: 'published',
    })
    const version = await db
      .prepare(`SELECT status, created_at, row_count FROM dataset_versions WHERE id = ?`)
      .bind(ids.versionId)
      .first<{ status: string; created_at: string; row_count: number }>()
    expect(version?.status).toBe('draft')
    expect(version?.row_count).toBe(0)
    expect(version?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('rejects values outside the shared enums', async () => {
    await expect(
      insertEntry(ids.versionId, ids.docId, { code_system: 'ICD-10-CM' }),
    ).rejects.toThrow(/CHECK constraint failed/)
    await expect(
      db
        .prepare(`UPDATE dataset_versions SET status = 'live' WHERE id = ?`)
        .bind(ids.versionId)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/)
  })

  it('rejects a range entry without an end, and an end on a non-range entry', async () => {
    const sql = `INSERT INTO entries (version_id, source_document_id, code_system, raw_code, code_norm,
                   match_kind, range_end_norm, state_category) VALUES (?, ?, 'cpt', '32851', '32851', ?, ?, 'X')`
    await expect(
      db.prepare(sql).bind(ids.versionId, ids.docId, 'range', null).run(),
    ).rejects.toThrow(/CHECK constraint failed/)
    await expect(
      db.prepare(sql).bind(ids.versionId, ids.docId, 'exact', '32854').run(),
    ).rejects.toThrow(/CHECK constraint failed/)
    await db.prepare(sql).bind(ids.versionId, ids.docId, 'range', '32854').run()
  })

  it('enforces foreign keys', async () => {
    await expect(insertEntry(999_999, ids.docId)).rejects.toThrow(/FOREIGN KEY constraint failed/)
    await expect(
      db.prepare(`UPDATE states SET published_version_id = 999999 WHERE id = 'LA'`).run(),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/)
  })

  it('keeps one mapping per state category, even with no subcategory', async () => {
    const sql = `INSERT INTO category_mappings (state_id, state_category, federal_category, method)
                 VALUES ('LA', 'SMI', ?, 'manual')`
    await db.prepare(sql).bind('disabling_mental_disorder').run()
    await expect(db.prepare(sql).bind('sud').run()).rejects.toThrow(/UNIQUE constraint failed/)
  })

  it('allows only one published version per state, and unique version numbers', async () => {
    await expect(
      db
        .prepare(
          `INSERT INTO dataset_versions (state_id, version_no, created_by) VALUES ('LA', 1, 'a')`,
        )
        .run(),
    ).rejects.toThrow(/UNIQUE constraint failed/)
    const insert = db.prepare(
      `INSERT INTO dataset_versions (state_id, version_no, status, created_by) VALUES ('LA', ?, 'published', 'a')`,
    )
    await insert.bind(2).run()
    await expect(insert.bind(3).run()).rejects.toThrow(/UNIQUE constraint failed/)
  })

  it('requires the state slug to be the lowercase postal code (user, 2026-11-01)', async () => {
    await expect(seedState('GA', 'georgia')).rejects.toThrow(/CHECK constraint failed/)
    await expect(seedState('NE', 'NE')).rejects.toThrow(/CHECK constraint failed/)
    await seedState('NE', 'ne')
  })
})

describe('entries_fts', () => {
  let ids: { docId: number; versionId: number }
  beforeEach(async () => {
    await resetDb(db)
    ids = await seedState()
  })

  it('indexes new entries by code and description, with prefix search', async () => {
    const entry = await insertEntry(ids.versionId, ids.docId)
    expect(await ftsIds('schizophrenia')).toEqual([entry?.id])
    expect(await ftsIds('F20*')).toEqual([entry?.id])
    expect(await ftsIds('code_norm:F200')).toEqual([entry?.id])
  })

  it('follows updates and deletes, including cascades from a deleted version', async () => {
    const entry = await insertEntry(ids.versionId, ids.docId)
    await db
      .prepare(`UPDATE entries SET description_published = 'Catatonic schizophrenia' WHERE id = ?`)
      .bind(entry?.id)
      .run()
    expect(await ftsIds('paranoid')).toEqual([])
    expect(await ftsIds('catatonic')).toEqual([entry?.id])

    await db.prepare(`DELETE FROM dataset_versions WHERE id = ?`).bind(ids.versionId).run()
    expect(await ftsIds('catatonic')).toEqual([])
    const { results } = await db.prepare(`SELECT id FROM entries`).all()
    expect(results).toEqual([])
  })

  it('passes the FTS integrity check', async () => {
    await insertEntry(ids.versionId, ids.docId)
    await db.prepare(`INSERT INTO entries_fts(entries_fts) VALUES ('integrity-check')`).run()
  })
})

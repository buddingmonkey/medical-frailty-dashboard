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
  'unified_categories',
  'unified_ccsr',
  'unified_mappings',
  'ref_ccsr_categories',
  'ref_ccsr',
  'entry_unified',
  'unified_universe',
  'state_similarity',
  'ref_codes_fts',
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

  it('stores ref_codes so each row costs one D1 write (WITHOUT ROWID, no extra index)', async () => {
    // ~107k rows against a 100k-writes-per-day free tier: every index would add a write per row.
    const table = await db
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ref_codes'`)
      .first<{ sql: string }>()
    expect(table?.sql).toMatch(/WITHOUT ROWID\s*$/)
    const { results } = await db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'ref_codes'`)
      .all<{ name: string }>()
    expect(results).toEqual([])
    await db
      .prepare(
        `INSERT INTO ref_codes (code_system, code_norm, description, chapter, billable, valid_from)
         VALUES ('icd10cm', 'F200', 'Paranoid schizophrenia', '5', 1, '2026-10-01')`,
      )
      .run()
  })

  it('stores ref_ccsr so each row costs one D1 write (WITHOUT ROWID, no extra index)', async () => {
    // Like ref_codes: the CCSR load counts against the same 100k-writes-per-day free tier.
    const table = await db
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ref_ccsr'`)
      .first<{ sql: string }>()
    expect(table?.sql).toMatch(/WITHOUT ROWID\s*$/)
    const { results } = await db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'ref_ccsr'`)
      .all<{ name: string }>()
    expect(results).toEqual([])
    await db
      .prepare(
        `INSERT INTO ref_ccsr_categories (ccsr_category, description, body_system, release)
         VALUES ('TST001', 'Test group', 'TST', 'ccsr-dx-test')`,
      )
      .run()
    const insert = db.prepare(
      `INSERT INTO ref_ccsr (code_norm, ccsr_category, is_default, release) VALUES (?, 'TST001', ?, 'ccsr-dx-test')`,
    )
    await insert.bind('F20', 1).run()
    await expect(insert.bind('F20', 0).run()).rejects.toThrow(/UNIQUE constraint failed/)
    await expect(insert.bind('F21', 2).run()).rejects.toThrow(/CHECK constraint failed/)
  })

  it('requires the state slug to be the lowercase postal code (user, 2026-11-01)', async () => {
    await expect(seedState('GA', 'georgia')).rejects.toThrow(/CHECK constraint failed/)
    await expect(seedState('NE', 'NE')).rejects.toThrow(/CHECK constraint failed/)
    await seedState('NE', 'ne')
  })
})

describe('unified categories (docs/data-model.md, "Unified categories (M5)")', () => {
  beforeEach(async () => {
    await resetDb(db)
    await seedState()
  })

  function insertCategory(slug = 'serious-mental-illness', federal = 'disabling_mental_disorder') {
    return db
      .prepare(
        `INSERT INTO unified_categories (slug, label, definition, federal_category, created_by, updated_by)
         VALUES (?, 'Serious mental illness', 'Psychoses', ?, 'admin', 'admin') RETURNING id`,
      )
      .bind(slug, federal)
      .first<{ id: number }>()
  }

  function insertMapping(fields: {
    unifiedId: number | null
    relation?: string
    status?: string
    reviewedBy?: string | null
    reviewedAt?: string | null
  }) {
    return db
      .prepare(
        `INSERT INTO unified_mappings (state_id, state_category, unified_id, relation, basis,
                                       confidence, mapped_by, status, reviewed_by, reviewed_at)
         VALUES ('LA', 'SMI', ?, ?, 'state_text', 'high', 'admin', ?, ?, ?) RETURNING id`,
      )
      .bind(
        fields.unifiedId,
        fields.relation ?? 'exact',
        fields.status ?? 'proposed',
        fields.reviewedBy ?? null,
        fields.reviewedAt ?? null,
      )
      .first<{ id: number }>()
  }

  it('fills defaults: draft, version 1, timestamps, empty subcategory', async () => {
    const cat = await insertCategory()
    const row = await db
      .prepare(
        `SELECT status, version, sort_order, created_at, updated_at FROM unified_categories WHERE id = ?`,
      )
      .bind(cat?.id)
      .first<{
        status: string
        version: number
        sort_order: number
        created_at: string
        updated_at: string
      }>()
    expect(row).toMatchObject({ status: 'draft', version: 1, sort_order: 0 })
    expect(row?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(row?.updated_at).toMatch(/Z$/)
    const mapping = await insertMapping({ unifiedId: cat?.id ?? null })
    const m = await db
      .prepare(`SELECT state_subcategory, mapped_at FROM unified_mappings WHERE id = ?`)
      .bind(mapping?.id)
      .first<{ state_subcategory: string; mapped_at: string }>()
    expect(m?.state_subcategory).toBe('')
    expect(m?.mapped_at).toMatch(/Z$/)
  })

  it('keeps slugs unique, lowercase letters, digits and hyphens', async () => {
    await insertCategory('kidney-failure-2')
    await expect(insertCategory('kidney-failure-2')).rejects.toThrow(/UNIQUE constraint failed/)
    for (const slug of ['Kidney-failure', 'kidney failure', 'kidney_failure', 'niñez', ''])
      await expect(insertCategory(slug)).rejects.toThrow(/CHECK constraint failed/)
  })

  it('needs a real federal parent: not "unmapped", not an unknown value', async () => {
    await expect(insertCategory('a', 'unmapped')).rejects.toThrow(/CHECK constraint failed/)
    await expect(insertCategory('b', 'SUD')).rejects.toThrow(/CHECK constraint failed/)
    await insertCategory('c', 'state_specific')
  })

  it('rejects unknown statuses on categories', async () => {
    const cat = await insertCategory()
    await expect(
      db.prepare(`UPDATE unified_categories SET status = 'live' WHERE id = ?`).bind(cat?.id).run(),
    ).rejects.toThrow(/CHECK constraint failed/)
  })

  it('ties by_code to an empty target, and every other relation to a target', async () => {
    const cat = await insertCategory()
    await expect(insertMapping({ unifiedId: cat?.id ?? 0, relation: 'by_code' })).rejects.toThrow(
      /CHECK constraint failed/,
    )
    await expect(insertMapping({ unifiedId: null, relation: 'exact' })).rejects.toThrow(
      /CHECK constraint failed/,
    )
    await insertMapping({ unifiedId: null, relation: 'by_code' })
    await insertMapping({ unifiedId: cat?.id ?? 0, relation: 'broad' })
  })

  it('rejects unknown relations, bases, confidences and statuses on mappings', async () => {
    const cat = await insertCategory()
    const m = await insertMapping({ unifiedId: cat?.id ?? 0 })
    for (const set of [
      `relation = 'same'`,
      `basis = 'ai'`,
      `confidence = 'certain'`,
      `status = 'rejected'`,
    ])
      await expect(
        db.prepare(`UPDATE unified_mappings SET ${set} WHERE id = ?`).bind(m?.id).run(),
      ).rejects.toThrow(/CHECK constraint failed/)
  })

  it('approves a mapping only with a reviewer and a review time', async () => {
    const cat = await insertCategory()
    const id = cat?.id ?? 0
    await expect(insertMapping({ unifiedId: id, status: 'approved' })).rejects.toThrow(
      /CHECK constraint failed/,
    )
    await expect(
      insertMapping({ unifiedId: id, status: 'approved', reviewedBy: 'admin' }),
    ).rejects.toThrow(/CHECK constraint failed/)
    await insertMapping({
      unifiedId: id,
      status: 'approved',
      reviewedBy: 'admin',
      reviewedAt: '2026-11-02T22:00:00.000Z',
    })
  })

  it('links CCSR groups to a category, once each, and checks foreign keys', async () => {
    const cat = await insertCategory()
    const sql = `INSERT INTO unified_ccsr (unified_id, ccsr_category) VALUES (?, ?)`
    await db.prepare(sql).bind(cat?.id, 'MBD001').run()
    await expect(db.prepare(sql).bind(cat?.id, 'MBD001').run()).rejects.toThrow(
      /UNIQUE constraint failed/,
    )
    await expect(db.prepare(sql).bind(999_999, 'MBD002').run()).rejects.toThrow(
      /FOREIGN KEY constraint failed/,
    )
    await expect(insertMapping({ unifiedId: 999_999 })).rejects.toThrow(
      /FOREIGN KEY constraint failed/,
    )
  })

  it('points a superseded mapping at the row that replaced it', async () => {
    const cat = await insertCategory()
    const old = await insertMapping({ unifiedId: cat?.id ?? 0 })
    const next = await insertMapping({ unifiedId: cat?.id ?? 0 })
    await db
      .prepare(`UPDATE unified_mappings SET status = 'superseded', superseded_by = ? WHERE id = ?`)
      .bind(next?.id, old?.id)
      .run()
    await expect(
      db
        .prepare(`UPDATE unified_mappings SET superseded_by = 999999 WHERE id = ?`)
        .bind(old?.id)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/)
  })
  it('places entries in categories once each; a placement goes with its entry', async () => {
    const cat = await insertCategory()
    const { versionId, docId } = await db
      .prepare(
        `SELECT v.id AS versionId, d.id AS docId FROM dataset_versions v, source_documents d`,
      )
      .first<{ versionId: number; docId: number }>()
      .then((r) => r ?? { versionId: 0, docId: 0 })
    const entry = await insertEntry(versionId, docId)
    const sql = `INSERT INTO entry_unified (entry_id, unified_id, basis, reviewed) VALUES (?, ?, ?, ?)`
    await db.prepare(sql).bind(entry?.id, cat?.id, 'mapping', 1).run()
    await expect(db.prepare(sql).bind(entry?.id, cat?.id, 'by_code', 0).run()).rejects.toThrow(
      /UNIQUE constraint failed/,
    )
    const other = await insertCategory('kidney-failure')
    await expect(db.prepare(sql).bind(entry?.id, other?.id, 'none', 0).run()).rejects.toThrow(
      /CHECK constraint failed/,
    )
    await expect(db.prepare(sql).bind(entry?.id, other?.id, 'by_code', 2).run()).rejects.toThrow(
      /CHECK constraint failed/,
    )
    await expect(db.prepare(sql).bind(entry?.id, 999_999, 'by_code', 0).run()).rejects.toThrow(
      /FOREIGN KEY constraint failed/,
    )
    await db.prepare(`DELETE FROM dataset_versions WHERE id = ?`).bind(versionId).run()
    const left = await db.prepare(`SELECT count(*) AS n FROM entry_unified`).first<{ n: number }>()
    expect(left?.n).toBe(0)
  })

  it('stores placements and universes so each row costs one D1 write (WITHOUT ROWID, no extra index)', async () => {
    // A recompute rewrites thousands of rows; every index would add a write per row.
    for (const name of ['entry_unified', 'unified_universe']) {
      const table = await db
        .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
        .bind(name)
        .first<{ sql: string }>()
      expect(table?.sql).toMatch(/WITHOUT ROWID\s*$/)
      const { results } = await db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ?`)
        .bind(name)
        .all<{ name: string }>()
      expect(results).toEqual([])
    }
    const cat = await insertCategory()
    const sql = `INSERT INTO unified_universe (unified_id, code_norm) VALUES (?, ?)`
    await db.prepare(sql).bind(cat?.id, 'F200').run()
    await expect(db.prepare(sql).bind(cat?.id, 'F200').run()).rejects.toThrow(
      /UNIQUE constraint failed/,
    )
  })

  it('stores pair similarity once per pair, one D1 write per row (WITHOUT ROWID, no extra index)', async () => {
    await resetDb(db)
    await seedState('GA')
    await seedState('MT')
    const table = await db
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'state_similarity'`)
      .first<{ sql: string }>()
    expect(table?.sql).toMatch(/WITHOUT ROWID\s*$/)
    const { results } = await db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'state_similarity'`,
      )
      .all<{ name: string }>()
    expect(results).toEqual([])
    const sql = `INSERT INTO state_similarity (state_a, state_b, shared, only_a, only_b, jaccard)
      VALUES (?, ?, ?, ?, ?, ?)`
    await db.prepare(sql).bind('GA', 'MT', 1, 1, 0, 0.5).run()
    // Each pair once, in order; counts and the index in range; both states must exist.
    await expect(db.prepare(sql).bind('MT', 'GA', 1, 1, 0, 0.5).run()).rejects.toThrow(
      /CHECK constraint failed: state_similarity_order_check/,
    )
    await expect(db.prepare(sql).bind('GA', 'GA', 1, 1, 0, 0.5).run()).rejects.toThrow(
      /CHECK constraint failed/,
    )
    await expect(db.prepare(sql).bind('GA', 'NE', 1, 1, 0, 1.5).run()).rejects.toThrow(
      /CHECK constraint failed: state_similarity_counts_check/,
    )
    await expect(db.prepare(sql).bind('GA', 'ZZ', 1, 1, 0, 0.5).run()).rejects.toThrow(
      /FOREIGN KEY constraint failed/,
    )
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

// migrations/0012_ref_codes_fts.sql: the CMS descriptions for code search (roadmap M6 step 1).
describe('ref_codes_fts', () => {
  beforeEach(async () => {
    await resetDb(db)
  })

  function insertRef(
    codeNorm: string,
    description: string,
    validFrom = '2026-10-01',
    system = 'icd10cm',
  ) {
    return db
      .prepare(
        `INSERT OR IGNORE INTO ref_codes (code_system, code_norm, description, valid_from)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(system, codeNorm, description, validFrom)
      .run()
  }

  async function refMatches(query: string): Promise<string[]> {
    const { results } = await db
      .prepare(
        `SELECT code_system || ':' || code_norm || ':' || valid_from AS k FROM ref_codes_fts
         WHERE ref_codes_fts MATCH ? ORDER BY k`,
      )
      .bind(query)
      .all<{ k: string }>()
    return results.map((r) => r.k)
  }

  async function ftsRows(): Promise<number | undefined> {
    const row = await db.prepare(`SELECT count(*) AS n FROM ref_codes_fts`).first<{ n: number }>()
    return row?.n
  }

  it('indexes reference descriptions as rows arrive, once per row', async () => {
    await insertRef('F200', 'Paranoid schizophrenia')
    await insertRef('J1234', 'Injection, test drug, 1 mg', '2026-10-01', 'hcpcs')
    // INSERT OR IGNORE of a row already there (a resumed reference load) adds nothing.
    await insertRef('F200', 'Paranoid schizophrenia')
    expect(await refMatches('description : paranoid')).toEqual(['icd10cm:F200:2026-10-01'])
    expect(await refMatches('description : "schiz"*')).toEqual(['icd10cm:F200:2026-10-01'])
    expect(await refMatches('description : injection')).toEqual(['hcpcs:J1234:2026-10-01'])
    expect(await ftsRows()).toBe(2)
  })

  it("follows updates and deletes of one row, leaving the code's other releases", async () => {
    await insertRef('F200', 'Paranoid schizophrenia')
    await insertRef('F200', 'Paranoid schizophrenia, old text', '2025-10-01')
    await db
      .prepare(
        `UPDATE ref_codes SET description = 'Catatonic schizophrenia'
         WHERE code_norm = 'F200' AND valid_from = '2026-10-01'`,
      )
      .run()
    expect(await refMatches('description : catatonic')).toEqual(['icd10cm:F200:2026-10-01'])
    expect(await refMatches('description : paranoid')).toEqual(['icd10cm:F200:2025-10-01'])

    // valid_to is not indexed: changing it leaves the index alone.
    await db.prepare(`UPDATE ref_codes SET valid_to = '2027-09-30' WHERE code_norm = 'F200'`).run()
    expect(await refMatches('description : schizophrenia')).toHaveLength(2)

    await db
      .prepare(`DELETE FROM ref_codes WHERE code_norm = 'F200' AND valid_from = '2025-10-01'`)
      .run()
    expect(await refMatches('description : schizophrenia')).toEqual(['icd10cm:F200:2026-10-01'])
    await db.prepare(`DELETE FROM ref_codes`).run()
    expect(await refMatches('description : schizophrenia')).toEqual([])
    expect(await ftsRows()).toBe(0)
  })

  it('finds the row to delete through the index, not a scan', async () => {
    const { results } = await db
      .prepare(
        `EXPLAIN QUERY PLAN SELECT rowid FROM ref_codes_fts WHERE rowid IN
           (SELECT rowid FROM ref_codes_fts WHERE code_norm MATCH '"F200"')
           AND code_norm = 'F200'`,
      )
      .all<{ detail: string }>()
    const plan = results.map((r) => r.detail).join('\n')
    expect(plan).toMatch(/VIRTUAL TABLE INDEX 0:M/)
    expect(plan).not.toMatch(/VIRTUAL TABLE INDEX 0:$/m)
  })

  it('passes the FTS integrity check', async () => {
    await insertRef('F200', 'Paranoid schizophrenia')
    await db.prepare(`DELETE FROM ref_codes`).run()
    await insertRef('F25', 'Schizoaffective disorders')
    await db.prepare(`INSERT INTO ref_codes_fts(ref_codes_fts) VALUES ('integrity-check')`).run()
  })
})

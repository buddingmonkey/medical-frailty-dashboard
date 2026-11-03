// A small world for code search (roadmap M6 step 1): CMS rows, three published states, one
// state without a list, and a draft whose codes must never show. Raw SQL, like schema.test.ts.
import { resetDb } from './reset-db'

const REF: [system: string, norm: string, description: string][] = [
  ['icd10cm', 'F20', 'Schizophrenia'],
  ['icd10cm', 'F200', 'Paranoid schizophrenia'],
  ['icd10cm', 'F209', 'Schizophrenia, unspecified'],
  ['icd10cm', 'F25', 'Schizoaffective disorders'],
  ['icd10cm', 'F250', 'Schizoaffective disorder, bipolar type'],
  ['icd10cm', 'J12', 'Viral pneumonia, not elsewhere classified'],
  ['icd10cm', 'J1281', 'Pneumonia due to SARS-associated coronavirus'],
  ['icd10cm', 'N186', 'End stage renal disease'],
  ['hcpcs', 'J1230', 'Injection, methadone hcl, up to 10 mg'],
  ['hcpcs', 'J1234', 'Injection, test drug, 1 mg'],
]

type Entry = [system: string, raw: string, norm: string, description: string | null, kind?: string]

const LISTS: Record<string, Entry[]> = {
  LA: [
    ['icd10cm', 'F20.0', 'F200', 'Paranoid schizophrenia (LA text)'],
    ['cpt', '99213', '99213', 'Office visit, established patient (state text)'],
    ['icd10cm', 'F10', 'F10', 'Alcohol related disorders', 'prefix'],
  ],
  GA: [
    ['icd10cm', 'F20.0', 'F200', null],
    ['hcpcs', 'J1234', 'J1234', 'Test drug injection'],
    ['cpt', '99213', '99213', 'Established patient office visit'],
  ],
  MT: [['icd10cm', 'F20.9', 'F209', 'Schizophrenia, unspecified']],
}

export async function seedSearch(db: D1Database): Promise<void> {
  await resetDb(db)
  const statements: D1PreparedStatement[] = []
  for (const [id, name] of [
    ['GA', 'Georgia'],
    ['LA', 'Louisiana'],
    ['MT', 'Montana'],
    ['NE', 'Nebraska'],
  ]) {
    statements.push(
      db
        .prepare(`INSERT INTO states (id, slug, name, fips, status) VALUES (?, ?, ?, '00', ?)`)
        .bind(id, id?.toLowerCase(), name, id === 'NE' ? 'none' : 'published'),
    )
  }
  for (const [system, norm, description] of REF) {
    statements.push(
      db
        .prepare(
          `INSERT INTO ref_codes (code_system, code_norm, description, valid_from)
           VALUES (?, ?, ?, '2026-10-01')`,
        )
        .bind(system, norm, description),
    )
  }
  // An older CMS text for F20.0 that a later release replaced: the current one must win.
  statements.push(
    db.prepare(
      `INSERT INTO ref_codes (code_system, code_norm, description, valid_from, valid_to)
       VALUES ('icd10cm', 'F200', 'Paranoid schizophrenia (old text)', '2025-10-01', '2026-09-30')`,
    ),
  )
  await db.batch(statements)

  for (const [stateId, list] of Object.entries(LISTS)) {
    const versionId = await addVersion(db, stateId, 1, list)
    await db
      .prepare(`UPDATE states SET published_version_id = ? WHERE id = ?`)
      .bind(versionId, stateId)
      .run()
  }
  // GA's draft lists F25 and Nebraska (no published list) lists F209: neither may show.
  await addVersion(db, 'GA', 2, [['icd10cm', 'F25', 'F25', 'Schizoaffective (draft)']])
  await addVersion(db, 'NE', 1, [['icd10cm', 'F20.9', 'F209', 'Draft only']])
}

async function addVersion(
  db: D1Database,
  stateId: string,
  versionNo: number,
  list: Entry[],
): Promise<number> {
  const doc = await db
    .prepare(
      `INSERT INTO source_documents (state_id, title, file_type, sha256, r2_key, byte_size, uploaded_by)
       VALUES (?, 'List', 'pdf', ?, ?, 1, 'admin') RETURNING id`,
    )
    .bind(
      stateId,
      `sha-${stateId}-${String(versionNo)}`,
      `sources/${stateId}/${String(versionNo)}.pdf`,
    )
    .first<{ id: number }>()
  const version = await db
    .prepare(
      `INSERT INTO dataset_versions (state_id, version_no, created_by) VALUES (?, ?, 'admin') RETURNING id`,
    )
    .bind(stateId, versionNo)
    .first<{ id: number }>()
  if (!doc || !version) throw new Error('seed failed')
  await db.batch(
    list.map(([system, raw, norm, description, kind]) =>
      db
        .prepare(
          `INSERT INTO entries (version_id, source_document_id, code_system, raw_code, code_norm,
                                match_kind, description_published, state_category)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'Test')`,
        )
        .bind(version.id, doc.id, system, raw, norm, kind ?? 'exact', description),
    ),
  )
  return version.id
}

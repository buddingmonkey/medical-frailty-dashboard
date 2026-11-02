// The test pool isolates storage per test file, not per test. Call this in `beforeEach` when a
// test needs empty tables. Order respects foreign keys; deleting entries also clears entries_fts
// through its triggers.
export async function resetDb(db: D1Database): Promise<void> {
  await db.batch(
    [
      'UPDATE states SET published_version_id = NULL',
      'DELETE FROM entries',
      'DELETE FROM version_sources',
      'DELETE FROM dataset_versions',
      'DELETE FROM category_mappings',
      'DELETE FROM source_documents',
      'DELETE FROM watch_items',
      'DELETE FROM condition_members',
      'DELETE FROM condition_groups',
      'DELETE FROM ref_codes',
      'DELETE FROM app_meta',
      'DELETE FROM audit_log',
      'DELETE FROM states',
    ].map((sql) => db.prepare(sql)),
  )
}

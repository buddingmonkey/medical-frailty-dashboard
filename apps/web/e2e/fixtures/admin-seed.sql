-- For the admin e2e tests (playwright.config.ts runs this before the admin Worker starts): a few
-- CCSR groups and ref_ccsr rows (synthetic TST ids, not AHRQ's) and a small published Louisiana
-- list to map to unified categories. Safe to run again: it removes its own rows first (the
-- admin database is kept between runs). Fixed ids 9201. Unified categories made by earlier runs
-- stay; each run names its own.
DELETE FROM unified_mappings WHERE state_id = 'LA';
UPDATE states SET published_version_id = NULL, status = 'none' WHERE id = 'LA';
DELETE FROM entries WHERE version_id = 9201;
DELETE FROM version_sources WHERE version_id = 9201;
DELETE FROM dataset_versions WHERE id = 9201;
DELETE FROM source_documents WHERE id = 9201;

INSERT OR IGNORE INTO ref_ccsr_categories (ccsr_category, description, body_system, release) VALUES
  ('TST001', 'Test group: schizophrenia spectrum', 'Test: mental and behavioral', 'e2e'),
  ('TST002', 'Test group: bipolar disorders', 'Test: mental and behavioral', 'e2e'),
  ('TST101', 'Test group: chronic kidney disease', 'Test: genitourinary', 'e2e');

INSERT OR IGNORE INTO ref_ccsr (code_norm, ccsr_category, is_default, release) VALUES
  ('F20', 'TST001', 1, 'e2e'),
  ('F31', 'TST002', 1, 'e2e'),
  ('N18', 'TST101', 1, 'e2e');

INSERT INTO source_documents
  (id, state_id, title, file_type, sha256, r2_key, byte_size, uploaded_by)
VALUES
  (9201, 'LA', 'E2E Louisiana list', 'pdf',
   '9201000000000000000000000000000000000000000000000000000000000000', 'e2e/la-9201', 1,
   'e2e@localhost');

INSERT INTO dataset_versions
  (id, state_id, version_no, status, created_by, published_by, published_at, content_updated_at, row_count)
VALUES
  (9201, 'LA', 9201, 'published', 'e2e@localhost', 'e2e@localhost', '2026-11-02T12:00:00.000Z',
   '2026-11-02T12:00:00.000Z', 3);

INSERT INTO version_sources (version_id, source_document_id) VALUES (9201, 9201);

INSERT INTO entries
  (version_id, code_system, raw_code, code_norm, match_kind, includes_children, description_published,
   state_category, source_document_id)
VALUES
  (9201, 'icd10cm', 'F20.0', 'F200', 'exact', 0, 'Paranoid schizophrenia', 'Behavioral Health', 9201),
  (9201, 'icd10cm', 'F31.0', 'F310', 'exact', 0, 'Bipolar disorder, current episode hypomanic', 'Behavioral Health', 9201),
  (9201, 'icd10cm', 'N18.6', 'N186', 'exact', 0, 'End stage renal disease', 'Renal', 9201);

UPDATE states SET published_version_id = 9201, status = 'published' WHERE id = 'LA';

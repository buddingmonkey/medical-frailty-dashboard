-- A small published list for the public e2e tests (playwright.config.ts runs this before the
-- Worker starts). Montana, three entries in the shape of its real list (docs/sources.md); the
-- source is DPHHS's real URL. Safe to run again: it removes its own rows first. Fixed ids 9001.
UPDATE states SET published_version_id = NULL, status = 'none' WHERE id = 'MT';
DELETE FROM entries WHERE version_id = 9001;
DELETE FROM version_sources WHERE version_id = 9001;
DELETE FROM dataset_versions WHERE id = 9001;
DELETE FROM source_documents WHERE id = 9001;
DELETE FROM category_mappings WHERE state_id = 'MT';

INSERT INTO source_documents
  (id, state_id, title, url, publisher_date, file_type, sha256, r2_key, byte_size, uploaded_by)
VALUES
  (9001, 'MT', 'DPHHS Medically Frail Condition List',
   'https://dphhs.mt.gov/assets/medicaidchanges/DPHHSMedicallyFrailCodeList_092926.pdf',
   '2026-09-29', 'pdf', '9001000000000000000000000000000000000000000000000000000000000000',
   'e2e/mt-9001', 1, 'e2e@localhost');

INSERT INTO dataset_versions
  (id, state_id, version_no, status, created_by, published_by, published_at, content_updated_at, row_count)
VALUES
  (9001, 'MT', 1, 'published', 'e2e@localhost', 'e2e@localhost', '2026-11-02T12:00:00.000Z',
   '2026-11-02T12:00:00.000Z', 3);

INSERT INTO version_sources (version_id, source_document_id) VALUES (9001, 9001);

INSERT INTO entries
  (version_id, code_system, raw_code, code_norm, match_kind, includes_children, description_published,
   state_category, tier, qualification, qualification_basis, source_document_id, source_locator)
VALUES
  (9001, 'icd10cm', 'F20.0', 'F200', 'exact', 0, 'Paranoid schizophrenia', 'SMI',
   'Tier 1 - DPHHS Approved Condition', 'standalone', 'published', 9001, 'page 6'),
  (9001, 'icd10cm', 'F10.20', 'F1020', 'exact', 0, 'Alcohol dependence, uncomplicated', 'SUD',
   'Tier 1 - DPHHS Approved Condition', 'standalone', 'published', 9001, 'page 7'),
  (9001, 'icd10cm', 'Z99.11', 'Z9911', 'exact', 0, 'Dependence on respirator status', 'Tier 2',
   'Tier 2 - Frailty Indicators', 'unknown', 'published', 9001, 'page 8');

UPDATE states SET published_version_id = 9001, status = 'published' WHERE id = 'MT';

INSERT INTO category_mappings (state_id, state_category, federal_category, method, mapped_by)
VALUES
  ('MT', 'SMI', 'disabling_mental_disorder', 'manual', 'e2e@localhost'),
  ('MT', 'SUD', 'sud', 'manual', 'e2e@localhost');

-- A new data_version each run, so pages cached by an earlier run (miniflare keeps its cache in
-- the persist folder) are never served.
INSERT INTO app_meta (key, value) VALUES ('data_version', '1')
ON CONFLICT (key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT);

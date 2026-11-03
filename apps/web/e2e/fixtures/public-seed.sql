-- Small published lists for the public e2e tests (playwright.config.ts runs this before the
-- Worker starts). Montana, three entries in the shape of its real list (docs/sources.md); the
-- source is DPHHS's real URL. Since M5 step 7 also a synthetic three-entry Nebraska list (fixed
-- ids 9002), so two states can be compared. Safe to run again: it removes its own rows first.
-- Fixed ids 9001 and 9002.
UPDATE states SET published_version_id = NULL, status = 'none' WHERE id IN ('MT', 'NE');
DELETE FROM state_similarity WHERE state_a IN ('MT', 'NE') OR state_b IN ('MT', 'NE');
DELETE FROM entry_unified WHERE unified_id IN (9001, 9002);
DELETE FROM unified_universe WHERE unified_id IN (9001, 9002);
DELETE FROM unified_ccsr WHERE unified_id IN (9001, 9002);
DELETE FROM unified_categories WHERE id IN (9001, 9002);
DELETE FROM entries WHERE version_id IN (9001, 9002);
DELETE FROM version_sources WHERE version_id IN (9001, 9002);
DELETE FROM dataset_versions WHERE id IN (9001, 9002);
DELETE FROM source_documents WHERE id IN (9001, 9002);
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

-- Nebraska (synthetic, M5 step 7): F10.20 under another rule than Montana's, Z99.11 under
-- another rule, and J44.9 that Montana does not list. No placements: the comparison puts
-- J44.9 and Z99.11 in "Not in any comparison category", F10.20 under Montana's "Test alcohol use".
INSERT INTO source_documents
  (id, state_id, title, url, publisher_date, file_type, sha256, r2_key, byte_size, uploaded_by)
VALUES
  (9002, 'NE', 'Synthetic e2e list', NULL, '2026-10-01', 'xlsx',
   '9002000000000000000000000000000000000000000000000000000000000000', 'e2e/ne-9002', 1,
   'e2e@localhost');

INSERT INTO dataset_versions
  (id, state_id, version_no, status, created_by, published_by, published_at, content_updated_at, row_count)
VALUES
  (9002, 'NE', 1, 'published', 'e2e@localhost', 'e2e@localhost', '2026-11-02T12:00:00.000Z',
   '2026-11-02T12:00:00.000Z', 3);

INSERT INTO version_sources (version_id, source_document_id) VALUES (9002, 9002);

INSERT INTO entries
  (version_id, code_system, raw_code, code_norm, match_kind, includes_children, description_published,
   state_category, tier, qualification, qualification_basis, source_document_id, source_locator)
VALUES
  (9002, 'icd10cm', 'F10.20', 'F1020', 'exact', 0, 'Alcohol dependence, uncomplicated', '',
   '', 'needs_support', 'published', 9002, 'row 2'),
  (9002, 'icd10cm', 'Z99.11', 'Z9911', 'exact', 0, 'Dependence on respirator status', '',
   '', 'standalone', 'published', 9002, 'row 3'),
  (9002, 'icd10cm', 'J44.9', 'J449', 'exact', 0, 'Chronic obstructive pulmonary disease', '',
   '', 'standalone', 'published', 9002, 'row 4');

UPDATE states SET published_version_id = 9002, status = 'published' WHERE id = 'NE';

-- Their pair similarity, written directly (the e2e database has no reference codes to expand):
-- Montana {F20.0, F10.20, Z99.11}, Nebraska {F10.20, Z99.11, J44.9}: 2 shared, 1 and 1 only.
INSERT INTO state_similarity (state_a, state_b, shared, only_a, only_b, jaccard)
VALUES ('MT', 'NE', 2, 1, 1, 0.5);

-- Two published unified categories for the overview matrix (M5 step 5), with placements and a
-- universe written directly (the admin routes compute them; here they are fixed). CCSR ids are
-- made up (TST…), never AHRQ data. "Test psychoses" has a 3-code universe: Montana's F20.0
-- covers 1 of 3 (33%), reviewed. "Test alcohol use" has no CCSR group (share over every
-- state's entries): Montana's F10.20 is 1 of 1 (100%), not reviewed. Overall 67%.
INSERT INTO unified_categories
  (id, slug, label, definition, federal_category, status, sort_order, created_by, updated_by)
VALUES
  (9001, 'test-psychoses', 'Test psychoses', 'Synthetic category for the e2e tests.',
   'disabling_mental_disorder', 'published', 1, 'e2e@localhost', 'e2e@localhost'),
  (9002, 'test-alcohol-use', 'Test alcohol use', 'Synthetic category for the e2e tests.',
   'sud', 'published', 1, 'e2e@localhost', 'e2e@localhost');

INSERT INTO unified_ccsr (unified_id, ccsr_category) VALUES (9001, 'TST001');

-- The drill-down (M5 step 6) names the CCSR group: a synthetic one, never AHRQ data.
DELETE FROM ref_ccsr_categories WHERE ccsr_category = 'TST001';
INSERT INTO ref_ccsr_categories (ccsr_category, description, body_system, release)
VALUES ('TST001', 'Test schizophrenia group', 'Test', 'ccsr-dx-test');

INSERT INTO unified_universe (unified_id, code_norm)
VALUES (9001, 'F200'), (9001, 'F201'), (9001, 'F209');

INSERT INTO entry_unified (entry_id, unified_id, basis, reviewed)
SELECT id, 9001, 'mapping', 1 FROM entries WHERE version_id = 9001 AND code_norm = 'F200';
INSERT INTO entry_unified (entry_id, unified_id, basis, reviewed)
SELECT id, 9002, 'by_code', 0 FROM entries WHERE version_id = 9001 AND code_norm = 'F1020';

-- A new data_version each run, so pages cached by an earlier run (miniflare keeps its cache in
-- the persist folder) are never served.
INSERT INTO app_meta (key, value) VALUES ('data_version', '1')
ON CONFLICT (key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT);

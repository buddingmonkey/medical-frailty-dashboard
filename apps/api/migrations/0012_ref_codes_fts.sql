-- Hand-written: drizzle-kit cannot generate virtual tables (docs/data-model.md, "Tables").
-- Full-text index over the CMS reference descriptions (roadmap M6 step 1), so a word search
-- finds codes no state lists. ICD-10-CM and HCPCS only: CPT text reaches search only through
-- entries_fts, from the state's own published description (docs/data-model.md, "Licensing of
-- code text").
--
-- A regular FTS5 table (it keeps its own copy of the text). `ref_codes` is WITHOUT ROWID, so
-- external content (`content_rowid`) is impossible, and a contentless table could not return
-- the code of a match. `code_norm` is indexed so the delete trigger finds its row through the
-- index (`code_norm MATCH`), not by scanning 107k rows; searches filter on `description`.
-- `code_system` and `valid_from` complete the row's key (ref_codes' primary key).
-- Note: `wrangler d1 export` refuses databases with virtual tables (docs/deployment.md).
CREATE VIRTUAL TABLE `ref_codes_fts` USING fts5(
	description,
	code_norm,
	code_system UNINDEXED,
	valid_from UNINDEXED,
	prefix = '2 3'
);
--> statement-breakpoint
CREATE TRIGGER `ref_codes_fts_after_insert` AFTER INSERT ON `ref_codes` BEGIN
	INSERT INTO ref_codes_fts (description, code_norm, code_system, valid_from)
	VALUES (new.description, new.code_norm, new.code_system, new.valid_from);
END;
--> statement-breakpoint
CREATE TRIGGER `ref_codes_fts_after_delete` AFTER DELETE ON `ref_codes` BEGIN
	DELETE FROM ref_codes_fts
	WHERE rowid IN (SELECT rowid FROM ref_codes_fts WHERE code_norm MATCH '"' || replace(old.code_norm, '"', '""') || '"')
		AND code_norm = old.code_norm AND code_system = old.code_system AND valid_from = old.valid_from;
END;
--> statement-breakpoint
CREATE TRIGGER `ref_codes_fts_after_update` AFTER UPDATE OF code_system, code_norm, description, valid_from ON `ref_codes` BEGIN
	DELETE FROM ref_codes_fts
	WHERE rowid IN (SELECT rowid FROM ref_codes_fts WHERE code_norm MATCH '"' || replace(old.code_norm, '"', '""') || '"')
		AND code_norm = old.code_norm AND code_system = old.code_system AND valid_from = old.valid_from;
	INSERT INTO ref_codes_fts (description, code_norm, code_system, valid_from)
	VALUES (new.description, new.code_norm, new.code_system, new.valid_from);
END;
--> statement-breakpoint
-- Backfill: the rows loaded before this migration (107,173 on preview and production).
INSERT INTO ref_codes_fts (description, code_norm, code_system, valid_from)
SELECT description, code_norm, code_system, valid_from FROM ref_codes;

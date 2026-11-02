-- Hand-written: drizzle-kit cannot generate virtual tables (docs/data-model.md, "Tables").
-- Full-text index over entries for code search (roadmap M5). External content: the text lives
-- only in `entries`; the triggers below keep the index in step, including rows removed by the
-- ON DELETE CASCADE from dataset_versions. Prefix indexes make `F20*` style queries cheap.
-- Note: `wrangler d1 export` refuses databases with virtual tables; production backups use
-- D1 Time Travel instead (docs/deployment.md, "Backups").
CREATE VIRTUAL TABLE `entries_fts` USING fts5(
	code_norm,
	raw_code,
	description_published,
	content = 'entries',
	content_rowid = 'id',
	prefix = '2 3 4'
);
--> statement-breakpoint
CREATE TRIGGER `entries_fts_after_insert` AFTER INSERT ON `entries` BEGIN
	INSERT INTO entries_fts (rowid, code_norm, raw_code, description_published)
	VALUES (new.id, new.code_norm, new.raw_code, new.description_published);
END;
--> statement-breakpoint
CREATE TRIGGER `entries_fts_after_delete` AFTER DELETE ON `entries` BEGIN
	INSERT INTO entries_fts (entries_fts, rowid, code_norm, raw_code, description_published)
	VALUES ('delete', old.id, old.code_norm, old.raw_code, old.description_published);
END;
--> statement-breakpoint
CREATE TRIGGER `entries_fts_after_update` AFTER UPDATE OF code_norm, raw_code, description_published ON `entries` BEGIN
	INSERT INTO entries_fts (entries_fts, rowid, code_norm, raw_code, description_published)
	VALUES ('delete', old.id, old.code_norm, old.raw_code, old.description_published);
	INSERT INTO entries_fts (rowid, code_norm, raw_code, description_published)
	VALUES (new.id, new.code_norm, new.raw_code, new.description_published);
END;

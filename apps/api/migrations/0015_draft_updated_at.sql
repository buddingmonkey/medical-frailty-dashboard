-- Last activity on a version, for draft cleanup (M7 step 2). Nullable, no default: SQLite cannot
-- add a column with a non-constant default, and old code that never sets it keeps working;
-- readers use coalesce(updated_at, created_at).
ALTER TABLE `dataset_versions` ADD `updated_at` text;
--> statement-breakpoint
-- Backfill from the audit log (draft.create, draft.source, draft.discard, version.publish carry
-- `version:<id>`), else the created time. Row uploads and check runs were never audited, so an
-- old draft may look a little older than it is; the 30-day window covers that.
UPDATE `dataset_versions`
SET `updated_at` = coalesce(
  (SELECT max(`at`) FROM `audit_log` WHERE `target` = 'version:' || `dataset_versions`.`id`),
  `created_at`
);

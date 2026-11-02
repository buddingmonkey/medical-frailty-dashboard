CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`details_json` text
);
--> statement-breakpoint
CREATE INDEX `audit_log_at_idx` ON `audit_log` (`at`);--> statement-breakpoint
CREATE TABLE `category_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`state_id` text NOT NULL,
	`state_category` text NOT NULL,
	`state_subcategory` text DEFAULT '' NOT NULL,
	`federal_category` text NOT NULL,
	`method` text NOT NULL,
	`confidence` real,
	`mapped_by` text,
	`mapped_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`state_id`) REFERENCES `states`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "category_mappings_federal_check" CHECK("category_mappings"."federal_category" IN ('blind_or_disabled', 'sud', 'disabling_mental_disorder', 'physical_idd_adl', 'serious_complex_medical', 'state_specific', 'unmapped')),
	CONSTRAINT "category_mappings_method_check" CHECK("category_mappings"."method" IN ('auto', 'manual')),
	CONSTRAINT "category_mappings_confidence_check" CHECK("category_mappings"."confidence" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_mappings_state_category_idx` ON `category_mappings` (`state_id`,`state_category`,`state_subcategory`);--> statement-breakpoint
CREATE TABLE `condition_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `condition_groups_slug_unique` ON `condition_groups` (`slug`);--> statement-breakpoint
CREATE TABLE `condition_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL,
	`code_system` text NOT NULL,
	`match_kind` text NOT NULL,
	`code_norm` text NOT NULL,
	`range_end_norm` text,
	FOREIGN KEY (`group_id`) REFERENCES `condition_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "condition_members_code_system_check" CHECK("condition_members"."code_system" IN ('icd10cm', 'icd10pcs', 'cpt', 'hcpcs', 'ndc', 'revenue', 'other')),
	CONSTRAINT "condition_members_match_kind_check" CHECK("condition_members"."match_kind" IN ('exact', 'prefix', 'range')),
	CONSTRAINT "condition_members_range_end_check" CHECK(("condition_members"."match_kind" = 'range') = ("condition_members"."range_end_norm" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `condition_members_group_idx` ON `condition_members` (`group_id`);--> statement-breakpoint
CREATE INDEX `condition_members_code_idx` ON `condition_members` (`code_system`,`code_norm`);--> statement-breakpoint
CREATE TABLE `dataset_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`state_id` text NOT NULL,
	`version_no` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`label` text,
	`effective_date` text,
	`state_published_date` text,
	`content_updated_at` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`published_by` text,
	`published_at` text,
	`check_report_json` text,
	`row_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`state_id`) REFERENCES `states`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "dataset_versions_status_check" CHECK("dataset_versions"."status" IN ('draft', 'published', 'superseded', 'discarded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dataset_versions_state_no_idx` ON `dataset_versions` (`state_id`,`version_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `dataset_versions_one_published_idx` ON `dataset_versions` (`state_id`) WHERE "dataset_versions"."status" = 'published';--> statement-breakpoint
CREATE TABLE `entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version_id` integer NOT NULL,
	`code_system` text NOT NULL,
	`raw_code` text NOT NULL,
	`code_norm` text NOT NULL,
	`match_kind` text DEFAULT 'exact' NOT NULL,
	`range_end_norm` text,
	`includes_children` integer,
	`description_published` text,
	`state_category` text NOT NULL,
	`state_subcategory` text DEFAULT '' NOT NULL,
	`tier` text,
	`attributes_json` text,
	`qualification` text DEFAULT 'unknown' NOT NULL,
	`qualification_basis` text DEFAULT 'published' NOT NULL,
	`source_document_id` integer NOT NULL,
	`source_locator` text,
	FOREIGN KEY (`version_id`) REFERENCES `dataset_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "entries_code_system_check" CHECK("entries"."code_system" IN ('icd10cm', 'icd10pcs', 'cpt', 'hcpcs', 'ndc', 'revenue', 'other')),
	CONSTRAINT "entries_match_kind_check" CHECK("entries"."match_kind" IN ('exact', 'prefix', 'range')),
	CONSTRAINT "entries_range_end_check" CHECK(("entries"."match_kind" = 'range') = ("entries"."range_end_norm" IS NOT NULL)),
	CONSTRAINT "entries_includes_children_check" CHECK("entries"."includes_children" IN (0, 1)),
	CONSTRAINT "entries_qualification_check" CHECK("entries"."qualification" IN ('standalone', 'needs_support', 'supporting_only', 'unknown')),
	CONSTRAINT "entries_qualification_basis_check" CHECK("entries"."qualification_basis" IN ('published', 'inferred'))
);
--> statement-breakpoint
CREATE INDEX `entries_version_code_idx` ON `entries` (`version_id`,`code_norm`);--> statement-breakpoint
CREATE INDEX `entries_code_idx` ON `entries` (`code_norm`);--> statement-breakpoint
CREATE INDEX `entries_version_category_idx` ON `entries` (`version_id`,`state_category`,`state_subcategory`);--> statement-breakpoint
CREATE TABLE `ref_codes` (
	`code_system` text NOT NULL,
	`code_norm` text NOT NULL,
	`description` text NOT NULL,
	`parent_norm` text,
	`chapter` text,
	`valid_from` text NOT NULL,
	`valid_to` text,
	PRIMARY KEY(`code_system`, `code_norm`, `valid_from`),
	CONSTRAINT "ref_codes_code_system_check" CHECK("ref_codes"."code_system" IN ('icd10cm', 'hcpcs'))
);
--> statement-breakpoint
CREATE INDEX `ref_codes_parent_idx` ON `ref_codes` (`code_system`,`parent_norm`);--> statement-breakpoint
CREATE TABLE `source_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`state_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`publisher_date` text,
	`retrieved_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`file_type` text NOT NULL,
	`sha256` text NOT NULL,
	`r2_key` text NOT NULL,
	`byte_size` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	FOREIGN KEY (`state_id`) REFERENCES `states`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_documents_r2_key_unique` ON `source_documents` (`r2_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `source_documents_state_sha256_idx` ON `source_documents` (`state_id`,`sha256`);--> statement-breakpoint
CREATE TABLE `states` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`fips` text NOT NULL,
	`status` text DEFAULT 'none' NOT NULL,
	`published_version_id` integer,
	`notes_md` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`published_version_id`) REFERENCES `dataset_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "states_id_check" CHECK(length("states"."id") = 2 AND "states"."id" = upper("states"."id")),
	CONSTRAINT "states_status_check" CHECK("states"."status" IN ('none', 'announced', 'published'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `states_slug_unique` ON `states` (`slug`);--> statement-breakpoint
CREATE TABLE `version_sources` (
	`version_id` integer NOT NULL,
	`source_document_id` integer NOT NULL,
	PRIMARY KEY(`version_id`, `source_document_id`),
	FOREIGN KEY (`version_id`) REFERENCES `dataset_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `watch_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`state_id` text,
	`due_date` text,
	`date_is_approximate` integer DEFAULT 0 NOT NULL,
	`why_md` text NOT NULL,
	`links_json` text,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution_md` text,
	`resolved_by` text,
	`resolved_at` text,
	`repeat_days` integer,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`state_id`) REFERENCES `states`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "watch_items_kind_check" CHECK("watch_items"."kind" IN ('court', 'federal', 'state_list', 'internal')),
	CONSTRAINT "watch_items_status_check" CHECK("watch_items"."status" IN ('open', 'done', 'dismissed')),
	CONSTRAINT "watch_items_approximate_check" CHECK("watch_items"."date_is_approximate" IN (0, 1)),
	CONSTRAINT "watch_items_repeat_check" CHECK("watch_items"."repeat_days" > 0)
);
--> statement-breakpoint
CREATE INDEX `watch_items_status_due_idx` ON `watch_items` (`status`,`due_date`);
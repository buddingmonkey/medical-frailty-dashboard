CREATE TABLE `unified_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`definition` text NOT NULL,
	`includes` text,
	`excludes` text,
	`federal_category` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "unified_categories_slug_check" CHECK("unified_categories"."slug" <> '' AND "unified_categories"."slug" NOT GLOB '*[^a-z0-9-]*'),
	CONSTRAINT "unified_categories_federal_check" CHECK("unified_categories"."federal_category" IN ('blind_or_disabled', 'sud', 'disabling_mental_disorder', 'physical_idd_adl', 'serious_complex_medical', 'state_specific')),
	CONSTRAINT "unified_categories_status_check" CHECK("unified_categories"."status" IN ('draft', 'published', 'retired')),
	CONSTRAINT "unified_categories_version_check" CHECK("unified_categories"."version" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unified_categories_slug_idx` ON `unified_categories` (`slug`);--> statement-breakpoint
CREATE TABLE `unified_ccsr` (
	`unified_id` integer NOT NULL,
	`ccsr_category` text NOT NULL,
	PRIMARY KEY(`unified_id`, `ccsr_category`),
	FOREIGN KEY (`unified_id`) REFERENCES `unified_categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `unified_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`state_id` text NOT NULL,
	`state_category` text NOT NULL,
	`state_subcategory` text DEFAULT '' NOT NULL,
	`unified_id` integer,
	`relation` text NOT NULL,
	`basis` text NOT NULL,
	`confidence` text NOT NULL,
	`rationale` text,
	`citation` text,
	`mapped_by` text NOT NULL,
	`mapped_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`status` text DEFAULT 'proposed' NOT NULL,
	`superseded_by` integer,
	FOREIGN KEY (`state_id`) REFERENCES `states`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unified_id`) REFERENCES `unified_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`superseded_by`) REFERENCES `unified_mappings`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "unified_mappings_relation_check" CHECK("unified_mappings"."relation" IN ('exact', 'close', 'broad', 'narrow', 'related', 'by_code')),
	CONSTRAINT "unified_mappings_basis_check" CHECK("unified_mappings"."basis" IN ('state_text', 'admin_judgement', 'ccsr_agreement', 'inferred')),
	CONSTRAINT "unified_mappings_confidence_check" CHECK("unified_mappings"."confidence" IN ('high', 'medium', 'low')),
	CONSTRAINT "unified_mappings_status_check" CHECK("unified_mappings"."status" IN ('proposed', 'approved', 'superseded')),
	CONSTRAINT "unified_mappings_by_code_check" CHECK(("unified_mappings"."relation" = 'by_code') = ("unified_mappings"."unified_id" IS NULL)),
	CONSTRAINT "unified_mappings_reviewed_check" CHECK("unified_mappings"."status" <> 'approved' OR ("unified_mappings"."reviewed_by" IS NOT NULL AND "unified_mappings"."reviewed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `unified_mappings_state_category_idx` ON `unified_mappings` (`state_id`,`state_category`,`state_subcategory`,`status`);
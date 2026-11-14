-- Federal categories suggested by code from another state's list (project lead, 2026-11-13;
-- docs/data-model.md, "Federal categories"). One row per entry and suggested law category,
-- deleted with the entry. Public reads seek it by entry_id (the primary key's first column).
CREATE TABLE `entry_federal_suggestions` (
	`entry_id` integer NOT NULL,
	`federal_category` text NOT NULL,
	`level` text NOT NULL,
	`reference_state_id` text NOT NULL,
	`reviewed` integer DEFAULT 0 NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	PRIMARY KEY(`entry_id`, `federal_category`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reference_state_id`) REFERENCES `states`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "entry_federal_suggestions_federal_check" CHECK("entry_federal_suggestions"."federal_category" IN ('blind_or_disabled', 'sud', 'disabling_mental_disorder', 'physical_idd_adl', 'serious_complex_medical')),
	CONSTRAINT "entry_federal_suggestions_level_check" CHECK("entry_federal_suggestions"."level" IN ('exact', 'category3', 'chapter')),
	CONSTRAINT "entry_federal_suggestions_reviewed_check" CHECK("entry_federal_suggestions"."reviewed" IN (0, 1))
);

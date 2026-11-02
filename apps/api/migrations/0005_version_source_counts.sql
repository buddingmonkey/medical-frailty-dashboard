ALTER TABLE `version_sources` ADD `expected_entries` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `version_sources` ADD `invalid_row_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `version_sources` ADD `named_state_ids_json` text DEFAULT '[]' NOT NULL;
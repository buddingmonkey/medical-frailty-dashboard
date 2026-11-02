CREATE TABLE `draft_parts` (
	`version_id` integer NOT NULL,
	`source_document_id` integer NOT NULL,
	`part` text NOT NULL,
	`expected_entries` integer NOT NULL,
	`invalid_row_count` integer NOT NULL,
	`named_state_ids_json` text NOT NULL,
	PRIMARY KEY(`version_id`, `source_document_id`, `part`),
	FOREIGN KEY (`version_id`) REFERENCES `dataset_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `entries` ADD `source_part` text DEFAULT '' NOT NULL;
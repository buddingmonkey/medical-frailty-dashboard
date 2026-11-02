CREATE TABLE `chapter_mappings` (
	`state_id` text NOT NULL,
	`chapter` integer NOT NULL,
	`federal_category` text NOT NULL,
	`mapped_by` text NOT NULL,
	`mapped_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`state_id`, `chapter`),
	FOREIGN KEY (`state_id`) REFERENCES `states`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chapter_mappings_chapter_check" CHECK("chapter_mappings"."chapter" BETWEEN 1 AND 22),
	CONSTRAINT "chapter_mappings_federal_check" CHECK("chapter_mappings"."federal_category" IN ('blind_or_disabled', 'sud', 'disabling_mental_disorder', 'physical_idd_adl', 'serious_complex_medical', 'state_specific', 'unmapped'))
);

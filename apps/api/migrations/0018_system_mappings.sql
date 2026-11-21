-- Federal-category override per code system for a state (project lead, 2026-11-21;
-- docs/data-model.md, "Federal categories", rule 3): every system but ICD-10-CM, which has
-- chapter_mappings, and never "unmapped". Belongs to the state, like chapter_mappings.
CREATE TABLE `system_mappings` (
	`state_id` text NOT NULL,
	`code_system` text NOT NULL,
	`federal_category` text NOT NULL,
	`mapped_by` text NOT NULL,
	`mapped_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`state_id`, `code_system`),
	FOREIGN KEY (`state_id`) REFERENCES `states`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "system_mappings_code_system_check" CHECK("system_mappings"."code_system" IN ('icd10pcs', 'cpt', 'hcpcs', 'ndc', 'revenue', 'drug_class', 'other')),
	CONSTRAINT "system_mappings_federal_check" CHECK("system_mappings"."federal_category" IN ('blind_or_disabled', 'sud', 'disabling_mental_disorder', 'physical_idd_adl', 'serious_complex_medical', 'state_specific'))
);

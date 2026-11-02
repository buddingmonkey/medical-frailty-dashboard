CREATE TABLE `entry_unified` (
	`entry_id` integer NOT NULL,
	`unified_id` integer NOT NULL,
	`basis` text NOT NULL,
	`reviewed` integer NOT NULL,
	PRIMARY KEY(`entry_id`, `unified_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`unified_id`) REFERENCES `unified_categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "entry_unified_basis_check" CHECK("entry_unified"."basis" IN ('mapping', 'by_code')),
	CONSTRAINT "entry_unified_reviewed_check" CHECK("entry_unified"."reviewed" IN (0, 1))
) WITHOUT ROWID;
-- WITHOUT ROWID added by hand (drizzle-kit cannot express it): one D1 write per row, no other
-- index. See the comment on entryUnified in src/db/schema.ts.
--> statement-breakpoint
CREATE TABLE `unified_universe` (
	`unified_id` integer NOT NULL,
	`code_norm` text NOT NULL,
	PRIMARY KEY(`unified_id`, `code_norm`),
	FOREIGN KEY (`unified_id`) REFERENCES `unified_categories`(`id`) ON UPDATE no action ON DELETE cascade
) WITHOUT ROWID;
-- WITHOUT ROWID added by hand, like entry_unified.

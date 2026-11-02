CREATE TABLE `ref_ccsr` (
	`code_norm` text NOT NULL,
	`ccsr_category` text NOT NULL,
	`is_default` integer DEFAULT 0 NOT NULL,
	`release` text NOT NULL,
	PRIMARY KEY(`code_norm`, `ccsr_category`),
	CONSTRAINT "ref_ccsr_is_default_check" CHECK("ref_ccsr"."is_default" IN (0, 1))
) WITHOUT ROWID;
-- WITHOUT ROWID added by hand (drizzle-kit cannot express it): one D1 write per row. See the
-- comment on refCcsr in src/db/schema.ts.
--> statement-breakpoint
CREATE TABLE `ref_ccsr_categories` (
	`ccsr_category` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`body_system` text NOT NULL,
	`release` text NOT NULL
);

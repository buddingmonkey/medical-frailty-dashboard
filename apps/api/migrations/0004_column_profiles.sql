CREATE TABLE `column_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`state_id` text NOT NULL,
	`header_key` text NOT NULL,
	`profile_json` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`state_id`) REFERENCES `states`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `column_profiles_state_header_idx` ON `column_profiles` (`state_id`,`header_key`);
CREATE TABLE `wizard_file` (
	`wizard_id` text NOT NULL,
	`path` text NOT NULL,
	`hash` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`wizard_id`, `path`),
	FOREIGN KEY (`wizard_id`) REFERENCES `wizard`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `run` ADD `files` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `run` ADD `share_token` text;--> statement-breakpoint
ALTER TABLE `run` ADD `shared_at` integer;--> statement-breakpoint
ALTER TABLE `run` ADD `expires_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `run_share_token` ON `run` (`share_token`);--> statement-breakpoint
CREATE INDEX `run_expires` ON `run` (`expires_at`);--> statement-breakpoint
ALTER TABLE `wizard_version` ADD `files` text DEFAULT '[]' NOT NULL;
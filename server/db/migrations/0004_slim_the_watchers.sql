CREATE TABLE `store_file` (
	`wizard_id` text NOT NULL,
	`holder` text NOT NULL,
	`path` text NOT NULL,
	`hash` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`source` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`wizard_id`, `holder`, `path`),
	FOREIGN KEY (`wizard_id`) REFERENCES `wizard`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `store_holder` (
	`wizard_id` text NOT NULL,
	`holder` text NOT NULL,
	`used_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`wizard_id`, `holder`),
	FOREIGN KEY (`wizard_id`) REFERENCES `wizard`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `store_holder_used` ON `store_holder` (`used_at`);--> statement-breakpoint
CREATE TABLE `store_row` (
	`id` text PRIMARY KEY NOT NULL,
	`wizard_id` text NOT NULL,
	`holder` text NOT NULL,
	`list` text NOT NULL,
	`key` text,
	`cells` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`wizard_id`) REFERENCES `wizard`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_row_key` ON `store_row` (`wizard_id`,`holder`,`list`,`key`);--> statement-breakpoint
CREATE INDEX `store_row_list` ON `store_row` (`wizard_id`,`holder`,`list`,`created_at`);--> statement-breakpoint
CREATE TABLE `store_secret` (
	`id` text PRIMARY KEY NOT NULL,
	`wizard_id` text NOT NULL,
	`holder` text NOT NULL,
	`slot` text NOT NULL,
	`provider` text NOT NULL,
	`label` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`wizard_id`) REFERENCES `wizard`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_secret_slot` ON `store_secret` (`wizard_id`,`holder`,`slot`);--> statement-breakpoint
ALTER TABLE `run` ADD `ask` text;
CREATE TABLE `marketplace_file` (
	`item_id` text NOT NULL,
	`path` text NOT NULL,
	`data` blob NOT NULL,
	PRIMARY KEY(`item_id`, `path`),
	FOREIGN KEY (`item_id`) REFERENCES `marketplace_item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `marketplace_item` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`origin` text DEFAULT 'admin' NOT NULL,
	`base_revision` integer,
	`language` text DEFAULT 'de' NOT NULL,
	`avatar` text DEFAULT 'round' NOT NULL,
	`formats` text NOT NULL,
	`industries` text NOT NULL,
	`use_cases` text NOT NULL,
	`capabilities` text NOT NULL,
	`credits` integer,
	`credits_high` integer,
	`position` integer DEFAULT 1000 NOT NULL,
	`installs` integer DEFAULT 0 NOT NULL,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `marketplace_item_updated` ON `marketplace_item` (`updated_at`);--> statement-breakpoint
CREATE TABLE `marketplace_text` (
	`item_id` text NOT NULL,
	`language` text NOT NULL,
	`revision` integer NOT NULL,
	`title` text NOT NULL,
	`pitch` text NOT NULL,
	`definition` text NOT NULL,
	`machine` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`item_id`, `language`),
	FOREIGN KEY (`item_id`) REFERENCES `marketplace_item`(`id`) ON UPDATE no action ON DELETE cascade
);

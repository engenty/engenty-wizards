CREATE TABLE `space_page` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`wizard_id` text,
	`title` text NOT NULL,
	`markdown` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`wizard_id`) REFERENCES `wizard`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `space_page_project` ON `space_page` (`project_id`,`wizard_id`);--> statement-breakpoint
CREATE TABLE `space_table` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`wizard_id` text,
	`list` text,
	`key_column` text,
	`title` text NOT NULL,
	`columns` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`wizard_id`) REFERENCES `wizard`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `space_table_project` ON `space_table` (`project_id`,`wizard_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `space_table_list` ON `space_table` (`wizard_id`,`list`);--> statement-breakpoint
CREATE TABLE `space_table_row` (
	`id` text PRIMARY KEY NOT NULL,
	`table_id` text NOT NULL,
	`key` text,
	`cells` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`table_id`) REFERENCES `space_table`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `space_table_row_table` ON `space_table_row` (`table_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `space_table_row_key` ON `space_table_row` (`table_id`,`key`);
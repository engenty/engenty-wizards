CREATE TABLE `plugin_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin` text NOT NULL,
	`project_id` text NOT NULL,
	`connector` text NOT NULL,
	`label` text NOT NULL,
	`actions` text NOT NULL,
	`data` text NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plugin_connection_space` ON `plugin_connection` (`plugin`,`project_id`);
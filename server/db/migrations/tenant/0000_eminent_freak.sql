CREATE TABLE `asset` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`run_id` text,
	`step_id` text,
	`kind` text NOT NULL,
	`mime` text NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `asset_run` ON `asset` (`run_id`);--> statement-breakpoint
CREATE TABLE `project` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`brand` text DEFAULT '{}' NOT NULL,
	`mcp_servers` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `project_tenant` ON `project` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `project_connector` (
	`project_id` text NOT NULL,
	`id` text NOT NULL,
	`record` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`project_id`, `id`),
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `run` (
	`id` text PRIMARY KEY NOT NULL,
	`wizard_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`definition` text NOT NULL,
	`files` text DEFAULT '[]' NOT NULL,
	`version` integer,
	`mode` text NOT NULL,
	`visitor_id` text,
	`user_id` text,
	`ip_hash` text,
	`status` text NOT NULL,
	`cursor` text,
	`state` text NOT NULL,
	`error` text,
	`ask` text,
	`cost_micros` integer DEFAULT 0 NOT NULL,
	`share_token` text,
	`shared_at` integer,
	`expires_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`wizard_id`) REFERENCES `wizard`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `run_share_token` ON `run` (`share_token`);--> statement-breakpoint
CREATE INDEX `run_expires` ON `run` (`expires_at`);--> statement-breakpoint
CREATE INDEX `run_wizard` ON `run` (`wizard_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `run_visitor` ON `run` (`visitor_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `run_status` ON `run` (`status`);--> statement-breakpoint
CREATE TABLE `run_cost` (
	`run_id` text NOT NULL,
	`step_id` text NOT NULL,
	`micros` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`run_id`, `step_id`),
	FOREIGN KEY (`run_id`) REFERENCES `run`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `run_event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`step_id` text,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `run`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `run_event_run` ON `run_event` (`run_id`,`id`);--> statement-breakpoint
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
CREATE TABLE `wizard` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`title` text NOT NULL,
	`draft` text NOT NULL,
	`published_version` integer,
	`share_token` text NOT NULL,
	`share_enabled` integer DEFAULT true NOT NULL,
	`daily_run_limit` integer DEFAULT 50 NOT NULL,
	`starter` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wizard_share_token` ON `wizard` (`share_token`);--> statement-breakpoint
CREATE INDEX `wizard_project` ON `wizard` (`project_id`);--> statement-breakpoint
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
CREATE TABLE `wizard_message` (
	`id` text PRIMARY KEY NOT NULL,
	`wizard_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`changed` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'studio' NOT NULL,
	`client` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`wizard_id`) REFERENCES `wizard`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `wizard_message_wizard` ON `wizard_message` (`wizard_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `wizard_version` (
	`id` text PRIMARY KEY NOT NULL,
	`wizard_id` text NOT NULL,
	`version` integer NOT NULL,
	`definition` text NOT NULL,
	`files` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`wizard_id`) REFERENCES `wizard`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wizard_version_n` ON `wizard_version` (`wizard_id`,`version`);
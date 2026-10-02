CREATE TABLE `link` (
	`token` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`kind` text NOT NULL,
	`ref` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `link_tenant` ON `link` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `run_index` (
	`run_id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`visitor_id` text,
	`ip_hash` text,
	`active` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `run_index_visitor` ON `run_index` (`visitor_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `run_index_ip` ON `run_index` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `run_index_active` ON `run_index` (`active`,`tenant_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`role` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`image` text,
	`refresh_token` text,
	`claims_expire_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `session_expires` ON `session` (`expires_at`);--> statement-breakpoint
CREATE TABLE `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tenant` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`db_url` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);

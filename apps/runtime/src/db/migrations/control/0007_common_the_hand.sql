CREATE TABLE `plugin_address` (
	`ref` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`plugin` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_address_tenant` ON `plugin_address` (`tenant_id`,`plugin`);--> statement-breakpoint
CREATE TABLE `plugin_job` (
	`tenant_id` text NOT NULL,
	`plugin` text NOT NULL,
	`name` text NOT NULL,
	`last_run_at` integer NOT NULL,
	PRIMARY KEY(`tenant_id`, `plugin`, `name`)
);

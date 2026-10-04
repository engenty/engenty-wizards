CREATE TABLE `marketplace_star` (
	`tenant_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`tenant_id`, `entry_id`)
);

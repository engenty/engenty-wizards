CREATE TABLE `marketplace_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`entry` text NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);

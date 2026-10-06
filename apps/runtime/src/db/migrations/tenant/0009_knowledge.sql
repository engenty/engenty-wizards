CREATE TABLE `space_category` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`unit` text,
	`multiple` integer DEFAULT false NOT NULL,
	`ordered` integer DEFAULT false NOT NULL,
	`hint` text,
	`origin` text,
	`proposed` integer DEFAULT false NOT NULL,
	`table_id` text,
	`column_id` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`table_id`) REFERENCES `space_table`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `space_category_name` ON `space_category` (`project_id`,`name`);--> statement-breakpoint
CREATE TABLE `space_category_value` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`value` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`summary` text,
	`summary_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `space_category`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `space_category_value_value` ON `space_category_value` (`category_id`,`value`);--> statement-breakpoint
CREATE TABLE `space_item_category` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`category_id` text NOT NULL,
	`page_id` text,
	`row_id` text,
	`table_id` text,
	`file_id` text,
	`value_id` text,
	`text` text,
	`num` real,
	`at` integer,
	`bool` integer,
	`by` text DEFAULT 'person' NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `space_category`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `space_page`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`row_id`) REFERENCES `space_table_row`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`table_id`) REFERENCES `space_table`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `project_file`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`value_id`) REFERENCES `space_category_value`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `space_item_category_category` ON `space_item_category` (`category_id`,`value_id`);--> statement-breakpoint
CREATE INDEX `space_item_category_page` ON `space_item_category` (`page_id`);--> statement-breakpoint
CREATE INDEX `space_item_category_row` ON `space_item_category` (`row_id`);--> statement-breakpoint
CREATE INDEX `space_item_category_table` ON `space_item_category` (`table_id`);--> statement-breakpoint
CREATE INDEX `space_item_category_file` ON `space_item_category` (`file_id`);--> statement-breakpoint
ALTER TABLE `project_chunk` ADD `page_id` text REFERENCES space_page(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `project_chunk` ADD `row_id` text REFERENCES space_table_row(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `project_chunk` ADD `table_id` text REFERENCES space_table(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `project_chunk` ADD `value_id` text REFERENCES space_category_value(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `project_chunk` ADD `heading` text;--> statement-breakpoint
ALTER TABLE `project_chunk` ADD `sheet` integer;--> statement-breakpoint
CREATE INDEX `project_chunk_page` ON `project_chunk` (`page_id`);--> statement-breakpoint
CREATE INDEX `project_chunk_row` ON `project_chunk` (`row_id`);--> statement-breakpoint
CREATE INDEX `project_chunk_table` ON `project_chunk` (`table_id`);--> statement-breakpoint
CREATE INDEX `project_chunk_value` ON `project_chunk` (`value_id`);--> statement-breakpoint
ALTER TABLE `project_file` ADD `origin` text;--> statement-breakpoint
ALTER TABLE `project_file` ADD `origin_key` text;--> statement-breakpoint
ALTER TABLE `project_file` ADD `origin_label` text;--> statement-breakpoint
CREATE UNIQUE INDEX `project_file_origin` ON `project_file` (`project_id`,`origin`,`origin_key`);--> statement-breakpoint
ALTER TABLE `space_page` ADD `parent_id` text REFERENCES space_page(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `space_page` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `space_page` ADD `slug` text;--> statement-breakpoint
ALTER TABLE `space_page` ADD `origin` text;--> statement-breakpoint
ALTER TABLE `space_page` ADD `origin_key` text;--> statement-breakpoint
ALTER TABLE `space_page` ADD `origin_label` text;--> statement-breakpoint
ALTER TABLE `space_page` ADD `kept` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `space_page` ADD `review` text;--> statement-breakpoint
ALTER TABLE `space_page` ADD `file_id` text REFERENCES project_file(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `space_page_parent` ON `space_page` (`parent_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `space_page_origin` ON `space_page` (`project_id`,`origin`,`origin_key`);--> statement-breakpoint
ALTER TABLE `space_table` ADD `slug` text;--> statement-breakpoint
ALTER TABLE `space_table` ADD `format` text;--> statement-breakpoint
ALTER TABLE `space_table` ADD `origin` text;--> statement-breakpoint
ALTER TABLE `space_table` ADD `origin_key` text;--> statement-breakpoint
ALTER TABLE `space_table` ADD `origin_label` text;--> statement-breakpoint
ALTER TABLE `space_table` ADD `kept` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `space_table` ADD `review` text;--> statement-breakpoint
ALTER TABLE `space_table` ADD `file_id` text REFERENCES project_file(id) ON DELETE set null;--> statement-breakpoint
CREATE UNIQUE INDEX `space_table_origin` ON `space_table` (`project_id`,`origin`,`origin_key`);--> statement-breakpoint
CREATE VIRTUAL TABLE `project_chunk_tri` USING fts5(`text`, content='project_chunk', content_rowid='id', tokenize='trigram remove_diacritics 1');--> statement-breakpoint
INSERT INTO `project_chunk_tri`(`project_chunk_tri`) VALUES ('rebuild');--> statement-breakpoint
CREATE TRIGGER `project_chunk_tri_ai` AFTER INSERT ON `project_chunk` BEGIN
	INSERT INTO `project_chunk_tri`(rowid, `text`) VALUES (new.id, new.text);
END;--> statement-breakpoint
CREATE TRIGGER `project_chunk_tri_ad` AFTER DELETE ON `project_chunk` BEGIN
	INSERT INTO `project_chunk_tri`(`project_chunk_tri`, rowid, `text`) VALUES ('delete', old.id, old.text);
END;

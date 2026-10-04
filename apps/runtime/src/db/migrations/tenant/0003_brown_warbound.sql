CREATE TABLE `project_chunk` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`file_id` text NOT NULL,
	`idx` integer NOT NULL,
	`text` text NOT NULL,
	`embedding` blob,
	`model` text,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `project_file`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_chunk_project` ON `project_chunk` (`project_id`,`model`);--> statement-breakpoint
CREATE INDEX `project_chunk_file` ON `project_chunk` (`file_id`);--> statement-breakpoint
CREATE TABLE `project_file` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`source` text,
	`position` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`error` text,
	`text_hash` text,
	`pages` integer,
	`chars` integer,
	`indexed` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_file_project` ON `project_file` (`project_id`,`kind`,`position`);--> statement-breakpoint
ALTER TABLE `project` ADD `facts` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE VIRTUAL TABLE `project_chunk_fts` USING fts5(`text`, content='project_chunk', content_rowid='id', tokenize='unicode61 remove_diacritics 2');--> statement-breakpoint
CREATE TRIGGER `project_chunk_ai` AFTER INSERT ON `project_chunk` BEGIN
	INSERT INTO `project_chunk_fts`(rowid, `text`) VALUES (new.id, new.text);
END;--> statement-breakpoint
CREATE TRIGGER `project_chunk_ad` AFTER DELETE ON `project_chunk` BEGIN
	INSERT INTO `project_chunk_fts`(`project_chunk_fts`, rowid, `text`) VALUES ('delete', old.id, old.text);
END;--> statement-breakpoint
INSERT INTO `project_file` (`id`, `project_id`, `kind`, `name`, `mime`, `size`)
	SELECT a.`id`, p.`id`, 'logo', a.`name`, a.`mime`, a.`size`
	FROM `project` p JOIN `asset` a ON a.`id` = json_extract(p.`brand`, '$.logoAssetId');--> statement-breakpoint
UPDATE `project` SET `brand` = json_set(`brand`, '$.colors', json_array(json_object('name', 'Akzent', 'value', json_extract(`brand`, '$.accent'))))
	WHERE coalesce(json_extract(`brand`, '$.accent'), '') != '';--> statement-breakpoint
UPDATE `project` SET `brand` = json_set(`brand`, '$.about', json_extract(`brand`, '$.details'))
	WHERE coalesce(json_extract(`brand`, '$.details'), '') != '';--> statement-breakpoint
UPDATE `project` SET `brand` = json_remove(`brand`, '$.details', '$.accent', '$.logoAssetId');

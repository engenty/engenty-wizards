PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_project_chunk` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`file_id` text,
	`plugin` text,
	`ref` text,
	`title` text,
	`link` text,
	`idx` integer NOT NULL,
	`text` text NOT NULL,
	`embedding` blob,
	`model` text,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `project_file`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_project_chunk`("id", "project_id", "file_id", "idx", "text", "embedding", "model") SELECT "id", "project_id", "file_id", "idx", "text", "embedding", "model" FROM `project_chunk`;--> statement-breakpoint
DROP TABLE `project_chunk`;--> statement-breakpoint
ALTER TABLE `__new_project_chunk` RENAME TO `project_chunk`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `project_chunk_project` ON `project_chunk` (`project_id`,`model`);--> statement-breakpoint
CREATE INDEX `project_chunk_file` ON `project_chunk` (`file_id`);--> statement-breakpoint
CREATE INDEX `project_chunk_ref` ON `project_chunk` (`project_id`,`plugin`,`ref`);--> statement-breakpoint
CREATE TRIGGER `project_chunk_ai` AFTER INSERT ON `project_chunk` BEGIN
	INSERT INTO `project_chunk_fts`(rowid, `text`) VALUES (new.id, new.text);
END;--> statement-breakpoint
CREATE TRIGGER `project_chunk_ad` AFTER DELETE ON `project_chunk` BEGIN
	INSERT INTO `project_chunk_fts`(`project_chunk_fts`, rowid, `text`) VALUES ('delete', old.id, old.text);
END;

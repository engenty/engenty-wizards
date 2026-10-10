CREATE TABLE `assistant_chat` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text,
	`summary` text,
	`folded` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`closed_at` integer
);
--> statement-breakpoint
CREATE INDEX `assistant_chat_user` ON `assistant_chat` (`tenant_id`,`user_id`,`closed_at`);--> statement-breakpoint
CREATE TABLE `assistant_message` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`cards` text,
	`tool_calls` text,
	`page` text,
	`changed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `assistant_chat`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assistant_message_chat` ON `assistant_message` (`chat_id`,`created_at`);--> statement-breakpoint
CREATE VIRTUAL TABLE `assistant_search` USING fts5(`chat_id` UNINDEXED, `message_id` UNINDEXED, `text`, tokenize='trigram remove_diacritics 1');--> statement-breakpoint
CREATE TRIGGER `assistant_message_search_ai` AFTER INSERT ON `assistant_message` BEGIN
	INSERT INTO `assistant_search`(`chat_id`, `message_id`, `text`) VALUES (new.chat_id, new.id, new.content);
END;--> statement-breakpoint
CREATE TRIGGER `assistant_message_search_ad` AFTER DELETE ON `assistant_message` BEGIN
	DELETE FROM `assistant_search` WHERE `message_id` = old.id;
END;--> statement-breakpoint
CREATE TRIGGER `assistant_chat_search_au` AFTER UPDATE OF `title`, `summary`, `closed_at` ON `assistant_chat` WHEN new.closed_at IS NOT NULL BEGIN
	DELETE FROM `assistant_search` WHERE `chat_id` = new.id AND `message_id` IS NULL;
	INSERT INTO `assistant_search`(`chat_id`, `message_id`, `text`) VALUES (new.id, NULL, coalesce(new.title, '') || char(10) || coalesce(new.summary, ''));
END;--> statement-breakpoint
CREATE TRIGGER `assistant_chat_search_ad` AFTER DELETE ON `assistant_chat` BEGIN
	DELETE FROM `assistant_search` WHERE `chat_id` = old.id AND `message_id` IS NULL;
END;

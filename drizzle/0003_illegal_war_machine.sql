ALTER TABLE `platforms` ADD `icon_storage_path` text;--> statement-breakpoint
ALTER TABLE `platforms` ADD `sort_order` integer DEFAULT 0 NOT NULL;
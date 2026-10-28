ALTER TABLE `contents` ADD `account_id` integer REFERENCES short_video_accounts(id);--> statement-breakpoint
ALTER TABLE `contents` ADD `remark` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_contents_account` ON `contents` (`account_id`);
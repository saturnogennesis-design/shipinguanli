ALTER TABLE `contents` ADD `featured` integer DEFAULT 0 NOT NULL;
ALTER TABLE `contents` ADD `featured_reason` text DEFAULT '' NOT NULL;
ALTER TABLE `contents` ADD `featured_tags_json` text DEFAULT '[]' NOT NULL;
ALTER TABLE `contents` ADD `featured_by_user_id` integer REFERENCES `users`(`id`);
ALTER TABLE `contents` ADD `featured_at` text;
CREATE INDEX `idx_contents_featured` ON `contents` (`featured`,`featured_at`);

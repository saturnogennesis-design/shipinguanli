ALTER TABLE `work_report_cc` ADD COLUMN `remark` text NOT NULL DEFAULT '';
CREATE TABLE `work_report_hidden` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`report_id` integer NOT NULL REFERENCES `work_reports`(`id`),`user_id` integer NOT NULL REFERENCES `users`(`id`),`hidden_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX `idx_work_report_hidden_unique` ON `work_report_hidden` (`report_id`,`user_id`);
CREATE INDEX `idx_work_report_hidden_user` ON `work_report_hidden` (`user_id`);

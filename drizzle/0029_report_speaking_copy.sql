ALTER TABLE `work_reports` ADD COLUMN `template_code` text NOT NULL DEFAULT 'RPT-DAILY';
ALTER TABLE `work_reports` ADD COLUMN `product_master_id` integer REFERENCES `product_masters`(`id`);
CREATE INDEX IF NOT EXISTS `idx_work_reports_template` ON `work_reports` (`template_code`);
CREATE TABLE IF NOT EXISTS `work_report_activity_logs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `report_id` integer NOT NULL REFERENCES `work_reports`(`id`),
  `user_id` integer NOT NULL REFERENCES `users`(`id`),
  `action` text NOT NULL,
  `details_json` text NOT NULL DEFAULT '{}',
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS `idx_work_report_activity_report` ON `work_report_activity_logs` (`report_id`,`created_at`);

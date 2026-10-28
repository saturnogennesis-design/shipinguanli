CREATE TABLE IF NOT EXISTS `work_report_attachments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `report_id` integer NOT NULL REFERENCES `work_reports`(`id`),
  `file_name` text NOT NULL,
  `mime_type` text NOT NULL,
  `file_size` integer NOT NULL,
  `storage_path` text NOT NULL,
  `uploaded_by_user_id` integer NOT NULL REFERENCES `users`(`id`),
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS `idx_work_report_attachments_report` ON `work_report_attachments` (`report_id`,`created_at`);

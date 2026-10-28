CREATE TABLE `work_reports` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `code` text NOT NULL,
  `report_date` text NOT NULL,
  `title` text NOT NULL DEFAULT '日报',
  `completed` text NOT NULL DEFAULT '',
  `plan` text NOT NULL DEFAULT '',
  `remark` text NOT NULL DEFAULT '',
  `submitter_user_id` integer NOT NULL REFERENCES `users`(`id`),
  `recipient_user_id` integer REFERENCES `users`(`id`),
  `status` text NOT NULL DEFAULT 'draft',
  `submitted_at` text,
  `last_edited_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `copied_from_id` integer,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX `idx_work_reports_code` ON `work_reports` (`code`);
CREATE INDEX `idx_work_reports_submitter_date` ON `work_reports` (`submitter_user_id`,`report_date`);
CREATE INDEX `idx_work_reports_recipient_status` ON `work_reports` (`recipient_user_id`,`status`);
CREATE TABLE `work_report_cc` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`report_id` integer NOT NULL REFERENCES `work_reports`(`id`),`user_id` integer NOT NULL REFERENCES `users`(`id`),`read_at` text,`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX `idx_work_report_cc_unique` ON `work_report_cc` (`report_id`,`user_id`);
CREATE INDEX `idx_work_report_cc_user` ON `work_report_cc` (`user_id`,`read_at`);
CREATE TABLE `work_report_recipient_reads` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`report_id` integer NOT NULL REFERENCES `work_reports`(`id`),`user_id` integer NOT NULL REFERENCES `users`(`id`),`read_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX `idx_work_report_recipient_read_unique` ON `work_report_recipient_reads` (`report_id`,`user_id`);

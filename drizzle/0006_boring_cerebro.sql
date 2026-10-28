CREATE TABLE `user_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_sessions_token_hash` ON `user_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_user_sessions_user_expiry` ON `user_sessions` (`user_id`,`expires_at`);--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `result` text DEFAULT 'success' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_audit_logs_created_result` ON `audit_logs` (`created_at`,`result`);--> statement-breakpoint
ALTER TABLE `content_versions` ADD `upload_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `content_versions` ADD `checksum_sha256` text;--> statement-breakpoint
CREATE INDEX `idx_content_versions_upload_status` ON `content_versions` (`upload_status`);--> statement-breakpoint
ALTER TABLE `users` ADD `must_change_password` integer DEFAULT true NOT NULL;
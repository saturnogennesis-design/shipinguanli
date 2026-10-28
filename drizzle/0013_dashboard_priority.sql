ALTER TABLE `contents` ADD `business_activity_at` text;
--> statement-breakpoint
ALTER TABLE `contents` ADD `review_submitted_at` text;
--> statement-breakpoint
UPDATE `contents`
SET `business_activity_at` = COALESCE(`updated_at`, `created_at`),
    `review_submitted_at` = CASE
      WHEN `review_status` IN ('pending', 'reviewing') THEN COALESCE(`updated_at`, `created_at`)
      ELSE NULL
    END;
--> statement-breakpoint
CREATE INDEX `idx_contents_activity` ON `contents` (`business_activity_at`);
--> statement-breakpoint
CREATE INDEX `idx_contents_review_submitted` ON `contents` (`review_status`,`review_submitted_at`);

PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_platform_contents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_content_id` integer NOT NULL,
	`platform_id` integer NOT NULL,
	`account_id` integer,
	`product_id` integer,
	`publish_owner_user_id` integer,
	`publish_status` text DEFAULT 'pending' NOT NULL,
	`published_at` text,
	`deleted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`platform_id`) REFERENCES `platforms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `short_video_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`publish_owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_platform_contents`("id", "source_content_id", "platform_id", "account_id", "product_id", "publish_owner_user_id", "publish_status", "published_at", "deleted_at", "created_at", "updated_at") SELECT "id", "source_content_id", "platform_id", "account_id", "product_id", "publish_owner_user_id", "publish_status", "published_at", "deleted_at", "created_at", "updated_at" FROM `platform_contents`;--> statement-breakpoint
DROP TABLE `platform_contents`;--> statement-breakpoint
ALTER TABLE `__new_platform_contents` RENAME TO `platform_contents`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_platform_contents_source_platform` ON `platform_contents` (`source_content_id`,`platform_id`);--> statement-breakpoint
CREATE INDEX `idx_platform_contents_account_product` ON `platform_contents` (`account_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `idx_platform_contents_publish_status` ON `platform_contents` (`publish_status`);
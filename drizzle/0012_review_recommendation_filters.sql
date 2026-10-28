ALTER TABLE `review_queue_items` ADD `draft_recommended` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `reviews` ADD `recommended` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `reviews` ADD `recommendation_removed_at` text;
--> statement-breakpoint
ALTER TABLE `reviews` ADD `recommendation_removed_by_user_id` integer REFERENCES users(id);
--> statement-breakpoint
CREATE INDEX `idx_reviews_recommended` ON `reviews` (`recommended`,`created_at`);
--> statement-breakpoint
CREATE TABLE `publication_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform_content_id` integer NOT NULL,
	`event_type` text NOT NULL,
	`operator_user_id` integer NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`platform_content_id`) REFERENCES `platform_contents`(`id`),
	FOREIGN KEY (`operator_user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_publication_events_content_time` ON `publication_events` (`platform_content_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `saved_filters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`module_key` text NOT NULL,
	`name` text NOT NULL,
	`conditions_json` text DEFAULT '[]' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`is_shared` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_saved_filters_user_module_name` ON `saved_filters` (`user_id`,`module_key`,`name`);
--> statement-breakpoint
CREATE INDEX `idx_saved_filters_module_shared` ON `saved_filters` (`module_key`,`is_shared`);
--> statement-breakpoint
CREATE TABLE `list_filter_fields` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`module_key` text NOT NULL,
	`field_key` text NOT NULL,
	`label` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_list_filter_fields_module_field` ON `list_filter_fields` (`module_key`,`field_key`);
--> statement-breakpoint
CREATE INDEX `idx_list_filter_fields_module_order` ON `list_filter_fields` (`module_key`,`sort_order`);

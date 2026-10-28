ALTER TABLE `content_groups` ADD `department_id` integer REFERENCES departments(id);
ALTER TABLE `content_groups` ADD `cover_path` text;
ALTER TABLE `content_groups` ADD `theme_color` text NOT NULL DEFAULT '#6f86ad';
ALTER TABLE `content_groups` ADD `description` text NOT NULL DEFAULT '';
ALTER TABLE `content_groups` ADD `business_direction` text NOT NULL DEFAULT '';
ALTER TABLE `content_groups` ADD `status` text NOT NULL DEFAULT 'active';
ALTER TABLE `content_groups` ADD `leader_user_id` integer REFERENCES users(id);
ALTER TABLE `content_groups` ADD `settings_json` text NOT NULL DEFAULT '{}';
ALTER TABLE `content_groups` ADD `archived_at` text;
CREATE INDEX `idx_content_groups_department` ON `content_groups` (`department_id`,`status`);
INSERT INTO `content_groups` (`code`,`name`,`description`,`status`)
SELECT 'legacy_default','未分组','升级前内容的默认归属组','active'
WHERE NOT EXISTS (SELECT 1 FROM `content_groups`);
UPDATE `contents` SET `group_id`=(SELECT `id` FROM `content_groups` ORDER BY `id` LIMIT 1) WHERE `group_id` IS NULL;
ALTER TABLE `users` ADD `primary_group_id` integer REFERENCES content_groups(id);
UPDATE `users` SET `primary_group_id`=(SELECT `id` FROM `content_groups` ORDER BY `id` LIMIT 1) WHERE `primary_group_id` IS NULL;
CREATE TABLE `group_memberships` (
 `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
 `group_id` integer NOT NULL REFERENCES content_groups(id),
 `user_id` integer NOT NULL REFERENCES users(id),
 `is_primary` integer NOT NULL DEFAULT 0,
 `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX `idx_group_membership_unique` ON `group_memberships` (`group_id`,`user_id`);
CREATE INDEX `idx_group_membership_user` ON `group_memberships` (`user_id`,`is_primary`);
INSERT OR IGNORE INTO `group_memberships` (`group_id`,`user_id`,`is_primary`)
SELECT `primary_group_id`,`id`,1 FROM `users` WHERE `primary_group_id` IS NOT NULL;
CREATE TABLE `user_group_scopes` (
 `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
 `user_id` integer NOT NULL REFERENCES users(id),
 `group_id` integer NOT NULL REFERENCES content_groups(id),
 `scope_type` text NOT NULL,
 `granted_by_user_id` integer REFERENCES users(id),
 `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX `idx_user_group_scope_unique` ON `user_group_scopes` (`user_id`,`group_id`,`scope_type`);
CREATE INDEX `idx_user_group_scope_lookup` ON `user_group_scopes` (`user_id`,`scope_type`);
INSERT OR IGNORE INTO `user_group_scopes` (`user_id`,`group_id`,`scope_type`)
SELECT `id`,`primary_group_id`,'upload' FROM `users` WHERE `primary_group_id` IS NOT NULL;
ALTER TABLE `content_versions` ADD `review_status` text NOT NULL DEFAULT 'draft';
ALTER TABLE `content_versions` ADD `review_submitted_at` text;
ALTER TABLE `content_versions` ADD `business_activity_at` text;
ALTER TABLE `content_versions` ADD `superseded_at` text;
ALTER TABLE `content_versions` ADD `source_purged_at` text;
UPDATE `content_versions`
SET `review_status`=CASE WHEN `version_number`=(SELECT `latest_version_number` FROM `contents` WHERE `contents`.`id`=`content_versions`.`content_id`)
 THEN (SELECT `review_status` FROM `contents` WHERE `contents`.`id`=`content_versions`.`content_id`) ELSE 'rejected' END,
 `review_submitted_at`=CASE WHEN `version_number`=(SELECT `latest_version_number` FROM `contents` WHERE `contents`.`id`=`content_versions`.`content_id`)
 THEN (SELECT `review_submitted_at` FROM `contents` WHERE `contents`.`id`=`content_versions`.`content_id`) ELSE NULL END,
 `business_activity_at`=COALESCE(`updated_at`,`created_at`),
 `superseded_at`=CASE WHEN `version_number`<(SELECT `latest_version_number` FROM `contents` WHERE `contents`.`id`=`content_versions`.`content_id`) THEN COALESCE(`updated_at`,`created_at`) ELSE NULL END;
CREATE INDEX `idx_content_versions_review_status` ON `content_versions` (`review_status`,`review_submitted_at`);
ALTER TABLE `platform_contents` ADD `version_id` integer REFERENCES content_versions(id);
UPDATE `platform_contents` SET `version_id`=(SELECT `id` FROM `content_versions` WHERE `content_versions`.`content_id`=`platform_contents`.`source_content_id` ORDER BY `version_number` DESC LIMIT 1) WHERE `version_id` IS NULL;
CREATE INDEX `idx_platform_contents_version` ON `platform_contents` (`version_id`);

-- Backfill the account from the content group for legacy content that predates
-- the mandatory group-to-account relationship.
UPDATE contents
SET account_id = (
  SELECT content_groups.account_id
  FROM content_groups
  WHERE content_groups.id = contents.group_id
)
WHERE account_id IS NULL
  AND group_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM content_groups
    WHERE content_groups.id = contents.group_id
      AND content_groups.account_id IS NOT NULL
  );
--> statement-breakpoint

-- Repair older publishing rows that were created before account ownership was
-- stored on publishing records.
UPDATE platform_contents
SET account_id = (
  SELECT contents.account_id
  FROM contents
  WHERE contents.id = platform_contents.source_content_id
)
WHERE account_id IS NULL
  AND EXISTS (
    SELECT 1 FROM contents
    WHERE contents.id = platform_contents.source_content_id
      AND contents.account_id IS NOT NULL
  );
--> statement-breakpoint

-- Approved legacy content may never have received a publishing row. Create the
-- missing pending item for the platform owned by its short-video account.
INSERT OR IGNORE INTO platform_contents (
  source_content_id,
  version_id,
  platform_id,
  account_id,
  product_id,
  publish_status,
  created_at,
  updated_at
)
SELECT
  contents.id,
  content_versions.id,
  short_video_accounts.platform_id,
  contents.account_id,
  contents.product_id,
  'pending',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM contents
JOIN short_video_accounts ON short_video_accounts.id = contents.account_id
JOIN content_versions
  ON content_versions.content_id = contents.id
 AND content_versions.version_number = contents.latest_version_number
 AND content_versions.upload_status = 'complete'
 AND content_versions.deleted_at IS NULL
WHERE contents.review_status = 'approved'
  AND contents.account_id IS NOT NULL
  AND contents.archived_at IS NULL
  AND contents.deleted_at IS NULL;

ALTER TABLE content_groups ADD COLUMN account_id INTEGER REFERENCES short_video_accounts(id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_content_groups_account ON content_groups(account_id, status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS user_account_responsibilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  account_id INTEGER NOT NULL REFERENCES short_video_accounts(id),
  responsibility_type TEXT NOT NULL,
  granted_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_account_responsibility_unique ON user_account_responsibilities(user_id, account_id, responsibility_type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_user_account_responsibility_lookup ON user_account_responsibilities(user_id, responsibility_type);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS user_group_responsibilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  group_id INTEGER NOT NULL REFERENCES content_groups(id),
  responsibility_type TEXT NOT NULL,
  granted_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_group_responsibility_unique ON user_group_responsibilities(user_id, group_id, responsibility_type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_user_group_responsibility_lookup ON user_group_responsibilities(user_id, responsibility_type);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS product_masters (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  name TEXT NOT NULL,
  image_storage_path TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_product_masters_status_name ON product_masters(status, name);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS material_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  product_master_id INTEGER REFERENCES product_masters(id),
  account_id INTEGER REFERENCES short_video_accounts(id),
  uploader_user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'draft',
  rejection_reason TEXT NOT NULL DEFAULT '',
  resubmission_note TEXT NOT NULL DEFAULT '',
  submitted_at TEXT,
  reviewed_at TEXT,
  reviewer_user_id INTEGER REFERENCES users(id),
  archived_at TEXT,
  archived_by_user_id INTEGER REFERENCES users(id),
  legacy_material_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_material_sets_code ON material_sets(code);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_material_sets_legacy ON material_sets(legacy_material_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_material_sets_account_status ON material_sets(account_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_material_sets_product ON material_sets(product_master_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS material_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  set_id INTEGER NOT NULL REFERENCES material_sets(id),
  position INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  duration_seconds INTEGER,
  upload_status TEXT NOT NULL DEFAULT 'pending',
  checksum_sha256 TEXT,
  cover_path TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_material_files_position ON material_files(set_id, position);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_material_files_status ON material_files(set_id, upload_status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS material_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  set_id INTEGER NOT NULL REFERENCES material_sets(id),
  reviewer_user_id INTEGER NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  resubmission_note TEXT NOT NULL DEFAULT '',
  changes_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_material_reviews_set_time ON material_reviews(set_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS material_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  set_id INTEGER NOT NULL REFERENCES material_sets(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_material_claim_unique ON material_claims(set_id, user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_material_claim_user ON material_claims(user_id, released_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS material_downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  set_id INTEGER NOT NULL REFERENCES material_sets(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  file_count INTEGER NOT NULL DEFAULT 0,
  total_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_material_downloads_set_time ON material_downloads(set_id, created_at);
--> statement-breakpoint
ALTER TABLE platform_contents ADD COLUMN handler_user_id INTEGER REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE platform_contents ADD COLUMN handling_started_at TEXT;
--> statement-breakpoint
ALTER TABLE platform_contents ADD COLUMN row_version INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_platform_contents_handler ON platform_contents(handler_user_id, publish_status);
--> statement-breakpoint
UPDATE content_groups
SET account_id = (
  SELECT MIN(c.account_id) FROM contents c
  WHERE c.group_id = content_groups.id AND c.account_id IS NOT NULL
)
WHERE account_id IS NULL
  AND 1 = (
    SELECT COUNT(DISTINCT c.account_id) FROM contents c
    WHERE c.group_id = content_groups.id AND c.account_id IS NOT NULL
  );
--> statement-breakpoint
INSERT OR IGNORE INTO material_sets (
  code, title, description, uploader_user_id, status, legacy_material_id, created_at, updated_at
)
SELECT 'LEGACY-' || printf('%06d', id), title, description, owner_user_id,
       'needs_classification', id, created_at, updated_at
FROM materials;
--> statement-breakpoint
INSERT OR IGNORE INTO material_files (
  set_id, position, file_name, storage_path, mime_type, file_size, upload_status, created_at, updated_at
)
SELECT ms.id, 1, m.file_name, m.storage_path, m.mime_type, m.file_size, m.upload_status, m.created_at, m.updated_at
FROM materials m JOIN material_sets ms ON ms.legacy_material_id = m.id;
--> statement-breakpoint
INSERT OR IGNORE INTO user_account_responsibilities (user_id, account_id, responsibility_type)
SELECT u.id, a.id, 'material'
FROM users u JOIN roles r ON r.id=u.role_id CROSS JOIN short_video_accounts a
WHERE u.status='active' AND a.status='active' AND json_valid(r.permissions_json)
  AND EXISTS (SELECT 1 FROM json_each(r.permissions_json) WHERE value IN ('*','asset.view','asset.upload'));
--> statement-breakpoint
INSERT OR IGNORE INTO user_account_responsibilities (user_id, account_id, responsibility_type)
SELECT u.id, a.id, 'publisher'
FROM users u JOIN roles r ON r.id=u.role_id CROSS JOIN short_video_accounts a
WHERE u.status='active' AND a.status='active' AND json_valid(r.permissions_json)
  AND EXISTS (SELECT 1 FROM json_each(r.permissions_json) WHERE value IN ('*','publish','publishing.view','publishing.assign','publishing.status'));

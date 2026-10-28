ALTER TABLE content_version_files ADD COLUMN draft_edit_token TEXT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_content_version_files_draft_edit ON content_version_files(version_id, draft_edit_token);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value_text TEXT NOT NULL DEFAULT '',
  updated_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
UPDATE content_groups SET name = '内容一组', updated_at = CURRENT_TIMESTAMP WHERE name IS NULL OR trim(name) = '';

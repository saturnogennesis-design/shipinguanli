ALTER TABLE contents ADD COLUMN archived_at TEXT;
ALTER TABLE contents ADD COLUMN archive_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE contents ADD COLUMN archived_by_user_id INTEGER;
ALTER TABLE users ADD COLUMN content_color TEXT;
ALTER TABLE content_versions ADD COLUMN cover_path TEXT;
ALTER TABLE saved_filters ADD COLUMN view_json TEXT NOT NULL DEFAULT '{}';
CREATE INDEX idx_contents_archive_status ON contents(archived_at, review_status);

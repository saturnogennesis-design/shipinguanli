ALTER TABLE notices ADD COLUMN requires_reply INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE notices ADD COLUMN publish_status TEXT NOT NULL DEFAULT 'published';
--> statement-breakpoint
CREATE TABLE notice_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notice_id INTEGER NOT NULL REFERENCES notices(id),
  position INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  upload_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(notice_id, position)
);
--> statement-breakpoint
CREATE INDEX idx_notice_attachment_notice ON notice_attachments(notice_id, upload_status);

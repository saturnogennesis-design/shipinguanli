ALTER TABLE material_sets ADD COLUMN deleted_at TEXT;
--> statement-breakpoint
ALTER TABLE material_sets ADD COLUMN deleted_by_user_id INTEGER REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE material_files ADD COLUMN draft_edit_token TEXT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_material_sets_deleted ON material_sets(deleted_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_material_files_draft_edit ON material_files(set_id, draft_edit_token);
--> statement-breakpoint
CREATE TABLE material_set_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  set_id INTEGER NOT NULL REFERENCES material_sets(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  viewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_material_set_view_unique ON material_set_views(set_id, user_id);
--> statement-breakpoint
CREATE INDEX idx_material_set_view_user ON material_set_views(user_id, viewed_at);

ALTER TABLE cross_records ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'active' CHECK(lifecycle IN ('active','archived','deleted'));
ALTER TABLE cross_records ADD COLUMN previous_lifecycle TEXT NOT NULL DEFAULT 'active';
CREATE TABLE project_user_permissions (
 project_id INTEGER NOT NULL REFERENCES short_video_accounts(id),
 user_id INTEGER NOT NULL REFERENCES users(id),
 permissions_json TEXT NOT NULL DEFAULT '[]',
 revision INTEGER NOT NULL DEFAULT 1,
 updated_by INTEGER NOT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(project_id,user_id)
);

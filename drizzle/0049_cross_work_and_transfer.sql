ALTER TABLE cross_records ADD COLUMN task_urgency INTEGER NOT NULL DEFAULT 0;
CREATE TABLE cross_publications (
 record_id INTEGER PRIMARY KEY REFERENCES cross_records(id),
 version_number INTEGER NOT NULL,
 publisher_id INTEGER NOT NULL REFERENCES users(id),
 published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 active INTEGER NOT NULL DEFAULT 1,
 request_key TEXT UNIQUE
);
CREATE TABLE transfer_packages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 project_id INTEGER NOT NULL REFERENCES short_video_accounts(id),
 title TEXT NOT NULL,
 creator_id INTEGER NOT NULL REFERENCES users(id),
 lifecycle TEXT NOT NULL DEFAULT 'active',
 previous_lifecycle TEXT NOT NULL DEFAULT 'active',
 revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE transfer_files (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 package_id INTEGER NOT NULL REFERENCES transfer_packages(id),
 storage_path TEXT NOT NULL UNIQUE,
 file_name TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 file_size INTEGER NOT NULL,
 uploader_id INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX transfer_project ON transfer_packages(project_id,lifecycle);
ALTER TABLE cross_publications ADD COLUMN group_signature TEXT NOT NULL DEFAULT '';
CREATE TABLE cross_delivery_intents (
 token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, project_id INTEGER NOT NULL,
 record_id INTEGER NOT NULL, revision INTEGER NOT NULL, group_download INTEGER NOT NULL,
 mark_publish INTEGER NOT NULL, request_key TEXT NOT NULL, expires INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX cross_work_parent ON cross_records(parent_id,project_id,lifecycle,status);
CREATE INDEX cross_work_main ON cross_records(main_id,project_id,lifecycle,status);
CREATE INDEX cross_work_maker ON cross_records(project_id,maker_id,lifecycle);

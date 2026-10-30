ALTER TABLE short_video_accounts ADD COLUMN project_type TEXT NOT NULL DEFAULT 'short_video' CHECK(project_type IN ('short_video','cross_border'));
CREATE TABLE cross_records (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 project_id INTEGER NOT NULL REFERENCES short_video_accounts(id),
 kind TEXT NOT NULL CHECK(kind IN ('clue','mother','package')),
 parent_id INTEGER REFERENCES cross_records(id),
 title TEXT NOT NULL,
 body_json TEXT NOT NULL DEFAULT '{}',
 creator_id INTEGER NOT NULL REFERENCES users(id),
 maker_id INTEGER NOT NULL REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','approved','rejected')),
 revision INTEGER NOT NULL DEFAULT 1,
 version_number INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK((kind='clue' AND parent_id IS NULL) OR (kind IN ('mother','package') AND parent_id IS NOT NULL))
);
CREATE INDEX idx_cross_records_scope ON cross_records(project_id,kind,status,id);
CREATE INDEX idx_cross_records_parent ON cross_records(parent_id);
CREATE TABLE cross_files (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 record_id INTEGER NOT NULL REFERENCES cross_records(id),
 storage_path TEXT NOT NULL UNIQUE,
 file_name TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 file_size INTEGER NOT NULL,
 active INTEGER NOT NULL DEFAULT 1,
 uploader_id INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE cross_versions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 record_id INTEGER NOT NULL REFERENCES cross_records(id),
 version_number INTEGER NOT NULL,
 snapshot_json TEXT NOT NULL,
 submitter_id INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(record_id,version_number)
);
CREATE TABLE cross_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 record_id INTEGER NOT NULL REFERENCES cross_records(id),
 actor_id INTEGER NOT NULL REFERENCES users(id),
 action TEXT NOT NULL,
 version_number INTEGER NOT NULL,
 details_json TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_cross_events_record ON cross_events(record_id,id);
CREATE TRIGGER cross_versions_no_update BEFORE UPDATE ON cross_versions BEGIN SELECT RAISE(ABORT,'Historical versions are immutable'); END;
CREATE TRIGGER cross_versions_no_delete BEFORE DELETE ON cross_versions BEGIN SELECT RAISE(ABORT,'Historical versions are immutable'); END;
CREATE TRIGGER cross_events_no_update BEFORE UPDATE ON cross_events BEGIN SELECT RAISE(ABORT,'System events are immutable'); END;
CREATE TRIGGER cross_events_no_delete BEFORE DELETE ON cross_events BEGIN SELECT RAISE(ABORT,'System events are immutable'); END;

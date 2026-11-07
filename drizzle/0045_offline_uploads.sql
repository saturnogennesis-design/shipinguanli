-- Additive staging only: existing content, files and review state are untouched.
CREATE TABLE offline_uploads (
 user_id INTEGER NOT NULL REFERENCES users(id), task_id TEXT NOT NULL,
 project_id INTEGER NOT NULL REFERENCES short_video_accounts(id), payload_json TEXT NOT NULL,
 result_json TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,task_id)
);
CREATE TABLE offline_upload_chunks (
 user_id INTEGER NOT NULL, task_id TEXT NOT NULL, file_index INTEGER NOT NULL,
 part_index INTEGER NOT NULL, sha256 TEXT NOT NULL, byte_size INTEGER NOT NULL,
 storage_key TEXT NOT NULL, PRIMARY KEY(user_id,task_id,file_index,part_index),
 FOREIGN KEY(user_id,task_id) REFERENCES offline_uploads(user_id,task_id)
);
CREATE TABLE offline_server_identity(id INTEGER PRIMARY KEY CHECK(id=1),server_id TEXT NOT NULL);
INSERT INTO offline_server_identity VALUES(1,lower(hex(randomblob(24))));

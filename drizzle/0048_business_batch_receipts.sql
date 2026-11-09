CREATE TABLE business_batch_receipts(
 user_id INTEGER NOT NULL REFERENCES users(id),
 project_id INTEGER NOT NULL REFERENCES short_video_accounts(id),
 request_key TEXT NOT NULL,
 kind TEXT NOT NULL,
 record_id INTEGER NOT NULL,
 signature TEXT NOT NULL,
 result_json TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,project_id,request_key,kind,record_id)
);
CREATE INDEX idx_cross_notes_unread ON cross_notes(record_id,id,author_id);
CREATE TABLE cross_note_reads(
 user_id INTEGER NOT NULL REFERENCES users(id),
 project_id INTEGER NOT NULL REFERENCES short_video_accounts(id),
 record_id INTEGER NOT NULL,
 note_id INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,project_id,record_id)
);
-- Existing remarks form the initial baseline; only later remarks produce new reminders.
INSERT INTO cross_note_reads(user_id,project_id,record_id,note_id)
 SELECT v.user_id,r.project_id,r.id,max(n.id)
 FROM project_visibility v JOIN cross_records r ON r.project_id=v.project_id
 JOIN cross_notes n ON n.record_id=r.id GROUP BY v.user_id,r.project_id,r.id;
CREATE TABLE business_download_tickets(
 token_hash TEXT PRIMARY KEY,
 session_hash TEXT NOT NULL,
 user_id INTEGER NOT NULL REFERENCES users(id),
 project_id INTEGER NOT NULL REFERENCES short_video_accounts(id),
 kind TEXT NOT NULL,
 keys_json TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 used INTEGER NOT NULL DEFAULT 0
);

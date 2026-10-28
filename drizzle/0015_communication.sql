CREATE TABLE materials (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 owner_user_id INTEGER NOT NULL REFERENCES users(id), audience_json TEXT NOT NULL,
 downloadable INTEGER NOT NULL DEFAULT 0, file_name TEXT NOT NULL, mime_type TEXT NOT NULL,
 file_size INTEGER NOT NULL, storage_path TEXT NOT NULL, upload_status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_materials_owner ON materials(owner_user_id,created_at);
CREATE TABLE notices (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL,
 author_user_id INTEGER NOT NULL REFERENCES users(id), material_ids_json TEXT NOT NULL DEFAULT '[]',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE notice_receipts (
 id INTEGER PRIMARY KEY AUTOINCREMENT, notice_id INTEGER NOT NULL REFERENCES notices(id),
 user_id INTEGER NOT NULL REFERENCES users(id), read_at TEXT,
 UNIQUE(notice_id,user_id)
);
CREATE INDEX idx_notice_receipts_user ON notice_receipts(user_id,read_at);
CREATE TABLE notice_replies (
 id INTEGER PRIMARY KEY AUTOINCREMENT, notice_id INTEGER NOT NULL REFERENCES notices(id),
 user_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Persist the same deterministic neutral color previously computed by the UI.
UPDATE users SET content_color = CASE (
 WITH RECURSIVE chars(pos,h) AS (
 SELECT 1,0 UNION ALL SELECT pos+1,((h*31)+unicode(substr(CAST(users.id AS TEXT),pos,1))) % 4294967296
 FROM chars WHERE pos<=length(CAST(users.id AS TEXT))
 ) SELECT h % 8 FROM chars ORDER BY pos DESC LIMIT 1
) WHEN 0 THEN '#edf1fa' WHEN 1 THEN '#f0edfa' WHEN 2 THEN '#eaf2f8' WHEN 3 THEN '#f2eef6'
 WHEN 4 THEN '#eceff5' WHEN 5 THEN '#eaf3f5' WHEN 6 THEN '#f0f0fa' ELSE '#edf0f7' END
WHERE content_color IS NULL OR content_color = '';
-- Existing employees may read targeted notices/materials. Publishing remains explicitly granted.
UPDATE roles SET permissions_json=json_insert(permissions_json,'$[#]','asset.view')
 WHERE json_valid(permissions_json) AND NOT EXISTS (SELECT 1 FROM json_each(roles.permissions_json) WHERE value IN ('*','asset.view'));
UPDATE roles SET permissions_json=json_insert(permissions_json,'$[#]','notice.view')
 WHERE json_valid(permissions_json) AND NOT EXISTS (SELECT 1 FROM json_each(roles.permissions_json) WHERE value IN ('*','notice.view'));
UPDATE roles SET permissions_json=json_insert(permissions_json,'$[#]','asset.upload')
 WHERE json_valid(permissions_json) AND EXISTS (SELECT 1 FROM json_each(roles.permissions_json) WHERE value='content.upload')
 AND NOT EXISTS (SELECT 1 FROM json_each(roles.permissions_json) WHERE value IN ('*','asset.upload'));

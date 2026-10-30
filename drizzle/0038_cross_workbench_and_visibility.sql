PRAGMA defer_foreign_keys=ON;
DROP TRIGGER cross_versions_no_update; DROP TRIGGER cross_versions_no_delete; DROP TRIGGER cross_events_no_update; DROP TRIGGER cross_events_no_delete;
ALTER TABLE cross_files RENAME TO cross_files_old;
ALTER TABLE cross_versions RENAME TO cross_versions_old;
ALTER TABLE cross_events RENAME TO cross_events_old;
ALTER TABLE cross_records RENAME TO cross_records_old;
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
 CHECK((kind='clue' AND parent_id IS NULL) OR kind='mother' OR (kind='package' AND parent_id IS NOT NULL))
);


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

INSERT INTO cross_records SELECT * FROM cross_records_old;
INSERT INTO cross_files SELECT * FROM cross_files_old;
INSERT INTO cross_versions SELECT * FROM cross_versions_old;
INSERT INTO cross_events SELECT * FROM cross_events_old;
DROP TABLE cross_events_old; DROP TABLE cross_versions_old; DROP TABLE cross_files_old; DROP TABLE cross_records_old;
CREATE INDEX idx_cross_records_scope ON cross_records(project_id,kind,status,id);
CREATE INDEX idx_cross_records_parent ON cross_records(parent_id);
CREATE INDEX idx_cross_events_record ON cross_events(record_id,id);
ALTER TABLE cross_records ADD COLUMN main_id INTEGER REFERENCES cross_records(id);
ALTER TABLE cross_records ADD COLUMN package_type TEXT NOT NULL DEFAULT 'main';
ALTER TABLE cross_records ADD COLUMN product_category_id INTEGER REFERENCES cross_product_categories(id);
ALTER TABLE cross_records ADD COLUMN copied_from_id INTEGER REFERENCES cross_records(id);
ALTER TABLE cross_records ADD COLUMN cover_file_id INTEGER REFERENCES cross_files(id);
ALTER TABLE cross_files ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cross_files ADD COLUMN shared_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE cross_files ADD COLUMN cover_path TEXT;
UPDATE cross_files SET position=id;
CREATE TABLE cross_product_categories(id INTEGER PRIMARY KEY AUTOINCREMENT,project_id INTEGER NOT NULL REFERENCES short_video_accounts(id),name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',sort_order INTEGER NOT NULL DEFAULT 0,UNIQUE(project_id,name));
CREATE TABLE cross_business_types(id INTEGER PRIMARY KEY AUTOINCREMENT,project_id INTEGER NOT NULL REFERENCES short_video_accounts(id),code TEXT NOT NULL,name TEXT NOT NULL,media_type TEXT NOT NULL,requires_main INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'active',UNIQUE(project_id,code));
INSERT INTO cross_business_types(project_id,code,name,media_type,requires_main) SELECT id,'main','产品主图','image',0 FROM short_video_accounts WHERE project_type='cross_border';
INSERT INTO cross_business_types(project_id,code,name,media_type) SELECT id,'video','视频','video' FROM short_video_accounts WHERE project_type='cross_border';
INSERT INTO cross_business_types(project_id,code,name,media_type) SELECT id,'document','文档','document' FROM short_video_accounts WHERE project_type='cross_border';
CREATE TRIGGER cross_types_protect_main BEFORE UPDATE ON cross_business_types WHEN OLD.code='main' BEGIN SELECT RAISE(ABORT,'产品主图为固定分类'); END;
CREATE TRIGGER cross_types_no_delete_main BEFORE DELETE ON cross_business_types WHEN OLD.code='main' BEGIN SELECT RAISE(ABORT,'产品主图为固定分类'); END;
CREATE TABLE cross_notes(id INTEGER PRIMARY KEY AUTOINCREMENT,record_id INTEGER NOT NULL REFERENCES cross_records(id),author_id INTEGER REFERENCES users(id),body TEXT NOT NULL,legacy_source TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_cross_notes_record ON cross_notes(record_id,id);
INSERT INTO cross_notes(record_id,author_id,body,created_at,legacy_source)
SELECT id,NULL,'历史备注：'||CASE WHEN kind IN ('clue','mother') THEN trim(coalesce(json_extract(body_json,'$.facts'),'')||char(10)||coalesce(json_extract(body_json,'$.description'),'')) ELSE coalesce(json_extract(body_json,'$.remark'),'') END,CURRENT_TIMESTAMP,'record_fields'
FROM cross_records WHERE json_valid(body_json) AND ((kind IN ('clue','mother') AND (coalesce(json_extract(body_json,'$.facts'),'')<>'' OR coalesce(json_extract(body_json,'$.description'),'')<>'')) OR (kind='package' AND coalesce(json_extract(body_json,'$.remark'),'')<>''));
INSERT INTO cross_notes(record_id,author_id,body,created_at) SELECT record_id,submitter_id,'历史提交备注：'||json_extract(snapshot_json,'$.submitNote'),created_at FROM cross_versions WHERE json_valid(snapshot_json) AND coalesce(json_extract(snapshot_json,'$.submitNote'),'')<>'';
CREATE TRIGGER cross_notes_no_update BEFORE UPDATE ON cross_notes BEGIN SELECT RAISE(ABORT,'备注提交后不可修改'); END;
CREATE TRIGGER cross_notes_no_delete BEFORE DELETE ON cross_notes BEGIN SELECT RAISE(ABORT,'备注提交后不可删除'); END;
CREATE TABLE project_visibility(project_id INTEGER NOT NULL REFERENCES short_video_accounts(id),user_id INTEGER NOT NULL REFERENCES users(id),granted_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(project_id,user_id));
CREATE TABLE project_master(id INTEGER PRIMARY KEY CHECK(id=1),user_id INTEGER NOT NULL UNIQUE REFERENCES users(id));
INSERT INTO project_master(id,user_id) SELECT 1,id FROM users WHERE username='hjt' LIMIT 1;
CREATE TRIGGER master_identity_validate BEFORE INSERT ON project_master WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND username='hjt') BEGIN SELECT RAISE(ABORT,'主账号必须为hjt'); END;
CREATE TRIGGER master_identity_lock BEFORE UPDATE ON project_master BEGIN SELECT RAISE(ABORT,'主账号不可替换'); END;
CREATE TRIGGER master_identity_delete BEFORE DELETE ON project_master BEGIN SELECT RAISE(ABORT,'主账号不可删除'); END;
CREATE TRIGGER master_user_lock BEFORE UPDATE ON users WHEN OLD.id IN(SELECT user_id FROM project_master) AND (NEW.username<>'hjt' OR NEW.status<>'active') BEGIN SELECT RAISE(ABORT,'hjt账号不可改名或停用'); END;
CREATE TRIGGER master_user_delete BEFORE DELETE ON users WHEN OLD.id IN(SELECT user_id FROM project_master) BEGIN SELECT RAISE(ABORT,'hjt账号不可删除'); END;
CREATE TRIGGER cross_versions_no_update BEFORE UPDATE ON cross_versions BEGIN SELECT RAISE(ABORT,'Historical versions are immutable'); END;
CREATE TRIGGER cross_versions_no_delete BEFORE DELETE ON cross_versions BEGIN SELECT RAISE(ABORT,'Historical versions are immutable'); END;
CREATE TRIGGER cross_events_no_update BEFORE UPDATE ON cross_events BEGIN SELECT RAISE(ABORT,'System events are immutable'); END;
CREATE TRIGGER cross_events_no_delete BEFORE DELETE ON cross_events BEGIN SELECT RAISE(ABORT,'System events are immutable'); END;

ALTER TABLE cross_records ADD COLUMN create_key TEXT;
CREATE UNIQUE INDEX idx_cross_create_key ON cross_records(create_key) WHERE create_key IS NOT NULL;
ALTER TABLE cross_notes ADD COLUMN request_key TEXT;
CREATE UNIQUE INDEX idx_cross_note_request ON cross_notes(record_id,request_key) WHERE request_key IS NOT NULL;
CREATE TABLE cross_copy_notes(record_id INTEGER PRIMARY KEY REFERENCES cross_records(id),source_record_id INTEGER NOT NULL REFERENCES cross_records(id),notes_json TEXT NOT NULL);
CREATE TRIGGER cross_copy_notes_lock BEFORE UPDATE ON cross_copy_notes BEGIN SELECT RAISE(ABORT,'来源备注不可修改'); END;
CREATE TRIGGER cross_copy_notes_delete BEFORE DELETE ON cross_copy_notes BEGIN SELECT RAISE(ABORT,'来源备注不可删除'); END;

CREATE UNIQUE INDEX idx_cross_type_name ON cross_business_types(project_id,name);

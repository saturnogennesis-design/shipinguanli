-- Keep legacy table/column names for existing content relationships; accounts now mean projects.
INSERT OR IGNORE INTO platforms(code,name,status,sort_order) VALUES('__project_internal__','内部兼容记录','inactive',9999);
INSERT INTO short_video_accounts(platform_id,code,name,status)
SELECT id,'shile','十乐','active' FROM platforms WHERE code='__project_internal__'
AND NOT EXISTS(SELECT 1 FROM short_video_accounts);
UPDATE short_video_accounts SET name='十乐',status='active' WHERE id=(SELECT min(id) FROM short_video_accounts);
UPDATE content_groups SET account_id=(SELECT min(id) FROM short_video_accounts);
UPDATE contents SET account_id=(SELECT min(id) FROM short_video_accounts);
UPDATE material_sets SET account_id=(SELECT min(id) FROM short_video_accounts);
INSERT OR IGNORE INTO user_account_responsibilities(user_id,account_id,responsibility_type,granted_by_user_id)
SELECT user_id,(SELECT min(id) FROM short_video_accounts),responsibility_type,granted_by_user_id FROM user_account_responsibilities;
DELETE FROM user_account_responsibilities WHERE account_id<>(SELECT min(id) FROM short_video_accounts);
UPDATE short_video_accounts SET status='inactive' WHERE id<>(SELECT min(id) FROM short_video_accounts);
UPDATE short_video_accounts SET platform_id=(SELECT id FROM platforms WHERE code='__project_internal__');

ALTER TABLE product_masters ADD COLUMN project_id integer REFERENCES short_video_accounts(id);
UPDATE product_masters SET project_id=(SELECT min(id) FROM short_video_accounts);
CREATE INDEX idx_product_masters_project ON product_masters(project_id,status);
CREATE TABLE content_categories(
 id integer PRIMARY KEY AUTOINCREMENT, project_id integer NOT NULL REFERENCES short_video_accounts(id),
 name text NOT NULL, status text NOT NULL DEFAULT 'active', sort_order integer NOT NULL DEFAULT 0,
 UNIQUE(project_id,name)
);
ALTER TABLE contents ADD COLUMN category_id integer REFERENCES content_categories(id);
ALTER TABLE review_sessions ADD COLUMN project_id integer REFERENCES short_video_accounts(id);
UPDATE review_sessions SET project_id=(SELECT min(id) FROM short_video_accounts);
ALTER TABLE saved_filters ADD COLUMN project_id integer REFERENCES short_video_accounts(id);
UPDATE saved_filters SET project_id=(SELECT min(id) FROM short_video_accounts)
WHERE module_key IN ('contents','review','publishing','versions','materials','analytics_metrics');
DROP INDEX IF EXISTS idx_saved_filters_user_module_name;
CREATE UNIQUE INDEX idx_saved_filters_project_name ON saved_filters(user_id,module_key,coalesce(project_id,0),name);

CREATE TABLE publishing_targets(
 id integer PRIMARY KEY AUTOINCREMENT, project_id integer NOT NULL REFERENCES short_video_accounts(id),
 name text NOT NULL, status text NOT NULL DEFAULT 'active', sort_order integer NOT NULL DEFAULT 0,
 created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(project_id,name)
);
CREATE TABLE publishing_records(
 id integer PRIMARY KEY AUTOINCREMENT, content_id integer NOT NULL REFERENCES contents(id),
 target_id integer NOT NULL REFERENCES publishing_targets(id), version_id integer NOT NULL REFERENCES content_versions(id),
 product_master_id integer REFERENCES product_masters(id), published integer NOT NULL DEFAULT 0,
 published_at text, title text NOT NULL DEFAULT '', body text NOT NULL DEFAULT '', topics_json text NOT NULL DEFAULT '[]',
 revision integer NOT NULL DEFAULT 1, updated_by_user_id integer NOT NULL REFERENCES users(id),
 created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(content_id,target_id)
);
CREATE TABLE publishing_events(
 id integer PRIMARY KEY AUTOINCREMENT, record_id integer REFERENCES publishing_records(id),
 content_id integer NOT NULL REFERENCES contents(id),target_id integer REFERENCES publishing_targets(id),
 operator_user_id integer NOT NULL REFERENCES users(id),action text NOT NULL, details_json text NOT NULL DEFAULT '{}',
 created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_publishing_records_target ON publishing_records(target_id,published);
CREATE INDEX idx_publishing_events_content ON publishing_events(content_id,created_at);
-- Old lamps are retired. Preserve historical rows for referential integrity, never restore them into new targets.
UPDATE platform_contents SET deleted_at=coalesce(deleted_at,CURRENT_TIMESTAMP),publish_status='pending',published_at=NULL,handler_user_id=NULL,handling_started_at=NULL;
UPDATE report_templates SET active=0 WHERE code='RPT-SPOKEN-COPY';

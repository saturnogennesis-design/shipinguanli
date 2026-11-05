CREATE TABLE project_permission_roles (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 project_id INTEGER NOT NULL REFERENCES short_video_accounts(id),
 name TEXT NOT NULL,
 permissions_json TEXT NOT NULL DEFAULT '[]',
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(project_id,name)
);
ALTER TABLE project_user_permissions ADD COLUMN role_id INTEGER REFERENCES project_permission_roles(id);
ALTER TABLE project_user_permissions ADD COLUMN scope_version INTEGER NOT NULL DEFAULT 1;
CREATE TABLE project_member_groups (
 project_id INTEGER NOT NULL REFERENCES short_video_accounts(id),
 user_id INTEGER NOT NULL REFERENCES users(id),
 group_id INTEGER NOT NULL REFERENCES content_groups(id),
 PRIMARY KEY(project_id,user_id,group_id)
);
-- Preserve current membership when existing project profiles adopt project-local scope.
INSERT OR IGNORE INTO project_member_groups(project_id,user_id,group_id)
 SELECT p.project_id,p.user_id,g.id FROM project_user_permissions p
 JOIN content_groups g ON g.account_id=p.project_id AND g.status='active'
 WHERE EXISTS(SELECT 1 FROM group_memberships m WHERE m.user_id=p.user_id AND m.group_id=g.id)
 OR EXISTS(SELECT 1 FROM users u WHERE u.id=p.user_id AND u.primary_group_id=g.id);

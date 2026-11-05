-- A template is applied once. Freeze existing live roles before detaching them.
UPDATE project_user_permissions SET permissions_json=coalesce((SELECT permissions_json FROM project_permission_roles r WHERE r.id=project_user_permissions.role_id AND r.project_id=project_user_permissions.project_id),'[]'),role_id=NULL WHERE role_id IS NOT NULL;
CREATE TABLE project_leaders(project_id INTEGER NOT NULL REFERENCES short_video_accounts(id),user_id INTEGER NOT NULL REFERENCES users(id),PRIMARY KEY(project_id,user_id));
INSERT OR IGNORE INTO project_leaders SELECT DISTINCT g.account_id,g.leader_user_id FROM content_groups g JOIN project_visibility v ON v.project_id=g.account_id AND v.user_id=g.leader_user_id WHERE g.status='active' AND g.leader_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM content_groups other WHERE other.account_id=g.account_id AND other.status='active' AND coalesce(other.leader_user_id,-1)<>g.leader_user_id);
CREATE TABLE user_common_permissions(user_id INTEGER PRIMARY KEY REFERENCES users(id),permissions_json TEXT NOT NULL DEFAULT '[]',revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
-- Keep legacy identity records internally; the new UI never selects a system role.

INSERT OR IGNORE INTO content_groups(code,name,account_id) SELECT 'INTERNAL-PROJECT-'||p.id,'项目内容',p.id FROM short_video_accounts p WHERE NOT EXISTS(SELECT 1 FROM content_groups g WHERE g.account_id=p.id AND g.status='active');

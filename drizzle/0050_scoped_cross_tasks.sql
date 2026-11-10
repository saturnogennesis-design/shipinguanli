CREATE TABLE cross_task_workspaces(project_id INTEGER PRIMARY KEY REFERENCES short_video_accounts(id),enabled INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
-- Resolve the named project once; never assume its ID or enable every cross-border project.
INSERT INTO cross_task_workspaces(project_id,enabled) SELECT id,1 FROM short_video_accounts WHERE project_type='cross_border' AND name='月光峡谷' AND (SELECT count(*) FROM short_video_accounts WHERE project_type='cross_border' AND name='月光峡谷')=1;
CREATE TABLE cross_tasks(
 id INTEGER PRIMARY KEY AUTOINCREMENT,project_id INTEGER NOT NULL REFERENCES short_video_accounts(id),
 stage TEXT NOT NULL CHECK(stage IN ('mother','product','child')),source_id INTEGER NOT NULL REFERENCES cross_records(id) ON DELETE CASCADE,
 result_id INTEGER UNIQUE REFERENCES cross_records(id) ON DELETE SET NULL,package_type TEXT NOT NULL DEFAULT 'main',
 assignee_id INTEGER REFERENCES users(id),priority INTEGER NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 2),
 status TEXT NOT NULL DEFAULT 'todo',manual_owner INTEGER NOT NULL DEFAULT 0,task_key TEXT NOT NULL UNIQUE,
 revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX cross_tasks_scope ON cross_tasks(project_id,assignee_id,status);
CREATE INDEX cross_tasks_source ON cross_tasks(source_id,project_id);
CREATE TABLE cross_task_reads(user_id INTEGER NOT NULL REFERENCES users(id),task_id INTEGER NOT NULL REFERENCES cross_tasks(id) ON DELETE CASCADE,revision INTEGER NOT NULL,PRIMARY KEY(user_id,task_id));
CREATE TRIGGER scoped_single_main_insert BEFORE INSERT ON cross_records WHEN NEW.kind='package' AND NEW.package_type='main' AND EXISTS(SELECT 1 FROM cross_task_workspaces WHERE project_id=NEW.project_id AND enabled=1) AND EXISTS(SELECT 1 FROM cross_records WHERE project_id=NEW.project_id AND kind='package' AND package_type='main' AND parent_id=NEW.parent_id) BEGIN SELECT RAISE(ABORT,'同一母版只能对应一个主产品包，请处理原产品或新建修订'); END;
CREATE TRIGGER scoped_single_main_update BEFORE UPDATE OF parent_id,package_type,kind ON cross_records WHEN (OLD.parent_id IS NOT NEW.parent_id OR OLD.package_type<>NEW.package_type OR OLD.kind<>NEW.kind) AND NEW.kind='package' AND NEW.package_type='main' AND EXISTS(SELECT 1 FROM cross_task_workspaces WHERE project_id=NEW.project_id AND enabled=1) AND EXISTS(SELECT 1 FROM cross_records WHERE id<>NEW.id AND project_id=NEW.project_id AND kind='package' AND package_type='main' AND parent_id=NEW.parent_id) BEGIN SELECT RAISE(ABORT,'同一母版只能对应一个主产品包'); END;

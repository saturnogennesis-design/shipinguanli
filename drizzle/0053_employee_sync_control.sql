CREATE TABLE employee_devices(
 id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),label TEXT NOT NULL,
 version TEXT NOT NULL,last_seen INTEGER NOT NULL,last_sync INTEGER,report_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE employee_sync_commands(
 id INTEGER PRIMARY KEY AUTOINCREMENT,device_id TEXT NOT NULL REFERENCES employee_devices(id),actor_id INTEGER NOT NULL REFERENCES users(id),
 action TEXT NOT NULL,job_id TEXT,payload_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',result TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,finished_at INTEGER
);
CREATE INDEX employee_commands_pending ON employee_sync_commands(device_id,status,id);
CREATE TABLE offline_cancelled_tasks(user_id INTEGER NOT NULL,task_id TEXT NOT NULL,actor_id INTEGER NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,task_id));

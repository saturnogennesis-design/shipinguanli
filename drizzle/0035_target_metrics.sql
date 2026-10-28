CREATE TABLE publishing_metrics(
 id integer PRIMARY KEY AUTOINCREMENT, record_id integer NOT NULL REFERENCES publishing_records(id),
 recorded_on text NOT NULL, views integer NOT NULL DEFAULT 0,likes integer NOT NULL DEFAULT 0,comments integer NOT NULL DEFAULT 0,
 shares integer NOT NULL DEFAULT 0,favorites integer NOT NULL DEFAULT 0,recorded_by_user_id integer NOT NULL REFERENCES users(id),
 created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(record_id,recorded_on)
);
CREATE UNIQUE INDEX idx_publishing_target_project_name ON publishing_targets(project_id,name);
CREATE UNIQUE INDEX idx_publishing_record_content_target ON publishing_records(content_id,target_id);
CREATE UNIQUE INDEX idx_publishing_metric_record_date ON publishing_metrics(record_id,recorded_on);
CREATE INDEX idx_review_sessions_project_owner ON review_sessions(project_id,reviewer_user_id,status);

ALTER TABLE work_report_cc ADD COLUMN from_user_id integer REFERENCES users(id);
ALTER TABLE work_report_cc ADD COLUMN level integer NOT NULL DEFAULT 1;
CREATE INDEX idx_work_report_cc_from ON work_report_cc(from_user_id,report_id);
CREATE TABLE work_report_cc_hidden (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, cc_id integer NOT NULL REFERENCES work_report_cc(id), user_id integer NOT NULL REFERENCES users(id));
CREATE UNIQUE INDEX idx_report_cc_hidden ON work_report_cc_hidden(cc_id,user_id);

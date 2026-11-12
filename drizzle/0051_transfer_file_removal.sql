ALTER TABLE transfer_files ADD COLUMN deleted_at TEXT;
CREATE INDEX transfer_files_active ON transfer_files(package_id,deleted_at);

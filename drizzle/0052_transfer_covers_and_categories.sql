ALTER TABLE transfer_packages ADD COLUMN content_type TEXT CHECK(content_type IS NULL OR content_type IN ('image','document','video'));
ALTER TABLE transfer_packages ADD COLUMN cover_path TEXT;
ALTER TABLE transfer_files ADD COLUMN cover_path TEXT;

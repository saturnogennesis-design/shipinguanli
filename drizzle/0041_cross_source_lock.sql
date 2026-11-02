ALTER TABLE cross_records ADD COLUMN source_locked INTEGER NOT NULL DEFAULT 0 CHECK(source_locked IN (0,1));

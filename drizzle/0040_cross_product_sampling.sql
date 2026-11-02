ALTER TABLE cross_records ADD COLUMN is_sampled INTEGER NOT NULL DEFAULT 0 CHECK(is_sampled IN (0,1));

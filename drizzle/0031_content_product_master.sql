ALTER TABLE contents ADD COLUMN product_master_id INTEGER REFERENCES product_masters(id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_contents_product_master ON contents(product_master_id);

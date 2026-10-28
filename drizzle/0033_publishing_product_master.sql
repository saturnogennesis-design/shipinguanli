-- Publishing uses the shared product catalog. Keep legacy product_id for history.
ALTER TABLE platform_contents ADD COLUMN product_master_id integer REFERENCES product_masters(id);
CREATE INDEX idx_platform_contents_product_master ON platform_contents(product_master_id);

-- Explicit source links take priority only for tasks with no saved publishing details.
-- A saved NULL is intentional and must not be filled again on every page load.
UPDATE platform_contents
SET product_master_id = CASE
  WHEN product_id IS NOT NULL THEN (
    SELECT MIN(pm.id) FROM product_masters pm JOIN products p ON p.name = pm.name
    WHERE p.id = platform_contents.product_id
    HAVING COUNT(*) = 1
  )
  WHEN NOT EXISTS (SELECT 1 FROM publication_copies pc WHERE pc.platform_content_id = platform_contents.id)
    THEN (SELECT c.product_master_id FROM contents c WHERE c.id = platform_contents.source_content_id)
  ELSE NULL END;

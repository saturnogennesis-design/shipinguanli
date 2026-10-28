/* Product catalog is the single source for new material, content, and report links. */
INSERT INTO product_masters (name, image_storage_path, status, created_by_user_id, created_at, updated_at)
SELECT p.name, NULL,
       CASE WHEN p.status = 'active' THEN 'active' ELSE 'inactive' END,
       COALESCE(p.owner_user_id, (SELECT id FROM users ORDER BY id LIMIT 1)),
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM products p
WHERE trim(p.name) <> ''
  AND NOT EXISTS (SELECT 1 FROM product_masters pm WHERE pm.name = p.name);
--> statement-breakpoint
UPDATE contents
SET product_master_id = (
  SELECT pm.id
  FROM product_masters pm
  INNER JOIN products p ON p.name = pm.name
  WHERE p.id = contents.product_id
  ORDER BY pm.id
  LIMIT 1
)
WHERE contents.product_master_id IS NULL AND contents.product_id IS NOT NULL;

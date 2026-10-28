import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { productMasters, products, users } from "@/db/schema";

/**
 * Keeps the unified product catalog usable for databases created before the
 * product-master migration. It is intentionally idempotent and only imports
 * active legacy business products; historical rows are never removed.
 */
export async function syncProductMasterCatalog() {
  const db = getDb();
  const legacyRows = await db
    .select({ name: products.name, status: products.status, ownerUserId: products.ownerUserId })
    .from(products)
    .where(eq(products.status, "active"))
    .orderBy(asc(products.id));
  if (!legacyRows.length) return;
  const [fallback] = await db.select({ id: users.id }).from(users).orderBy(asc(users.id)).limit(1);
  if (!fallback) return;
  const seen = new Set<string>();
  for (const legacy of legacyRows) {
    const name = legacy.name.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const [existing] = await db
      .select({ id: productMasters.id, status: productMasters.status })
      .from(productMasters)
      .where(eq(productMasters.name, name))
      .orderBy(asc(productMasters.id))
      .limit(1);
    // A manual disable must survive legacy catalog synchronization.
    if (existing) continue;
    await db.insert(productMasters).values({ name, status: "active", createdByUserId: legacy.ownerUserId ?? fallback.id });
  }
}

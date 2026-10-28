import { and, count, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { contents, productMasters, products } from "@/db/schema";
import { hasPermission, requireUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

function dateText(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  if (!hasPermission(auth.user, "content.upload")) return Response.json({ error: "没有上传新内容的权限" }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const productMasterId = Number(params.get("productMasterId"));
  const legacyProductId = Number(params.get("productId"));
  if ((!Number.isSafeInteger(productMasterId) || productMasterId < 1) && (!Number.isSafeInteger(legacyProductId) || legacyProductId < 1)) return Response.json({ error: "商品编号无效" }, { status: 400 });
  const db = getDb();
  let productName = "";
  let countPredicate;
  if (Number.isSafeInteger(productMasterId) && productMasterId > 0) {
    const [product] = await db.select({ id: productMasters.id, name: productMasters.name, status: productMasters.status }).from(productMasters).where(eq(productMasters.id, productMasterId)).limit(1);
    if (!product || product.status !== "active") return Response.json({ error: "商品不存在或已停用" }, { status: 404 });
    productName = product.name;
    countPredicate = eq(contents.productMasterId, productMasterId);
  } else {
    const [product] = await db.select({ id: products.id, name: products.name, status: products.status }).from(products).where(eq(products.id, legacyProductId)).limit(1);
    if (!product || product.status !== "active") return Response.json({ error: "商品不存在或已停用" }, { status: 404 });
    productName = product.name;
    countPredicate = eq(contents.productId, legacyProductId);
  }
  const date = dateText();
  const start = `${date} 00:00:00`;
  const end = `${date} 23:59:59`;
  const [row] = await db.select({ total: count() }).from(contents).where(and(countPredicate, gte(contents.createdAt, start), lt(contents.createdAt, end)));
  const sequence = Number(row?.total ?? 0) + 1;
  return Response.json({ date, productName, sequence, prefix: `${date}-${productName}-` });
}

import { count } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getMediaStore } from "@/lib/media-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [row] = await getDb().select({ count: count() }).from(users);
    await getMediaStore().ready();
    return Response.json({
      status: "ok",
      database: "ready",
      media: "ready",
      setupRequired: row.count === 0,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "数据库尚未初始化";
    return Response.json({ status: "degraded", database: "migration-required", media: "unavailable", error: message }, { status: 503 });
  }
}

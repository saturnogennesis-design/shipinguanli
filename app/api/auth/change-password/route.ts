import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/server-auth";
import { hashPassword, verifyPassword } from "@/lib/security";

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  const payload = await request.json() as { currentPassword?: string; newPassword?: string };
  if ((payload.newPassword ?? "").length < 8) return Response.json({ error: "新密码至少8位" }, { status: 400 });
  const [record] = await getDb().select().from(users).where(eq(users.id, auth.user.id)).limit(1);
  if (!record || !await verifyPassword(payload.currentPassword ?? "", record.passwordHash)) return Response.json({ error: "当前密码不正确" }, { status: 400 });
  await getDb().update(users).set({ passwordHash: await hashPassword(payload.newPassword!), mustChangePassword: false, updatedAt: new Date().toISOString() }).where(eq(users.id, auth.user.id));
  await writeAudit(request, { userId: auth.user.id, action: "auth.change_password", objectType: "user", objectId: String(auth.user.id) });
  return Response.json({ ok: true });
}

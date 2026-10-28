import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { createSession, sessionCookie } from "@/lib/server-auth";
import { verifyPassword } from "@/lib/security";

export async function POST(request: Request) {
  const payload = await request.json() as { username?: string; password?: string };
  const username = payload.username?.trim().toLowerCase() ?? "";
  const [user] = await getDb().select().from(users).where(eq(users.username, username)).limit(1);
  const valid = Boolean(user && user.status === "active" && await verifyPassword(payload.password ?? "", user.passwordHash));
  if (!valid) {
    await writeAudit(request, { userId: user?.id, action: "auth.login", objectType: "user", objectId: username || "unknown", result: "failure", details: { reason: user?.status === "disabled" ? "disabled" : "invalid_credentials" } });
    return Response.json({ error: "账号或密码错误" }, { status: 401 });
  }
  const session = await createSession(user.id);
  await getDb().update(users).set({ lastLoginAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(users.id, user.id));
  await writeAudit(request, { userId: user.id, action: "auth.login", objectType: "user", objectId: String(user.id) });
  return Response.json({ user: { id: user.id, username: user.username, displayName: user.displayName, mustChangePassword: user.mustChangePassword } }, { headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt) } });
}

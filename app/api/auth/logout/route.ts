import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { userSessions } from "@/db/schema";
import { clearSessionCookie, getSessionTokenHash } from "@/lib/server-auth";

export async function POST(request: Request) {
  const tokenHash = await getSessionTokenHash(request);
  if (tokenHash) await getDb().delete(userSessions).where(eq(userSessions.tokenHash, tokenHash));
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
}

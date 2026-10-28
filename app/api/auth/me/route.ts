import { getCurrentUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  return Response.json({ user });
}

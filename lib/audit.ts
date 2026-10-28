import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";

export function requestIp(request: Request) {
  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "local";
}

export async function writeAudit(request: Request, entry: {
  userId?: number | null;
  action: string;
  objectType: string;
  objectId: string;
  result?: "success" | "failure";
  details?: Record<string, unknown>;
}) {
  await getDb().insert(auditLogs).values({
    userId: entry.userId ?? null,
    action: entry.action,
    objectType: entry.objectType,
    objectId: entry.objectId,
    result: entry.result ?? "success",
    detailsJson: JSON.stringify(entry.details ?? {}),
    ipAddress: requestIp(request),
  });
}

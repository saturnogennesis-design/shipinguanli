import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contentGroups, groupMemberships, platforms, shortVideoAccounts, userAccountResponsibilities, userGroupResponsibilities, userGroupScopes } from "@/db/schema";
import { hasPermission, requireUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** Returns the business-account context choices available after employee login. */
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  const db = getDb();
  const [accountRows, groupRows, responsibilityRows, membershipRows, scopeRows, groupResponsibilityRows] = await Promise.all([
    db.select({ id: shortVideoAccounts.id, code: shortVideoAccounts.code, name: shortVideoAccounts.name, platformName: platforms.name, platformCode: platforms.code })
      .from(shortVideoAccounts).innerJoin(platforms, eq(platforms.id, shortVideoAccounts.platformId))
      .where(eq(shortVideoAccounts.status, "active")).orderBy(asc(shortVideoAccounts.name)),
    db.select({ id: contentGroups.id, name: contentGroups.name, accountId: contentGroups.accountId })
      .from(contentGroups).where(eq(contentGroups.status, "active")).orderBy(asc(contentGroups.name)),
    db.select({ accountId: userAccountResponsibilities.accountId }).from(userAccountResponsibilities).where(eq(userAccountResponsibilities.userId, auth.user.id)),
    db.select({ groupId: groupMemberships.groupId }).from(groupMemberships).where(eq(groupMemberships.userId, auth.user.id)),
    db.select({ groupId: userGroupScopes.groupId }).from(userGroupScopes).where(eq(userGroupScopes.userId, auth.user.id)),
    db.select({ groupId: userGroupResponsibilities.groupId }).from(userGroupResponsibilities).where(eq(userGroupResponsibilities.userId, auth.user.id)),
  ]);
  const elevated = auth.user.roleCode === "super_admin" || hasPermission(auth.user, "admin.view") || hasPermission(auth.user, "business.view");
  const groupIds = new Set<number>([
    ...membershipRows.map((row) => row.groupId),
    ...scopeRows.map((row) => row.groupId),
    ...groupResponsibilityRows.map((row) => row.groupId),
    ...(auth.user.primaryGroupId ? [auth.user.primaryGroupId] : []),
  ]);
  const assignedAccountIds = new Set<number>(responsibilityRows.map((row) => row.accountId));
  for (const group of groupRows) if (group.accountId && groupIds.has(group.id)) assignedAccountIds.add(group.accountId);
  const accounts = elevated ? accountRows : accountRows.filter((row) => assignedAccountIds.has(row.id));
  const visibleAccountIds = new Set(accounts.map((row) => row.id));
  const groups = (elevated ? groupRows : groupRows.filter((row) => groupIds.has(row.id)))
    .filter((row) => row.accountId === null || visibleAccountIds.has(row.accountId));
  return Response.json({
    accounts: accounts.map((account) => ({ ...account, groups: groups.filter((group) => group.accountId === account.id) })),
    defaultGroupId: auth.user.primaryGroupId ?? null,
  });
}

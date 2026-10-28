import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  contentGroups,
  groupMemberships,
  shortVideoAccounts,
  userAccountResponsibilities,
  userGroupResponsibilities,
} from "@/db/schema";
import { hasPermission, type AuthUser } from "./server-auth";

export type AccountResponsibility = "material" | "material_upload" | "material_review" | "publisher";
export type GroupResponsibility = "member" | "leader" | "content_review";

export async function responsibleAccountIds(user: AuthUser, types: AccountResponsibility[]) {
  if (user.roleCode === "super_admin") {
    const rows = await getDb().select({ id: shortVideoAccounts.id }).from(shortVideoAccounts).where(eq(shortVideoAccounts.status, "active"));
    return rows.map((row) => row.id);
  }
  const rows = await getDb().select({ accountId: userAccountResponsibilities.accountId })
    .from(userAccountResponsibilities)
    .where(and(eq(userAccountResponsibilities.userId, user.id), inArray(userAccountResponsibilities.responsibilityType, types)));
  return [...new Set(rows.map((row) => row.accountId))];
}

export async function memberAccountIds(user: AuthUser) {
  if (user.roleCode === "super_admin") return responsibleAccountIds(user, ["material"]);
  const rows = await getDb().select({ accountId: contentGroups.accountId })
    .from(groupMemberships)
    .innerJoin(contentGroups, eq(contentGroups.id, groupMemberships.groupId))
    .where(and(eq(groupMemberships.userId, user.id), eq(contentGroups.status, "active")));
  return [...new Set(rows.map((row) => row.accountId).filter((id): id is number => id !== null))];
}

export async function materialAccountIds(user: AuthUser, action: "view" | "upload" | "review" | "claim") {
  const permission = action === "upload" ? "asset.upload" : action === "review" ? "asset.review" : action === "claim" ? "asset.claim" : "asset.view";
  if (!hasPermission(user, permission)) return [];
  if (action === "upload") return responsibleAccountIds(user, ["material", "material_upload"]);
  if (action === "review") return responsibleAccountIds(user, ["material", "material_review"]);
  const [assigned, member] = await Promise.all([responsibleAccountIds(user, ["material", "material_upload", "material_review"]), memberAccountIds(user)]);
  return [...new Set([...assigned, ...member])];
}

export async function publishingAccountIds(user: AuthUser) {
  if (!hasPermission(user, "publishing.view")) return [];
  return responsibleAccountIds(user, ["publisher"]);
}

export async function responsibleGroupIds(user: AuthUser, types: GroupResponsibility[]) {
  if (user.roleCode === "super_admin") {
    const rows = await getDb().select({ id: contentGroups.id }).from(contentGroups).where(eq(contentGroups.status, "active"));
    return rows.map((row) => row.id);
  }
  const [responsible, member] = await Promise.all([
    getDb().select({ groupId: userGroupResponsibilities.groupId }).from(userGroupResponsibilities)
      .where(and(eq(userGroupResponsibilities.userId, user.id), inArray(userGroupResponsibilities.responsibilityType, types))),
    types.includes("member") ? getDb().select({ groupId: groupMemberships.groupId }).from(groupMemberships).where(eq(groupMemberships.userId, user.id)) : Promise.resolve([]),
  ]);
  return [...new Set([...responsible, ...member].map((row) => row.groupId))];
}

export function hasId(ids: number[], id: number | null | undefined) {
  return Boolean(id && ids.includes(id));
}

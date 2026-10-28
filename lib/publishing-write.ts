import type { DatabaseSync } from "node:sqlite";

export class PublishingConflict extends Error {}
export type PublishingSnapshot = { id: number; rowVersion: number };
export type PublishingAssignment = {
  platformId: number;
  accountId?: number | null;
  productMasterId?: number | null;
  copy?: { title?: string; body?: string; topics?: string[] };
};

// Synchronous callbacks cannot yield while the shared SQLite connection is locked.
export function atomicWrite<T>(db: DatabaseSync, write: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = write();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function assertContent(db: DatabaseSync, id: number, accountIds: number[]) {
  const row = db.prepare("SELECT * FROM contents WHERE id = ?").get(id);
  if (!row || row.review_status !== "approved" || row.archived_at || row.deleted_at ||
      (row.account_id && !accountIds.includes(Number(row.account_id)))) {
    throw new PublishingConflict("内容状态或账号范围已变化，请刷新后重试");
  }
  return row;
}

export function savePublishingDetails(db: DatabaseSync, input: {
  contentId: number; userId: number; accountIds: number[];
  expectedAssignments: PublishingSnapshot[]; assignments: PublishingAssignment[];
  now: string;
}) {
  return atomicWrite(db, () => {
    const content = assertContent(db, input.contentId, input.accountIds);
    const existing = db.prepare("SELECT * FROM platform_contents WHERE source_content_id = ?").all(input.contentId);
    const active = existing.filter(row => !row.deleted_at);
    const assignments = input.assignments.map(assignment => {
      if (assignment.productMasterId !== undefined) return assignment;
      const previous = existing.find(row => row.platform_id === assignment.platformId && !row.deleted_at);
      const source = content.product_master_id == null ? null : db.prepare("SELECT id FROM product_masters WHERE id = ? AND status = 'active'").get(content.product_master_id as number);
      return {...assignment, productMasterId: previous ? previous.product_master_id as number | null : source ? Number(source.id) : null};
    });
    if (active.length !== input.expectedAssignments.length || active.some(row =>
      !input.expectedAssignments.some(expected => expected.id === row.id && expected.rowVersion === row.row_version))) {
      throw new PublishingConflict("发布资料已更新，请刷新后重试");
    }
    if (active.some(row => row.handler_user_id !== input.userId)) {
      throw new PublishingConflict("发布任务尚未领取或已改派，请刷新后重试");
    }
    const version = db.prepare("SELECT id FROM content_versions WHERE content_id = ? AND version_number = ? AND upload_status = 'complete' AND deleted_at IS NULL")
      .get(input.contentId, content.latest_version_number as number);
    if (!version) throw new PublishingConflict("当前可发布版本不存在");
    for (const assignment of assignments) {
      if (!db.prepare("SELECT id FROM platforms WHERE id = ?").get(assignment.platformId)) throw new PublishingConflict("目标平台不存在");
      if (assignment.accountId != null && (
        (content.account_id && assignment.accountId !== content.account_id) ||
        !input.accountIds.includes(assignment.accountId) ||
        !db.prepare("SELECT id FROM short_video_accounts WHERE id = ? AND platform_id = ? AND status = 'active'").get(assignment.accountId, assignment.platformId)
      )) throw new PublishingConflict("发布账号已变化或不在授权范围内");
      if (assignment.productMasterId != null) {
        const product = db.prepare("SELECT id, status FROM product_masters WHERE id = ?").get(assignment.productMasterId);
        const previous = existing.find(row => row.platform_id === assignment.platformId && !row.deleted_at);
        if (!product || (product.status !== "active" && previous?.product_master_id !== assignment.productMasterId)) {
          throw new PublishingConflict("所选商品不存在或已停用");
        }
      }
    }
    const desired = new Set(assignments.map(item => item.platformId));
    if (active.some(row => !desired.has(Number(row.platform_id)) && row.publish_status === "published")) {
      throw new PublishingConflict("请先关闭已发布的平台灯，再取消该平台");
    }
    for (const assignment of assignments) {
      const old = existing.find(row => row.platform_id === assignment.platformId);
      let id: number;
      if (old) {
        id = Number(old.id);
        db.prepare("UPDATE platform_contents SET version_id = ?, account_id = ?, product_master_id = ?, product_id = NULL, publish_owner_user_id = ?, deleted_at = NULL, row_version = row_version + 1, updated_at = ? WHERE id = ?")
          .run(version.id as number, assignment.accountId ?? null, assignment.productMasterId ?? null, input.userId, input.now, id);
      } else {
        const created = db.prepare("INSERT INTO platform_contents(source_content_id, version_id, platform_id, account_id, product_master_id, publish_owner_user_id, row_version, updated_at) VALUES(?,?,?,?,?,?,1,?) RETURNING id")
          .get(input.contentId, version.id as number, assignment.platformId, assignment.accountId ?? null, assignment.productMasterId ?? null, input.userId, input.now);
        id = Number(created!.id);
      }
      const copy = assignment.copy ?? {};
      db.prepare(`INSERT INTO publication_copies(platform_content_id,title,body,topics_json,source,updated_by_user_id,updated_at)
        VALUES(?,?,?,?, 'manual',?,?) ON CONFLICT(platform_content_id) DO UPDATE SET
        title=excluded.title,body=excluded.body,topics_json=excluded.topics_json,source=excluded.source,
        updated_by_user_id=excluded.updated_by_user_id,updated_at=excluded.updated_at`)
        .run(id, copy.title?.trim() ?? "", copy.body ?? "", JSON.stringify((copy.topics ?? []).map(item => item.trim()).filter(Boolean)), input.userId, input.now);
    }
    for (const row of active) {
      if (!desired.has(Number(row.platform_id))) db.prepare("UPDATE platform_contents SET deleted_at = ?, account_id = NULL, publish_status = 'pending', published_at = NULL, handler_user_id = NULL, handling_started_at = NULL, row_version = row_version + 1, updated_at = ? WHERE id = ?")
        .run(input.now, input.now, row.id as number);
    }
    db.prepare("UPDATE contents SET business_activity_at = ?, updated_at = ? WHERE id = ?").run(input.now, input.now, input.contentId);
  });
}

export function setPublishingStatus(db: DatabaseSync, input: {
  id: number; userId: number; accountIds: number[]; expectedVersion: number; published: boolean; now: string;
}) {
  return atomicWrite(db, () => {
    const row = db.prepare("SELECT * FROM platform_contents WHERE id = ? AND deleted_at IS NULL").get(input.id);
    if (!row || row.row_version !== input.expectedVersion || row.handler_user_id !== input.userId ||
        !input.accountIds.includes(Number(row.account_id))) throw new PublishingConflict("任务已更新或改派，请刷新后重试");
    assertContent(db, Number(row.source_content_id), input.accountIds);
    db.prepare("UPDATE platform_contents SET publish_status = ?, published_at = ?, row_version = row_version + 1, updated_at = ? WHERE id = ?")
      .run(input.published ? "published" : "pending", input.published ? input.now : null, input.now, input.id);
    db.prepare("UPDATE contents SET business_activity_at = ?, updated_at = ? WHERE id = ?").run(input.now, input.now, row.source_content_id as number);
    db.prepare("INSERT INTO publication_events(platform_content_id,event_type,operator_user_id) VALUES(?,?,?)")
      .run(input.id, input.published ? "published" : "unpublished", input.userId);
  });
}

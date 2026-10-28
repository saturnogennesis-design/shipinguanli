import type { DatabaseSync } from "node:sqlite";
import { atomicWrite, PublishingConflict } from "./publishing-write";

export function deleteReportDraft(db: DatabaseSync, id: number, userId: number) {
  return atomicWrite(db, () => {
    const report = db.prepare("SELECT id FROM work_reports WHERE id = ? AND submitter_user_id = ? AND status = 'draft'").get(id, userId);
    if (!report) throw new PublishingConflict("草稿状态已变化，不能删除，请刷新后重试");
    const attachments = db.prepare("SELECT id, storage_path FROM work_report_attachments WHERE report_id = ?").all(id);
    db.prepare("DELETE FROM work_report_attachments WHERE report_id = ?").run(id);
    db.prepare("DELETE FROM work_report_activity_logs WHERE report_id = ?").run(id);
    db.prepare("DELETE FROM work_report_hidden WHERE report_id = ?").run(id);
    db.prepare("DELETE FROM work_report_recipient_reads WHERE report_id = ?").run(id);
    db.prepare("DELETE FROM work_reports WHERE id = ?").run(id);
    return attachments.flatMap(row => [String(row.storage_path), `work-reports/${id}/previews/${row.id}.pdf`]);
  });
}

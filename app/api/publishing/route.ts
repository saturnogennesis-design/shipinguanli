import {getLocalDatabase} from '@/db';
import {requireUser,hasPermission} from '@/lib/server-auth';
import {publishingAccountIds} from '@/lib/v3-access';
export async function GET(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,'publishing.view')||!(await publishingAccountIds(auth.user)).includes(auth.user.projectId!))return Response.json({error:'没有本项目的发布职责'},{status:403});
 const db=getLocalDatabase(),projectId=auth.user.projectId!;
 const targets=db.prepare('SELECT * FROM publishing_targets WHERE project_id=? ORDER BY sort_order,id').all(projectId);
 const rows=db.prepare(`SELECT c.id,c.code,c.title,c.content_type AS contentType,c.product_master_id AS productMasterId,p.name AS productName,p.image_storage_path AS productImagePath,c.category_id AS categoryId,cat.name AS categoryName,
 c.uploader_user_id AS uploaderUserId,u.display_name AS uploaderName,u.content_color AS contentColor,c.remark,c.visibility,c.created_at AS createdAt,c.updated_at AS updatedAt,v.id AS versionId,v.version_number AS versionNumber,v.file_size AS fileSize,v.duration_seconds AS durationSeconds
 FROM contents c JOIN content_versions v ON v.content_id=c.id AND v.version_number=c.latest_version_number
 JOIN users u ON u.id=c.uploader_user_id LEFT JOIN product_masters p ON p.id=c.product_master_id LEFT JOIN content_categories cat ON cat.id=c.category_id
 WHERE c.account_id=? AND c.review_status='approved' AND c.deleted_at IS NULL AND c.archived_at IS NULL AND v.upload_status='complete' AND v.deleted_at IS NULL ORDER BY c.updated_at DESC,c.id DESC`).all(projectId);
 const records=db.prepare('SELECT r.*,u.display_name AS operatorName FROM publishing_records r JOIN contents c ON c.id=r.content_id JOIN users u ON u.id=r.updated_by_user_id WHERE c.account_id=?').all(projectId);
 const logs=db.prepare(`SELECT e.*,u.display_name AS operatorName,coalesce(json_extract(e.details_json,'$.targetName'),t.name) AS targetName FROM publishing_events e JOIN contents c ON c.id=e.content_id JOIN users u ON u.id=e.operator_user_id LEFT JOIN publishing_targets t ON t.id=e.target_id WHERE c.account_id=? ORDER BY e.id DESC`).all(projectId);
 const products=db.prepare("SELECT id,name,status FROM product_masters WHERE project_id=? ORDER BY name").all(projectId);
 return Response.json({contents:rows.map(row=>({...row,productImageUrl:row.productImagePath?`/api/product-masters/${row.productMasterId}/image?projectId=${projectId}`:null,coverUrl:`/api/content-versions/${row.versionId}/cover?projectId=${projectId}`,fileUrl:`/api/content-versions/${row.versionId}/file?projectId=${projectId}&v=${encodeURIComponent(String(row.updatedAt))}`,records:records.filter(record=>record.content_id===row.id),logs:logs.filter(log=>log.content_id===row.id)})),targets,products,currentUserId:auth.user.id,canStatus:hasPermission(auth.user,'publishing.status'),canEdit:hasPermission(auth.user,'publishing.assign'),canDownload:hasPermission(auth.user,'publishing.download')});
}

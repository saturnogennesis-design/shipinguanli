import {writeAudit} from '@/lib/audit';
import {getLocalDatabase} from '@/db';
import {requireUser,hasPermission} from '@/lib/server-auth';
export async function GET(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;if(!hasPermission(auth.user,'analytics.view'))return Response.json({error:'没有统计权限'},{status:403});
 const db=getLocalDatabase();const rows=db.prepare(`SELECT t.id,t.name,count(c.id) AS publishedCount FROM publishing_targets t LEFT JOIN publishing_records r ON r.target_id=t.id AND r.published=1 LEFT JOIN contents c ON c.id=r.content_id AND c.deleted_at IS NULL AND c.archived_at IS NULL WHERE t.project_id=? GROUP BY t.id ORDER BY t.sort_order,t.id`).all(auth.user.projectId!);
 const published=db.prepare("SELECT r.id,c.title,t.name AS targetName FROM publishing_records r JOIN contents c ON c.id=r.content_id JOIN publishing_targets t ON t.id=r.target_id WHERE c.account_id=? AND r.published=1 AND c.deleted_at IS NULL AND c.archived_at IS NULL").all(auth.user.projectId!);
 const metrics=db.prepare("SELECT m.*,u.display_name AS operatorName,t.name AS targetName,c.title AS contentTitle FROM publishing_metrics m JOIN publishing_records r ON r.id=m.record_id JOIN contents c ON c.id=r.content_id JOIN publishing_targets t ON t.id=r.target_id JOIN users u ON u.id=m.recorded_by_user_id WHERE c.account_id=? ORDER BY m.recorded_on DESC,m.id DESC").all(auth.user.projectId!);
 return Response.json({published,metrics,canEdit:hasPermission(auth.user,'analytics.edit'),targets:rows,totals:db.prepare("SELECT count(DISTINCT r.content_id) AS contentCount,count(*) AS publicationCount FROM publishing_records r JOIN contents c ON c.id=r.content_id WHERE c.account_id=? AND r.published=1 AND c.deleted_at IS NULL AND c.archived_at IS NULL").get(auth.user.projectId!)});
}
export async function POST(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;if(!hasPermission(auth.user,'analytics.edit'))return Response.json({error:'没有数据录入权限'},{status:403});
 const body=await request.json().catch(()=>null);if(!body)return Response.json({error:'参数无效'},{status:400});
 const values=['views','likes','comments','shares','favorites'].map(key=>Number(body[key]??0));
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(body.recordedOn))||values.some(value=>!Number.isSafeInteger(value)||value<0))return Response.json({error:'请填写日期和非负整数'},{status:400});
 const db=getLocalDatabase(),row=db.prepare("SELECT r.id FROM publishing_records r JOIN contents c ON c.id=r.content_id WHERE r.id=? AND r.published=1 AND c.account_id=? AND c.deleted_at IS NULL AND c.archived_at IS NULL").get(Number(body.recordId),auth.user.projectId!);
 if(!row)return Response.json({error:'只能录入当前项目已发布目标的表现数据'},{status:403});
 try{db.prepare('INSERT INTO publishing_metrics(record_id,recorded_on,views,likes,comments,shares,favorites,recorded_by_user_id) VALUES(?,?,?,?,?,?,?,?)').run(Number(row.id),body.recordedOn,...values,auth.user.id);}catch{return Response.json({error:'同一发布目标当天已录入过数据'},{status:409});}
 await writeAudit(request,{userId:auth.user.id,action:'analytics.metric_create',objectType:'publishing_record',objectId:String(row.id),details:{projectId:auth.user.projectId,recordedOn:body.recordedOn}});
 return Response.json({ok:true},{status:201});
}

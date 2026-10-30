import {requireCross} from '@/lib/cross-auth';
import {crossRow,crossEvent,crossMember,validateParent,type CrossKind,type CrossRecord} from '@/lib/cross-workflow';
import {atomicWrite} from '@/lib/publishing-write';
export async function GET(request:Request){
 const auth=await requireCross(request);if(!auth.user)return auth.response;
 const {db,user,access}=auth,url=new URL(request.url),id=Number(url.searchParams.get('id'));
 const people=db.prepare("SELECT id,display_name AS name FROM users WHERE status='active' ORDER BY display_name").all().filter(person=>crossMember(db,Number(person.id),user.projectId!));
 const rows=db.prepare(`SELECT r.*,c.display_name AS creatorName,m.display_name AS makerName,p.title AS parentTitle,
 (SELECT id FROM cross_files WHERE record_id=r.id AND active=1 ORDER BY id LIMIT 1) AS coverId
 FROM cross_records r JOIN users c ON c.id=r.creator_id JOIN users m ON m.id=r.maker_id LEFT JOIN cross_records p ON p.id=r.parent_id
 WHERE r.project_id=? ORDER BY r.updated_at DESC,r.id DESC`).all(user.projectId!);
 if(id){const row=crossRow(db,id,user.projectId!);if(!row)return Response.json({error:'资料不存在或不属于当前项目'},{status:404});
 const parent=row.parent_id?crossRow(db,row.parent_id,user.projectId!):null;let clue=parent?.parent_id?crossRow(db,parent.parent_id,user.projectId!):null;
 const ownVersion=db.prepare('SELECT snapshot_json FROM cross_versions WHERE record_id=? AND version_number=?').get(id,row.version_number);
 const parentVersion=ownVersion&&row.status!=='draft'?JSON.parse(String(ownVersion.snapshot_json)).parentVersion:parent?.version_number;
 const sourceVersion=parent&&parentVersion?db.prepare('SELECT snapshot_json FROM cross_versions WHERE record_id=? AND version_number=?').get(parent.id,parentVersion):null;
 const reference=sourceVersion?JSON.parse(String(sourceVersion.snapshot_json)):parent?{title:parent.title,data:JSON.parse(parent.body_json),files:db.prepare('SELECT id,file_name FROM cross_files WHERE record_id=? AND active=1 ORDER BY id').all(parent.id)}:null;
 if(row.kind==='package'&&reference?.parentId)clue=crossRow(db,Number(reference.parentId),user.projectId!)??null;
 return Response.json({row:rows.find(item=>item.id===id),parent,clue,reference,referenceVersion:parentVersion,files:db.prepare('SELECT f.*,u.display_name AS uploaderName FROM cross_files f JOIN users u ON u.id=f.uploader_id WHERE record_id=? AND f.active=1 ORDER BY f.id').all(id),versions:db.prepare('SELECT v.*,u.display_name AS submitterName FROM cross_versions v JOIN users u ON u.id=v.submitter_id WHERE record_id=? ORDER BY version_number DESC').all(id),events:db.prepare('SELECT e.*,u.display_name AS actorName FROM cross_events e JOIN users u ON u.id=e.actor_id WHERE record_id=? ORDER BY e.id DESC').all(id),access,currentUserId:user.id});}
 return Response.json({items:rows,people,categories:db.prepare('SELECT id,name,status FROM content_categories WHERE project_id=? ORDER BY sort_order,id').all(user.projectId!),access,currentUserId:user.id});
}
export async function POST(request:Request){
 const auth=await requireCross(request);if(!auth.user)return auth.response;const {db,user,access}=auth;if(!access.canCreate)return Response.json({error:'没有新建资料权限'},{status:403});
 const body=await request.json().catch(()=>null);if(!body||!['clue','mother','package'].includes(body.kind))return Response.json({error:'资料类型无效'},{status:400});
 const kind=body.kind as CrossKind,title=String(body.title??'').trim().slice(0,160);if(!title)return Response.json({error:'请填写名称'},{status:400});
 try{const id=atomicWrite(db,()=>{const parentId=kind==='clue'?null:Number(body.parentId);validateParent(db,user.projectId!,kind,parentId);
 const row=db.prepare('INSERT INTO cross_records(project_id,kind,parent_id,title,creator_id,maker_id) VALUES(?,?,?,?,?,?) RETURNING *').get(user.projectId!,kind,parentId,title,user.id,user.id) as CrossRecord;
 crossEvent(db,row,user.id,'create');return row.id;});return Response.json({id},{status:201});}catch(error){return Response.json({error:(error as Error).message},{status:400});}
}

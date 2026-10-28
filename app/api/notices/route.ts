import {and,count,desc,eq,like,sql} from "drizzle-orm";
import {randomUUID} from "node:crypto";
import {getDb} from "@/db";
import {listRules} from "@/lib/list-rules";
import {noticeAttachments,noticeReceipts,notices,users} from "@/db/schema";
import {requireUser,hasPermission} from "@/lib/server-auth";
import {communicationError,InputError,recipients,requiredText} from "@/lib/communication";
import {writeAudit} from "@/lib/audit";

const actionNeeded=(userId:number)=>sql`EXISTS (
 SELECT 1 FROM notice_receipts nr WHERE nr.notice_id=${notices.id} AND nr.user_id=${userId}
 AND ((${notices.requiresReply}=0 AND nr.read_at IS NULL) OR (${notices.requiresReply}=1 AND NOT EXISTS (
   SELECT 1 FROM notice_replies rp WHERE rp.notice_id=${notices.id} AND rp.user_id=${userId}
 )))
)`;

export async function GET(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,"notice.view"))return Response.json({error:"无权查看公告"},{status:403});
 const user=auth.user,url=new URL(request.url),page=Math.max(1,Math.min(100000,Math.floor(Number(url.searchParams.get("page"))||1))),pageSize=[20,50,100].includes(Number(url.searchParams.get("pageSize")))?Number(url.searchParams.get("pageSize")):20;
 const visible=sql`(${notices.authorUserId}=${user.id} OR EXISTS (SELECT 1 FROM notice_receipts r WHERE r.notice_id=${notices.id} AND r.user_id=${user.id}))`;
 const rules=listRules(url.searchParams.get("rules"),{query:{expression:sql`${notices.title}`},owner:{expression:sql`(SELECT display_name FROM users WHERE id=${notices.authorUserId})`},createdAt:{expression:sql`${notices.createdAt}`,type:"date"},readState:{expression:sql`CASE WHEN ${actionNeeded(user.id)} THEN '待处理' WHEN EXISTS (SELECT 1 FROM notice_receipts r WHERE r.notice_id=${notices.id} AND r.user_id=${user.id}) THEN '已处理' ELSE '我发布的' END`}});
 const condition=and(eq(notices.publishStatus,"published"),rules,user.roleCode==="super_admin"?undefined:visible,url.searchParams.get("q")?like(notices.title,`%${url.searchParams.get("q")?.slice(0,100)}%`):undefined,url.searchParams.get("unread")==="1"?actionNeeded(user.id):undefined);
 const db=getDb();const [total]=await db.select({total:count()}).from(notices).where(condition);
 const [pending]=await db.select({total:count()}).from(noticeReceipts).innerJoin(notices,eq(notices.id,noticeReceipts.noticeId)).where(and(eq(noticeReceipts.userId,user.id),eq(notices.publishStatus,"published"),sql`((${notices.requiresReply}=0 AND ${noticeReceipts.readAt} IS NULL) OR (${notices.requiresReply}=1 AND NOT EXISTS (SELECT 1 FROM notice_replies rp WHERE rp.notice_id=${notices.id} AND rp.user_id=${user.id})))`));
 const items=await db.select({id:notices.id,title:notices.title,createdAt:notices.createdAt,authorUserId:notices.authorUserId,authorName:users.displayName,contentColor:users.contentColor,requiresReply:notices.requiresReply,
  readAt:sql<string|null>`(SELECT read_at FROM notice_receipts WHERE notice_id=${notices.id} AND user_id=${user.id})`,
  replied:sql<number>`EXISTS (SELECT 1 FROM notice_replies WHERE notice_id=${notices.id} AND user_id=${user.id})`,
  attachmentCount:sql<number>`(SELECT count(*) FROM notice_attachments WHERE notice_id=${notices.id} AND upload_status='complete')`,
  isRecipient:sql<number>`EXISTS (SELECT 1 FROM notice_receipts WHERE notice_id=${notices.id} AND user_id=${user.id})`
 }).from(notices).innerJoin(users,eq(users.id,notices.authorUserId)).where(condition).orderBy(desc(notices.createdAt),desc(notices.id)).limit(pageSize).offset((page-1)*pageSize);
 return Response.json({items:items.map(item=>({...item,actionRequired:Boolean(item.isRecipient&&(item.requiresReply?!item.replied:!item.readAt))})),total:total.total,unread:pending.total,pending:pending.total,page,pageSize});
}

export async function POST(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,"notice.publish"))return Response.json({error:"没有公告发布权限"},{status:403});
 try{
  const body=await request.json(),title=requiredText(body.title,"标题",120),message=requiredText(body.body,"正文",10000),targets=await recipients(body.audience);
  const rawFiles:unknown[]=Array.isArray(body.attachments)?body.attachments:[];
  const files=rawFiles.map((item:unknown)=>{const file=item&&typeof item==="object"?item as Record<string,unknown>:{},fileName=requiredText(file.fileName,"附件文件名",255),given=String(file.mimeType??"").toLowerCase();const mimeType=given||(/\.(jpe?g)$/i.test(fileName)?"image/jpeg":/\.png$/i.test(fileName)?"image/png":/\.webp$/i.test(fileName)?"image/webp":/\.gif$/i.test(fileName)?"image/gif":/\.mp4$/i.test(fileName)?"video/mp4":/\.webm$/i.test(fileName)?"video/webm":"");return {fileName,mimeType,fileSize:Number(file.fileSize)};});
  const images=files.filter(file=>["image/jpeg","image/png","image/webp","image/gif"].includes(file.mimeType)),videos=files.filter(file=>["video/mp4","video/webm"].includes(file.mimeType));
  if(files.length>9||images.length+videos.length!==files.length||videos.length>1||(videos.length&&files.length!==1))throw new InputError("公告附件请选择最多9张图片，或单独选择1个MP4/WebM视频");
  if(files.some(file=>!Number.isSafeInteger(file.fileSize)||file.fileSize<=0||file.fileSize>512*1024*1024)||files.reduce((sum,file)=>sum+file.fileSize,0)>1024*1024*1024)throw new InputError("单个附件不能超过512MB，总大小不能超过1GB");
  const db=getDb(),publishStatus=files.length?"uploading":"published";
  const [createdNotice]=await db.insert(notices).values({title,body:message,authorUserId:auth.user.id,materialIdsJson:"[]",requiresReply:body.requiresReply===true,publishStatus}).returning({id:notices.id});
  const id=createdNotice.id;
  let created:Array<typeof noticeAttachments.$inferSelect>=[];
  try{
   await db.insert(noticeReceipts).values(targets.map(userId=>({noticeId:id,userId})));
   created=files.length?await db.insert(noticeAttachments).values(files.map((file,index)=>({noticeId:id,position:index+1,...file,storagePath:`notices/${id}/${randomUUID()}`}))).returning():[];
  }catch(error){
   await db.delete(noticeReceipts).where(eq(noticeReceipts.noticeId,id));
   await db.delete(noticeAttachments).where(eq(noticeAttachments.noticeId,id));
   await db.delete(notices).where(eq(notices.id,id));
   throw error;
  }
  if(!files.length)await writeAudit(request,{userId:auth.user.id,action:"notice.publish",objectType:"notice",objectId:String(id),details:{recipientCount:targets.length,requiresReply:body.requiresReply===true,attachmentCount:0}});
  return Response.json({id,requiresFinalize:files.length>0,uploads:created.map(file=>({id:file.id,fileName:file.fileName,uploadUrl:`/api/notice-attachments/${file.id}/file`}))},{status:201});
 }catch(e){return communicationError(e);}
}

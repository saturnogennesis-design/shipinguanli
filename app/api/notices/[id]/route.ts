import {and,asc,eq,isNull,sql} from "drizzle-orm";
import {getDb} from "@/db";
import {noticeAttachments,noticeReceipts,noticeReplies,notices,users} from "@/db/schema";
import {requireUser} from "@/lib/server-auth";
import {communicationError,getNotice,InputError,requiredText} from "@/lib/communication";
import {getMediaStore} from "@/lib/media-store";
import {writeAudit} from "@/lib/audit";
type Context={params:Promise<{id:string}>};

export async function GET(request:Request,context:Context){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 try{
  const {row,receipt}=await getNotice(auth.user,Number((await context.params).id)),db=getDb();
  const canTrack=row.authorUserId===auth.user.id||auth.user.roleCode==="super_admin";
  const readers=canTrack?await db.select({userId:users.id,name:users.displayName,readAt:noticeReceipts.readAt,replied:sql<number>`EXISTS (SELECT 1 FROM notice_replies rp WHERE rp.notice_id=${noticeReceipts.noticeId} AND rp.user_id=${noticeReceipts.userId})`}).from(noticeReceipts).innerJoin(users,eq(users.id,noticeReceipts.userId)).where(eq(noticeReceipts.noticeId,row.id)).orderBy(asc(users.displayName)):[];
  const replies=await db.select({id:noticeReplies.id,userId:users.id,name:users.displayName,contentColor:users.contentColor,body:noticeReplies.body,createdAt:noticeReplies.createdAt}).from(noticeReplies).innerJoin(users,eq(users.id,noticeReplies.userId)).where(and(eq(noticeReplies.noticeId,row.id),canTrack?undefined:eq(noticeReplies.userId,auth.user.id))).orderBy(asc(noticeReplies.id));
  const attachments=await db.select({id:noticeAttachments.id,fileName:noticeAttachments.fileName,mimeType:noticeAttachments.mimeType,fileSize:noticeAttachments.fileSize,position:noticeAttachments.position}).from(noticeAttachments).where(and(eq(noticeAttachments.noticeId,row.id),eq(noticeAttachments.uploadStatus,"complete"))).orderBy(asc(noticeAttachments.position));
  const [author]=await db.select({name:users.displayName}).from(users).where(eq(users.id,row.authorUserId));
  const replied=Boolean(receipt&&replies.some(reply=>reply.userId===auth.user.id));
  return Response.json({...row,authorName:author?.name,canConfirmRead:Boolean(receipt&&!receipt.readAt),canReply:Boolean(receipt&&row.requiresReply),canTrack,readers,replies,replied,actionRequired:Boolean(receipt&&(row.requiresReply?!replied:!receipt.readAt)),attachments:attachments.map(file=>({...file,fileUrl:`/api/notice-attachments/${file.id}/file`}))});
 }catch(e){return communicationError(e);}
}

export async function POST(request:Request,context:Context){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 try{
  const id=Number((await context.params).id),body=await request.json(),db=getDb(),now=new Date().toISOString();
  const [raw]=await db.select().from(notices).where(eq(notices.id,id)).limit(1);if(!raw)throw new InputError("公告不存在",404);
  if(body.action==="publish"){
   if(raw.authorUserId!==auth.user.id&&auth.user.roleCode!=="super_admin")throw new InputError("只有发布人可以完成公告发布",403);
   if(raw.publishStatus!=="uploading")throw new InputError("公告已发布或状态不允许发布",409);
   const files=await db.select().from(noticeAttachments).where(eq(noticeAttachments.noticeId,id));
   if(!files.length||files.some(file=>file.uploadStatus!=="complete"))throw new InputError("附件尚未全部上传完成",409);
   await db.update(notices).set({publishStatus:"published"}).where(eq(notices.id,id));
   const [receipts]=await db.select({count:sql<number>`count(*)`}).from(noticeReceipts).where(eq(noticeReceipts.noticeId,id));
   await writeAudit(request,{userId:auth.user.id,action:"notice.publish",objectType:"notice",objectId:String(id),details:{recipientCount:receipts.count,requiresReply:raw.requiresReply,attachmentCount:files.length}});
   return Response.json({ok:true});
  }
  const {row,receipt}=await getNotice(auth.user,id);if(!receipt)throw new InputError("只有接收人可以确认已阅或回复",403);
  if(body.action==="read"){
   await db.update(noticeReceipts).set({readAt:now}).where(and(eq(noticeReceipts.id,receipt.id),isNull(noticeReceipts.readAt)));
   await writeAudit(request,{userId:auth.user.id,action:"notice.read_confirm",objectType:"notice",objectId:String(row.id)});
  }else if(body.action==="reply"){
   if(!row.requiresReply)throw new InputError("这条公告不要求回复",409);
   const message=requiredText(body.body,"回复",2000);
   await db.insert(noticeReplies).values({noticeId:row.id,userId:auth.user.id,body:message});
   await db.update(noticeReceipts).set({readAt:now}).where(and(eq(noticeReceipts.id,receipt.id),isNull(noticeReceipts.readAt)));
   await writeAudit(request,{userId:auth.user.id,action:"notice.reply",objectType:"notice",objectId:String(row.id)});
  }else throw new InputError("操作无效");
  return Response.json({ok:true});
 }catch(e){return communicationError(e);}
}

export async function DELETE(request:Request,context:Context){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 try{
  const id=Number((await context.params).id),db=getDb();const [row]=await db.select().from(notices).where(eq(notices.id,id)).limit(1);
  if(!row) return Response.json({ok:true});
  if(row.publishStatus!=="uploading"||row.authorUserId!==auth.user.id)throw new InputError("只能取消本人尚未发布完成的公告",403);
  const files=await db.select().from(noticeAttachments).where(eq(noticeAttachments.noticeId,id));
  await db.delete(noticeReceipts).where(eq(noticeReceipts.noticeId,id));await db.delete(noticeAttachments).where(eq(noticeAttachments.noticeId,id));await db.delete(notices).where(eq(notices.id,id));
  await Promise.all(files.map(file=>getMediaStore().delete(file.storagePath).catch(()=>undefined)));
  return Response.json({ok:true});
 }catch(e){return communicationError(e);}
}

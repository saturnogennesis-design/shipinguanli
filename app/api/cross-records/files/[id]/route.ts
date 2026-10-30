import {requireCross} from '@/lib/cross-auth';
import {getMediaStore} from '@/lib/media-store';
import {imageThumbnail} from '@/lib/image-thumbnail';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){
 const auth=await requireCross(request);if(!auth.user)return auth.response;const {db,user}=auth;
 const row=db.prepare('SELECT f.* FROM cross_files f JOIN cross_records r ON r.id=f.record_id WHERE f.id=? AND r.project_id=?').get(Number((await context.params).id),user.projectId!);
 if(!row)return Response.json({error:'图片不存在或无权查看'},{status:404});const object=await getMediaStore().get(String(row.storage_path));if(!object)return Response.json({error:'图片文件不存在'},{status:404});
 if(new URL(request.url).searchParams.get('thumb')==='1')return imageThumbnail(request,String(row.storage_path),object);
 const headers=new Headers({'cache-control':'private, no-store','x-content-type-options':'nosniff'});object.writeHttpMetadata(headers);return new Response(object.body,{headers});
}

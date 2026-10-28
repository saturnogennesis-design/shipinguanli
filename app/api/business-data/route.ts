import {getLocalDatabase} from '@/db';
import {requireUser} from '@/lib/server-auth';
export async function GET(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;const db=getLocalDatabase();
 const project=db.prepare('SELECT id,code,name,status FROM short_video_accounts WHERE id=?').get(auth.user.projectId!)!;
 const products=db.prepare("SELECT id,name,status,image_storage_path AS imageStoragePath FROM product_masters WHERE project_id=? AND status='active'").all(auth.user.projectId!);
 return Response.json({platforms:[],stores:[],accounts:[{...project,platformName:'',platformCode:''}],products:[],bindings:[],publishedContents:[],productMasters:products.map(row=>({...row,code:'PM-'+row.id,imageUrl:row.imageStoragePath?`/api/product-masters/${row.id}/image?projectId=${auth.user!.projectId}`:null}))});
}
export async function POST(){return Response.json({error:'旧平台和店铺管理已取消，请使用项目与发布目标管理'},{status:410});}
export const PUT=POST;export const PATCH=POST;

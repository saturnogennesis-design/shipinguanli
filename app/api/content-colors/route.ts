import {asc,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {users} from "@/db/schema";
import {requireUser,hasPermission} from "@/lib/server-auth";
import {employeePalette,employeeColor} from "@/lib/content-presentation";
import {writeAudit} from "@/lib/audit";
export async function GET(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,"admin.users"))return Response.json({error:"无权配置员工颜色"},{status:403});
 return Response.json({users:await getDb().select({id:users.id,name:users.displayName,color:users.contentColor}).from(users).orderBy(asc(users.displayName))});
}
export async function PATCH(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,"admin.users"))return Response.json({error:"无权配置员工颜色"},{status:403});
 const body=await request.json() as {id:number;color:string|null};
 if(body.color!==null&&!employeePalette.includes(body.color))return Response.json({error:"请选择中性色板中的颜色"},{status:400});
 const [user]=await getDb().select({id:users.id}).from(users).where(eq(users.id,body.id)).limit(1);
 if(!user)return new Response(null,{status:404});
 await getDb().update(users).set({contentColor:employeeColor(body.id,body.color)}).where(eq(users.id,body.id));
 await writeAudit(request,{userId:auth.user.id,action:"admin.employee_color",objectType:"user",objectId:String(body.id),details:{color:body.color}});
 return Response.json({ok:true});
}

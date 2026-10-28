import {eq,inArray} from "drizzle-orm";
import {getDb} from "@/db";
import {systemSettings} from "@/db/schema";
import {writeAudit} from "@/lib/audit";
import {hasPermission,requireUser} from "@/lib/server-auth";

const keys=["uploadTitlePlaceholder","imageTitlePlaceholder","contentRemarkPlaceholder","reviewRejectPlaceholder","reviewRecommendationPlaceholder","defaultPageSize","materialCategories","materialTags"] as const;
type SettingKey=(typeof keys)[number];
const defaults:Record<SettingKey,string>={uploadTitlePlaceholder:"",imageTitlePlaceholder:"",contentRemarkPlaceholder:"",reviewRejectPlaceholder:"",reviewRecommendationPlaceholder:"",defaultPageSize:"20",materialCategories:"产品展示\n使用演示\n场景氛围\n细节特写\n人物口播\n开箱过程\n对比效果\n包装物流\n其他",materialTags:"横屏\n竖屏\n室内\n室外\n近景\n中景\n远景\n人物出镜\n节日活动"};

export async function GET(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 const rows=await getDb().select().from(systemSettings).where(inArray(systemSettings.key,[...keys]));
 const settings={...defaults};for(const row of rows)settings[row.key as SettingKey]=row.valueText;
 return Response.json({settings,canManage:hasPermission(auth.user,"admin.settings")});
}

export async function PATCH(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,"admin.settings"))return Response.json({error:"没有管理配置中心的权限"},{status:403});
 const body=await request.json().catch(()=>({})) as {settings?:Record<string,unknown>};const incoming=body.settings??{};const db=getDb();const now=new Date().toISOString();
 for(const key of keys){
  if(!(key in incoming))continue;let value=String(incoming[key]??"").trim();
  if(key==="defaultPageSize")value=["20","50","100"].includes(value)?value:"20";
  const [existing]=await db.select({key:systemSettings.key}).from(systemSettings).where(eq(systemSettings.key,key)).limit(1);
  if(existing)await db.update(systemSettings).set({valueText:value,updatedByUserId:auth.user.id,updatedAt:now}).where(eq(systemSettings.key,key));
  else await db.insert(systemSettings).values({key,valueText:value,updatedByUserId:auth.user.id});
 }
 await writeAudit(request,{userId:auth.user.id,action:"system.settings_update",objectType:"system_settings",objectId:"ui",details:{keys:Object.keys(incoming).filter(key=>keys.includes(key as SettingKey))}});
 return Response.json({ok:true});
}

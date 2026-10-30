export type PermissionItem = { key:string; label:string; description:string; highRisk?:boolean };
export type PermissionGroup = { key:string; label:string; permissions:PermissionItem[] };

export const permissionGroups:PermissionGroup[] = [
  {key:'cross',label:'跨境项目',permissions:[
    {key:'cross.view',label:'查看跨境资料',description:'查看获授权跨境项目中的线索、母版和产品包'},
    {key:'cross.create',label:'制作与提交资料',description:'新建资料、维护本人负责的草稿并提交审核'},
    {key:'cross.review',label:'审核跨境资料',description:'确认母版、审核产品包并填写退回意见',highRisk:true},
    {key:'cross.assign',label:'维护项目资料',description:'维护授权项目内的草稿与退回资料，制作人仍记录上传人',highRisk:true},
    {key:'cross.download',label:'下载交付包',description:'下载审核通过的产品包交付文件',highRisk:true},
  ]},
  {key:"asset",label:"素材中心",permissions:[
    {key:"asset.view",label:"查看素材",description:"查看指定给本人的素材，下载另受素材设置约束"},
    {key:"asset.upload",label:"上传与维护素材",description:"按产品和项目上传、修改本人负责的素材套"},
    {key:"asset.review",label:"审核素材",description:"审核职责项目范围内的素材套",highRisk:true},
    {key:"asset.claim",label:"领取与下载素材",description:"领取所属项目下已经入库的素材套并下载原件"},
    {key:"asset.archive",label:"归档素材",description:"归档职责项目范围内的素材套",highRisk:true},
    {key:"asset.delete",label:"删除素材套",description:"将项目范围内的整套素材移入素材回收站并可恢复",highRisk:true},
  ]},
  {key:"notice",label:"通知公告",permissions:[
    {key:"notice.view",label:"查看与回复公告",description:"查看发给本人的通知并回复"},
    {key:"notice.publish",label:"发布公告",description:"向选定员工、部门或角色发布通知并查看回执"},
  ]},
  {key:"report",label:"工作报备",permissions:[
    {key:"report.create",label:"创建工作报备",description:"创建、保存和提交自己的日报"},
    {key:"report.receive",label:"接收工作报备",description:"作为接收人查看发给自己的日报"},
    {key:"report.cc",label:"抄送工作报备",description:"将已提交日报抄送给其他账号"},
    {key:"report.template_manage",label:"管理报备模板",description:"进入模板管理并配置哪些账号可以创建日报"},
  ]},
  { key:"content",label:"内容池",permissions:[
    {key:"content.view",label:"查看内容",description:"进入内容池并查看权限范围内的内容"},
    {key:"content.upload",label:"上传新内容",description:"创建视频或图文内容并上传文件"},
    {key:"content.edit",label:"编辑草稿",description:"修改草稿信息或替换草稿文件"},
    {key:"content.submit",label:"提交审核",description:"将草稿提交到审核中心"},
    {key:"content.withdraw",label:"撤回审核",description:"将尚未锁定的待审核内容撤回草稿"},
    {key:"content.archive",label:"归档审核内容",description:"结束非草稿内容的整条流程；推荐内容会在确认后取消推荐",highRisk:true},
    {key:"content.delete",label:"移入回收站",description:"删除允许删除的内容；推荐内容会在确认后取消推荐",highRisk:true},
    {key:"content.trash_purge",label:"永久删除回收站",description:"永久删除回收站记录及对应原始文件",highRisk:true},
    {key:"content.set_public",label:"设置公开",description:"将内容设为项目内公开",highRisk:true},
    {key:"content.feature",label:"取消推荐案例",description:"取消已经提交的推荐案例标记（兼容旧版本权限）",highRisk:true},
    {key:"content.download",label:"下载原件",description:"下载权限范围内的原始文件",highRisk:true},
  ]},
  { key:"review",label:"审核中心",permissions:[
    {key:"review.view",label:"查看待审核",description:"进入审核中心并查看待审核列表"},
    {key:"review.process",label:"执行审核",description:"领取队列、通过、驳回和提交审核结果",highRisk:true},
    {key:"review.recommend",label:"推荐案例",description:"审核时将当前文件版本推荐为项目内可见案例",highRisk:true},
    {key:"review.correct",label:"修正审核结果",description:"修正已经提交的审核结论",highRisk:true},
  ]},
  { key:"publishing",label:"发布管理",permissions:[
    {key:"publishing.view",label:"查看发布池",description:"查看审核通过和已发布内容"},
    {key:"publishing.assign",label:"维护目标发布资料",description:"选择发布目标、产品并维护发布文案"},
    {key:"publishing.status",label:"修改发布灯",description:"点亮或关闭目标账号发布状态灯",highRisk:true},
    {key:"publishing.download",label:"批量下载发布文件",description:"下载本人负责账号内的待发布原文件",highRisk:true},
    {key:"publishing.reassign",label:"释放或改派发布任务",description:"释放或改派已经被其他发布人员领取的内容",highRisk:true},
  ]},
  { key:"version",label:"版本管理",permissions:[
    {key:"version.view",label:"查看历史版本",description:"查看内容的历史文件版本"},
    {key:"version.upload",label:"上传新版本",description:"为已驳回内容上传新版本"},
    {key:"version.delete",label:"删除历史版本",description:"删除非最新的历史版本",highRisk:true},
  ]},
  { key:"business",label:"业务资料",permissions:[
    {key:"business.view",label:"查看业务资料",description:"查看项目业务资料"},
    {key:"business.products",label:"维护商品",description:"新增和编辑商品资料"},
    {key:"business.accounts",label:"管理项目与发布目标",description:"创建项目、配置发布目标账号"},
    {key:"business.product_masters",label:"维护素材产品库",description:"维护素材归类使用的产品图片和名称"},
  ]},
  { key:"analytics",label:"数据统计",permissions:[
    {key:"analytics.view",label:"查看统计",description:"查看已发布内容和统计数据"},
    {key:"analytics.edit",label:"录入平台数据",description:"录入播放、互动等平台表现数据"},
  ]},
  { key:"admin",label:"组织与权限",permissions:[
    {key:"admin.view",label:"查看组织资料",description:"查看角色、员工账号和部门"},
    {key:"admin.users",label:"管理员工账号",description:"创建、编辑、停用账号和重置密码",highRisk:true},
    {key:"admin.roles",label:"管理角色权限",description:"创建角色并修改权限和数据范围",highRisk:true},
    {key:"admin.departments",label:"管理部门",description:"创建和编辑组织部门"},
    {key:"admin.groups",label:"管理内容小组",description:"创建和编辑小组资料、负责人和工作规则"},
    {key:"admin.group_members",label:"配置小组成员",description:"设置员工主小组和跨组查看、上传、审核范围",highRisk:true},
    {key:"admin.settings",label:"管理配置中心",description:"配置界面提示词和系统默认展示规则",highRisk:true},
  ]},
  { key:"audit",label:"操作日志",permissions:[
    {key:"audit.view",label:"查看操作日志",description:"查看系统关键操作记录",highRisk:true},
  ]},
];

export const permissionKeys = permissionGroups.flatMap((group)=>group.permissions.map((permission)=>permission.key));

export type DutyPermissionInput = {
  primaryGroupId?:number|null;
  groupScopes?:Record<string,number[]>;
  accountResponsibilities?:Record<string,number[]>;
};

/** Responsibilities are operational assignments, so they carry the minimum
 * permissions required to complete that work. Roles remain the shared baseline. */
export function dutyPermissions(input:DutyPermissionInput){
  const permissions=new Set<string>();
  const scopes=input.groupScopes??{};
  const responsibilities=input.accountResponsibilities??{};
  const makesContent=Boolean(input.primaryGroupId)||(scopes.upload?.length??0)>0;
  if(makesContent){
    ["content.view","content.upload","content.edit","content.submit","content.withdraw","version.view","version.upload","asset.view","asset.claim"].forEach(key=>permissions.add(key));
  }
  if((scopes.view?.length??0)>0)["content.view","version.view"].forEach(key=>permissions.add(key));
  if((scopes.review?.length??0)>0)["content.view","content.download","review.view","review.process","version.view"].forEach(key=>permissions.add(key));
  if((responsibilities.materialUpload?.length??0)>0)["asset.view","asset.upload"].forEach(key=>permissions.add(key));
  if((responsibilities.materialReview?.length??0)>0)["asset.view","asset.review"].forEach(key=>permissions.add(key));
  if((responsibilities.publishing?.length??0)>0)["publishing.view","publishing.assign","publishing.status","publishing.download","business.view"].forEach(key=>permissions.add(key));
  return [...permissions];
}

const legacyGrants:Record<string,string[]> = {
  setPublic:["content.set_public"],
  review:["review.view","review.process","version.view"],
  correctReview:["review.correct"],
  publish:["publishing.view","publishing.assign","publishing.status","publishing.download","analytics.view","analytics.edit"],
  deleteVersion:["version.delete"],
  baseData:["business.view","business.products","business.accounts","business.platforms"],
  manageUsers:["admin.view","admin.users","admin.roles","admin.departments","admin.groups","admin.group_members","admin.settings","audit.view"],
  download:["content.download","version.view"],
  transfer:["content.edit","content.delete","version.upload"],
};

export function permissionGranted(granted:string[],requested:string) {
  if(granted.includes("*")||granted.includes(requested)) return true;
  if(requested==="review.recommend"&&granted.includes("content.feature")) return true;
  if(requested==="content.archive"&&granted.includes("content.delete")) return true;
  if(requested==="admin.settings"&&granted.includes("admin.roles")) return true;
  if(requested==="asset.claim"&&granted.includes("asset.view")) return true;
  if(requested==="business.product_masters"&&granted.includes("business.products")) return true;
  if(requested==="publishing.download"&&granted.includes("publishing.view")) return true;
  return Object.entries(legacyGrants).some(([legacy,implied])=>granted.includes(legacy)&&implied.includes(requested));
}

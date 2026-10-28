"use client";
import {useCallback,useEffect,useState} from 'react';
import {ModuleView} from './modules';
import {useBusinessContext,clearBusinessContext,readBusinessContext} from './business-context';
import {installProjectFetch} from '@/lib/client-project-fetch';
import {permissionGranted} from '@/lib/permissions';
import {ProjectManagement,TargetManagement,ContentCategories,projectApi} from './project-management';
import {DashboardNoticeDialog,DashboardPreview,type DashboardContent} from './workbench-widgets';
import {TargetPublishing} from './target-publishing';
type Project={id:number;name:string;code:string;groups:{id:number;name:string}[];capabilities:Record<string,boolean>};
type User={id:number;displayName:string;roleCode:string;permissions:string[]};
type RecentContent={code:string;title:string;status:string};
type DashboardData={summary:{total:number;draft:number;review:number;approved:number};publishing:{contents:number;targetPublications:number}|null;recent:RecentContent[];reviewTasks:RecentContent[];recommendations:DashboardContent[]};
type ProjectGroup={id:number;name:string;description:string|null};
type Metric={id:number;recorded_on:string;contentTitle:string;targetName:string;views:number;likes:number;operatorName:string};
type StatisticsData={totals:{contentCount:number;publicationCount:number};targets:{id:number;name:string;publishedCount:number}[];published:{id:number;title:string;targetName:string}[];metrics:Metric[];canEdit:boolean};
type NoticeTask={id:number;title:string;requiresReply:boolean;actionRequired:boolean};
function ProjectDashboard({navigate}:{navigate:(name:string,target?:string)=>void}){
 const [preview,setPreview]=useState<DashboardContent|null>(null);
 const [data,setData]=useState<DashboardData|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;projectApi('/api/dashboard').then(value=>{if(live)setData(value);}).catch(error=>{if(live)setError(error.message);});return()=>{live=false;};},[]);
 return <section className="panel project-module"><h2>项目工作台</h2>{error?<p role="alert">{error}</p>:!data?<p>正在读取项目数据…</p>:<><div className="project-summary"><article><strong>{data.summary.total??0}</strong><span>可见内容</span></article><article><strong>{data.summary.draft??0}</strong><span>草稿</span></article><article><strong>{data.summary.review??0}</strong><span>待审核／审核中</span></article><article><strong>{data.summary.approved??0}</strong><span>已通过</span></article></div>{data.publishing?<p>已发布内容 {data.publishing.contents} 条 · 目标账号发布 {data.publishing.targetPublications} 次</p>:null}{data.reviewTasks.length?<><h3>待审核任务</h3>{data.reviewTasks.map(row=><p key={row.code}><button onClick={()=>navigate('审核中心')}>{row.title} · {row.status==='reviewing'?'审核中':'待审核'}</button></p>)}</>:null}<h3>我的待办与最近内容</h3>{data.recent.map((row:RecentContent)=><p key={row.code}><button onClick={()=>navigate('内容池',row.code)}>{row.title}</button> · {({draft:'草稿',pending:'待审核',reviewing:'审核中',approved:'已通过',rejected:'已驳回'} as Record<string,string>)[row.status]??row.status}</p>)}<h3>推荐案例</h3>{data.recommendations?.map((item:DashboardContent)=><button className="project-recommendation" key={item.recommendedVersionId} onClick={()=>setPreview(item)}>{item.title} · {item.featuredReason}</button>)}</>}{preview?<DashboardPreview item={preview} versionNumber={preview.recommendedVersionNumber} onClose={()=>setPreview(null)}/>:null}</section>;
}
function ProjectGroups(){const [groups,setGroups]=useState<ProjectGroup[]>([]),[error,setError]=useState('');useEffect(()=>{projectApi('/api/groups?scope=membership').then(data=>setGroups(data.groups)).catch(error=>setError(error.message));},[]);return <section className="panel project-module"><h2>内容小组</h2>{error?<p role="alert">{error}</p>:groups.map(group=><article className="project-management-row" key={group.id}><strong>{group.name}</strong><span>{group.description}</span></article>)}<p>小组成员和职责由管理员在系统外层“组织与权限”中维护。</p></section>;}
function ProjectStatistics(){
 const [data,setData]=useState<StatisticsData|null>(null),[error,setError]=useState(''),[recordId,setRecordId]=useState(''),[views,setViews]=useState(''),[likes,setLikes]=useState('');
 async function load(){setData(await projectApi('/api/analytics'));}
 useEffect(()=>{projectApi('/api/analytics').then(setData).catch(error=>setError(error.message));},[]);
 return <section className="panel project-module"><h2>项目数据统计</h2>{error?<p role="alert">{error}</p>:data?<><p>已发布内容：{data.totals.contentCount} 条；目标账号发布：{data.totals.publicationCount} 次</p>{data.targets.map(row=><p key={row.id}>{row.name}：{row.publishedCount} 次</p>)}{data.canEdit?<form onSubmit={async event=>{event.preventDefault();try{await projectApi('/api/analytics',{recordId:Number(recordId),recordedOn:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}),views:Number(views),likes:Number(likes)});await load();}catch(error){setError((error as Error).message);}}}><h3>录入发布表现</h3><select aria-label="选择已发布记录" value={recordId} required onChange={event=>setRecordId(event.target.value)}><option value="">请选择内容及目标账号</option>{data.published.map(row=><option key={row.id} value={row.id}>{row.title} · {row.targetName}</option>)}</select><input aria-label="播放量" type="number" min="0" placeholder="播放量" value={views} onChange={event=>setViews(event.target.value)}/><input aria-label="点赞量" type="number" min="0" placeholder="点赞量" value={likes} onChange={event=>setLikes(event.target.value)}/><button>保存今日数据</button></form>:null}<h3>历史录入</h3>{data.metrics.map((row:Metric)=><p key={row.id}>{row.recorded_on} · {row.contentTitle} · {row.targetName} · 播放 {row.views} · 点赞 {row.likes} · {row.operatorName}</p>)}</>:<p>正在读取…</p>}</section>;
}
export function ProjectShell(){
 installProjectFetch();
 const {context,setContext}=useBusinessContext();const [projects,setProjects]=useState<Project[]>([]),[user,setUser]=useState<User|null>(null),[nav,setNav]=useState('系统首页'),[epoch,setEpoch]=useState(0),[message,setMessage]=useState(''),[error,setError]=useState(''),[targetCode,setTargetCode]=useState(''),[noticeTarget,setNoticeTarget]=useState<number|null>(null),[noticeTasks,setNoticeTasks]=useState<NoticeTask[]>([]);
 const [icons,setIcons]=useState<Record<string,string>>({});
 const refresh=useCallback(async()=>{const [data,auth]=await Promise.all([projectApi('/api/projects'),projectApi('/api/auth/me')]);setProjects(data.projects);setUser(auth.user);const current=readBusinessContext();if(current&&!data.projects.some((project:Project)=>project.id===current.accountId)){clearBusinessContext();setNav('系统首页');setEpoch(value=>value+1);}},[]);
 useEffect(()=>{const first=setTimeout(()=>void refresh().catch(error=>setError(error.message)),0);const timer=setInterval(()=>void refresh().catch(()=>{}),30000);return()=>{clearTimeout(first);clearInterval(timer);};},[refresh]);
 const can=(permission:string)=>user?.roleCode==='super_admin'||permissionGranted(user?.permissions??[],permission);
 const project=projects.find(project=>project.id===context?.accountId);
 function enter(id:number){const next=projects.find(project=>project.id===id);if(!next)return;if(!window.confirm(`确定${context?'切换到':'进入'}“${next.name}”项目吗？未保存的内容将自动清除，随后进入项目工作台。`))return;setNoticeTarget(null);sessionStorage.removeItem('orbit:content-pool-state');setContext({accountId:next.id,accountCode:next.code,accountName:next.name,platformCode:'',platformName:'',groupId:null,groupName:null});setTargetCode('');setNav('项目工作台');setEpoch(value=>value+1);setMessage('');}
 function global(name:string,target=''){setTargetCode(target);setNav(name);setEpoch(value=>value+1);}
 const notify=useCallback((message:string)=>setMessage(message),[]);
 const canNotice=Boolean(can('notice.view'));
 const loadNotices=useCallback(async()=>{if(!canNotice)return;const rules=encodeURIComponent(JSON.stringify([{field:'readState',operator:'eq',value:'待处理',join:'and'}]));const data=await projectApi('/api/notices?rules='+rules);setNoticeTasks(data.items.filter((row:NoticeTask)=>row.actionRequired).slice(0,5));},[canNotice]);
 useEffect(()=>{const first=setTimeout(()=>void loadNotices().catch(()=>{}),0);const timer=setInterval(()=>void loadNotices().catch(()=>{}),30000);return()=>{clearTimeout(first);clearInterval(timer);};},[loadNotices]);
 const globalNav=[['系统首页',''],['通知公告','notice.view'],['工作报备','report.create'],['项目管理','business.accounts'],['发布目标账号管理','business.accounts'],['组织与权限','admin.view'],['报备模板','report.template_manage'],['配置中心','admin.settings'],['操作日志','audit.view']];
 const projectNav=[['项目工作台',''],['素材中心','assets'],['产品库','products'],['内容小组','content'],['内容池','content'],['审核中心','review'],['发布管理','publishing'],['版本管理','versions'],['业务分类','manage'],['数据统计','analytics']];

 const globalPage=globalNav.some(([name])=>name===nav);
 const visibleGlobal=globalNav.filter(([name,key])=>!key||can(key)||(name==='工作报备'&&(can('report.receive')||can('report.cc'))));
 const globalButton=([name]:string[])=><button className={nav===name?'active':''} aria-current={nav===name?'page':undefined} key={name} onClick={()=>global(name)}>{name}</button>;
 return <main className="project-app"><aside className="project-sidebar"><h1>内容中台</h1>
 <nav className="project-global-nav" aria-label="全局事项">{visibleGlobal.slice(0).filter(([name])=>['系统首页','通知公告','工作报备'].includes(name)).map(globalButton)}</nav>
 <section className="project-navigation" aria-label="项目导航"><div className="project-tab-column"><small id="project-tabs-label">项目</small><div className="project-tabs" role="tablist" aria-labelledby="project-tabs-label" aria-orientation="vertical">{projects.map(item=><button id={`project-tab-${item.id}`} role="tab" aria-selected={project?.id===item.id} aria-controls="project-module-navigation" tabIndex={!project||project.id===item.id?0:-1} key={item.id} title={item.name} onClick={()=>enter(item.id)} onKeyDown={event=>{const index=projects.findIndex(row=>row.id===item.id);const offset=event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0;if(offset||event.key==='Home'||event.key==='End'){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?projects.length-1:(index+offset+projects.length)%projects.length;document.getElementById(`project-tab-${projects[next].id}`)?.focus();}else if(event.key===' '){event.preventDefault();enter(item.id);}}}>{item.name}</button>)}</div></div>
 <div className="project-module-navigation" id="project-module-navigation" role="tabpanel" aria-labelledby={project?`project-tab-${project.id}`:'project-tabs-label'}>{project?<><strong className="project-sidebar-name">{project.name}</strong><nav aria-label="项目二级导航">{projectNav.filter(([,key])=>!key||(key==='manage'?can('business.accounts'):project.capabilities[key])).map(globalButton)}</nav></>:<p>选择项目<br/>开始工作</p>}</div></section>
 <nav className="project-system-nav" aria-label="系统操作与全局配置"><small>系统与全局配置</small><div>{visibleGlobal.filter(([name])=>!['系统首页','通知公告','工作报备'].includes(name)).map(globalButton)}</div></nav>
 </aside><section className="project-workspace"><header className="project-topbar"><div><small>{globalPage?'系统外层':`当前项目：${project?.name??''}`}</small><h1>{nav}</h1></div><span>{user?.displayName}</span><button onClick={async()=>{await fetch('/api/auth/logout',{method:'POST'});clearBusinessContext();window.location.reload();}}>退出登录</button></header>{message?<div role="status" className="project-message">{message}<button aria-label="关闭提示" onClick={()=>setMessage('')}>×</button></div>:null}{error?<p role="alert">{error}</p>:null}<div className="project-content" key={`${context?.accountId??'global'}-${nav}-${epoch}`}>
 {nav==='系统首页'?<section className="panel project-module"><h2>选择项目开始工作</h2><p>公告和日报在系统外层使用；项目内的产品、素材、内容和发布业务分别隔离。切换项目后统一进入该项目工作台。</p>{can('notice.view')?<><h3>待处理通知</h3>{noticeTasks.length?noticeTasks.map(item=><button className="project-pending-notice" key={item.id} onClick={()=>setNoticeTarget(item.id)}>{item.title} · {item.requiresReply?'待回复':'待确认已阅'}</button>):<p>暂无待处理通知</p>}</>:null}<div className="project-cards">{projects.map(project=><button key={project.id} onClick={()=>enter(project.id)}><strong>{project.name}</strong><span>进入项目 →</span></button>)}</div>{!projects.length?<p>尚未分配项目，可使用有权限的外层功能。请联系管理员配置项目职责或小组范围。</p>:null}</section>:
 nav==='项目管理'?<ProjectManagement onChanged={()=>void refresh()} notify={notify}/>:
 nav==='发布目标账号管理'?<TargetManagement notify={notify}/>:
 nav==='项目工作台'?<ProjectDashboard navigate={global}/>:
 nav==='发布管理'?<TargetPublishing notify={notify}/>:
 nav==='业务分类'?<ContentCategories notify={notify}/>:
 nav==='内容小组'?<ProjectGroups/>:
 nav==='数据统计'?<ProjectStatistics/>:
 <ModuleView name={nav} notify={notify} navigate={global} platformIcons={icons} setPlatformIcons={setIcons} versionTarget={targetCode} contentTarget={targetCode}/>}
 </div>{noticeTarget?<DashboardNoticeDialog id={noticeTarget} onClose={()=>setNoticeTarget(null)} onChanged={loadNotices} notify={notify}/>:null}</section></main>;
}

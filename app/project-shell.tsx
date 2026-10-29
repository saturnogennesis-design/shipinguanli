"use client";
import {useCallback,useEffect,useState} from 'react';
import {ModuleView} from './modules';
import {useBusinessContext,clearBusinessContext,readBusinessContext} from './business-context';
import {installProjectFetch} from '@/lib/client-project-fetch';
import {permissionGranted} from '@/lib/permissions';
import {ProjectManagement,projectApi} from './project-management';
import {DashboardNoticeDialog} from './workbench-widgets';
import {ProjectDashboard} from './project-dashboard';
import {ProjectStatistics} from './project-statistics';
import {ViewportTables} from './viewport-tables';
import {TargetPublishing} from './target-publishing';
type Project={id:number;name:string;code:string;groups:{id:number;name:string}[];capabilities:Record<string,boolean>};
type User={id:number;displayName:string;roleCode:string;permissions:string[]};
type NoticeTask={id:number;title:string;requiresReply:boolean;actionRequired:boolean};
export function ProjectShell(){
 installProjectFetch();
 const {context,setContext}=useBusinessContext();const [projects,setProjects]=useState<Project[]>([]),[user,setUser]=useState<User|null>(null),[nav,setNav]=useState('系统首页'),[epoch,setEpoch]=useState(0),[message,setMessage]=useState(''),[error,setError]=useState(''),[targetCode,setTargetCode]=useState(''),[noticeTarget,setNoticeTarget]=useState<number|null>(null),[noticeTasks,setNoticeTasks]=useState<NoticeTask[]>([]);
 const [messageTone,setMessageTone]=useState<'success'|'error'>('success');
 useEffect(()=>{if(!message)return;const timer=setTimeout(()=>setMessage(''),messageTone==='error'?6000:3000);return()=>clearTimeout(timer);},[message,messageTone]);
 const [collapsed,setCollapsed]=useState(false);
 useEffect(()=>{const frame=requestAnimationFrame(()=>{if(window.matchMedia('(max-width:760px)').matches)setCollapsed(true);});return()=>cancelAnimationFrame(frame);},[]);
 const [icons,setIcons]=useState<Record<string,string>>({});
 const refresh=useCallback(async()=>{const [data,auth]=await Promise.all([projectApi('/api/projects'),projectApi('/api/auth/me')]);setProjects(data.projects);setUser(auth.user);const current=readBusinessContext();if(current&&!data.projects.some((project:Project)=>project.id===current.accountId)){clearBusinessContext();setNav('系统首页');setEpoch(value=>value+1);}},[]);
 useEffect(()=>{const first=setTimeout(()=>void refresh().catch(error=>setError(error.message)),0);const timer=setInterval(()=>void refresh().catch(()=>{}),30000);return()=>{clearTimeout(first);clearInterval(timer);};},[refresh]);
 const can=(permission:string)=>user?.roleCode==='super_admin'||permissionGranted(user?.permissions??[],permission);
 const project=projects.find(project=>project.id===context?.accountId);
 function enter(id:number){const next=projects.find(project=>project.id===id);if(!next)return;if(!window.confirm(`确定${context?'切换到':'进入'}“${next.name}”项目吗？未保存的内容将自动清除，随后进入项目工作台。`))return;setNoticeTarget(null);sessionStorage.removeItem('orbit:content-pool-state');setContext({accountId:next.id,accountCode:next.code,accountName:next.name,platformCode:'',platformName:'',groupId:null,groupName:null});setTargetCode('');setNav('项目工作台');setEpoch(value=>value+1);setMessage('');}
 function global(name:string,target=''){setTargetCode(target);setNav(name);setEpoch(value=>value+1);}
 const notify=useCallback((message:string,tone?:'success'|'error')=>{setMessage(message);setMessageTone(tone??(/失败|错误|无权|没有.*权限|不能|请先|不存在|缺失|未连接|无效|尚未/.test(message)?'error':'success'));},[]);
 const canNotice=Boolean(can('notice.view'));
 const loadNotices=useCallback(async()=>{if(!canNotice)return;const rules=encodeURIComponent(JSON.stringify([{field:'readState',operator:'eq',value:'待处理',join:'and'}]));const data=await projectApi('/api/notices?rules='+rules);setNoticeTasks(data.items.filter((row:NoticeTask)=>row.actionRequired).slice(0,5));},[canNotice]);
 useEffect(()=>{const first=setTimeout(()=>void loadNotices().catch(()=>{}),0);const timer=setInterval(()=>void loadNotices().catch(()=>{}),30000);return()=>{clearTimeout(first);clearInterval(timer);};},[loadNotices]);
 const globalNav=[['系统首页',''],['通知公告','notice.view'],['工作报备','report.create'],['项目管理','business.accounts'],['组织与权限','admin.view'],['报备模板','report.template_manage'],['配置中心','admin.settings'],['操作日志','audit.view']];
 const projectNav=[['项目工作台',''],['素材中心','assets'],['产品库','products'],['内容池','content'],['审核中心','review'],['发布管理','publishing'],['版本管理','versions'],['数据统计','analytics']];

 const globalPage=globalNav.some(([name])=>name===nav);
 const visibleGlobal=globalNav.filter(([name,key])=>!key||can(key)||(name==='工作报备'&&(can('report.receive')||can('report.cc'))));
 const globalButton=([name]:string[])=><button className={nav===name?'active':''} aria-current={nav===name?'page':undefined} key={name} onClick={()=>global(name)}>{name}</button>;
 return <main className={collapsed?"project-app navigation-collapsed":"project-app"}><aside className="project-sidebar" id="primary-navigation" hidden={collapsed}><h1>内容中台</h1>
 <nav className="project-global-nav" aria-label="全局事项">{visibleGlobal.slice(0).filter(([name])=>['系统首页','通知公告','工作报备'].includes(name)).map(globalButton)}</nav>
 <section className="project-navigation" aria-label="项目导航"><div className="project-tab-column"><small id="project-tabs-label">项目</small><div className="project-tabs" role="tablist" aria-labelledby="project-tabs-label" aria-orientation="vertical">{projects.map(item=><button id={`project-tab-${item.id}`} role="tab" aria-selected={project?.id===item.id} aria-controls="project-module-navigation" tabIndex={!project||project.id===item.id?0:-1} key={item.id} title={item.name} onClick={()=>enter(item.id)} onKeyDown={event=>{const index=projects.findIndex(row=>row.id===item.id);const offset=event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0;if(offset||event.key==='Home'||event.key==='End'){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?projects.length-1:(index+offset+projects.length)%projects.length;document.getElementById(`project-tab-${projects[next].id}`)?.focus();}else if(event.key===' '){event.preventDefault();enter(item.id);}}}>{item.name}</button>)}</div></div>
 <div className="project-module-navigation" id="project-module-navigation" role="tabpanel" aria-labelledby={project?`project-tab-${project.id}`:'project-tabs-label'}>{project?<><strong className="project-sidebar-name">{project.name}</strong><nav aria-label="项目二级导航">{projectNav.filter(([,key])=>!key||(key==='manage'?can('business.accounts'):project.capabilities[key])).map(globalButton)}</nav></>:<p>选择项目<br/>开始工作</p>}</div></section>
 <nav className="project-system-nav" aria-label="系统操作与全局配置"><small>系统与全局配置</small><div>{visibleGlobal.filter(([name])=>!['系统首页','通知公告','工作报备'].includes(name)).map(globalButton)}</div></nav>
 </aside><section className="project-workspace"><header className="project-topbar"><button className="navigation-toggle" aria-controls="primary-navigation" aria-expanded={!collapsed} onClick={()=>setCollapsed(value=>!value)} aria-label={collapsed?"展开导航":"收起导航"}>{collapsed?"☰ 展开导航":"☰ 收起导航"}</button><div><small>{globalPage?'系统外层':`当前项目：${project?.name??''}`}</small><h1>{nav}</h1></div><span>{user?.displayName}</span><button onClick={async()=>{await fetch('/api/auth/logout',{method:'POST'});clearBusinessContext();window.location.reload();}}>退出登录</button></header>{message?<div role={messageTone==='error'?'alert':'status'} className={`toast global-toast ${messageTone}`}><span>{messageTone==='error'?'!':'✓'}</span><strong>{message}</strong><button aria-label="关闭提示" onClick={()=>setMessage('')}>×</button></div>:null}{error?<p role="alert">{error}</p>:null}<div className="project-content" key={`${context?.accountId??'global'}-${nav}-${epoch}`}>
 {nav==='系统首页'?<section className="panel project-module"><h2>选择项目开始工作</h2><p>公告和日报在系统外层使用；项目内的产品、素材、内容和发布业务分别隔离。切换项目后统一进入该项目工作台。</p>{can('notice.view')?<><h3>待处理通知</h3>{noticeTasks.length?noticeTasks.map(item=><button className="project-pending-notice" key={item.id} onClick={()=>setNoticeTarget(item.id)}>{item.title} · {item.requiresReply?'待回复':'待确认已阅'}</button>):<p>暂无待处理通知</p>}</>:null}<div className="project-cards">{projects.map(project=><button key={project.id} onClick={()=>enter(project.id)}><strong>{project.name}</strong><span>进入项目 →</span></button>)}</div>{!projects.length?<p>尚未分配项目，可使用有权限的外层功能。请联系管理员配置项目职责或小组范围。</p>:null}</section>:
 nav==='项目管理'?<ProjectManagement onChanged={()=>void refresh()} notify={notify}/>:
 nav==='项目工作台'?<ProjectDashboard navigate={global} displayName={user?.displayName??""} capabilities={project?.capabilities??{}} canManageRecommendations={Boolean(can('content.feature')||can('review.recommend'))} notify={notify}/>:
 nav==='发布管理'?<TargetPublishing notify={notify}/>:
 nav==='数据统计'?<ProjectStatistics/>:
 <ModuleView name={nav} notify={notify} navigate={global} platformIcons={icons} setPlatformIcons={setIcons} versionTarget={targetCode} contentTarget={targetCode}/>}
 </div>{noticeTarget?<DashboardNoticeDialog id={noticeTarget} onClose={()=>setNoticeTarget(null)} onChanged={loadNotices} notify={notify}/>:null}</section><ViewportTables/></main>;
}

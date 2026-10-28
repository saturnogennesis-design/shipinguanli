"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ModuleView, type PlatformIcons } from "./modules";
import { AuthGate } from "./auth-gate";
import {employeeColor} from "@/lib/content-presentation";
import {ContentPreview} from "./content-preview";
import {CenterDialog} from "./communication-center";
import { permissionGranted } from "@/lib/permissions";
import { clearBusinessContext, useBusinessContext } from "./business-context";

type NoticeTone = "success" | "error";
type DashboardContent = {
  id: number;
  code: string;
  title: string;
  contentType: string;
  productName: string | null;
  productCode: string | null;
  uploaderUserId: number;
  uploaderName: string;
  contentColor?:string|null;
  visibility: string;
  reviewStatus: string;
  latestVersionNumber: number;
  activityAt?: string;
  taskPriority?: number;
  featured?: boolean;
  featuredReason?: string;
  featuredAt?: string | null;
  recommendationDecision?: string;
  recommendedVersionId?: number;
  recommendedVersionNumber?: number;
  createdAt: string;
  updatedAt: string;
};
type ReviewTask = {
  id: number;
  code: string;
  title: string;
  contentType: string;
  uploaderName: string;
  uploaderUserId?:number;
  contentColor?:string|null;
  reviewStatus: string;
  versionNumber: number;
  submittedAt: string;
  waitingHours: number;
  priority: number;
  lockedByCurrent?:boolean;
  updatedAt?:string;
};
type DashboardNotice={id:number;title:string;body:string;authorName:string;authorUserId:number;contentColor?:string|null;requiresReply:boolean;readAt:string|null;replied:boolean;attachmentCount:number;createdAt:string;statusText:string};
type DashboardData = {
  user: {
    id?: number;
    displayName: string;
    roleName: string;
    roleCode: string;
    dataScope: string;
    permissions: string[];
    deniedPermissions?:string[];
    moduleAccess?:Record<string,boolean>;
    canReview?: boolean;
    canProcessReview?: boolean;
  };
  summary: {
    pendingReview: number;
    reviewing: number;
    pendingPublish: number;
    publishedThisMonth: number;
    publishedThisWeek: number;
    totalAssets: number;
    videoAssets: number;
    imageTextAssets: number;
    privateAssets: number;
    approved: number;
  };
  statusCounts: Record<string, number>;
  contentTasks: DashboardContent[];
  recent: DashboardContent[];
  reviewTasks: ReviewTask[];
  noticeTasks:DashboardNotice[];
  featured: DashboardContent[];
  checkedAt: string;
};
const emptyDashboard: DashboardData = {
  user: { displayName: "当前用户", roleName: "", roleCode: "", dataScope: "self", permissions: [] },
  summary: { pendingReview: 0, reviewing: 0, pendingPublish: 0, publishedThisMonth: 0, publishedThisWeek: 0, totalAssets: 0, videoAssets: 0, imageTextAssets: 0, privateAssets: 0, approved: 0 },
  statusCounts: {}, contentTasks: [], recent: [], reviewTasks: [], noticeTasks:[], featured: [], checkedAt: "",
};
const reviewLabels: Record<string, string> = { draft: "草稿", pending: "待审核", reviewing: "审核中", approved: "已通过", rejected: "已驳回" };
const formatServerTime = (value?: string) => {
  if(!value)return "—";
  const normalized = /[zZ]$|[+-]\d\d:\d\d$/.test(value) ? value : value.includes("T") ? `${value}Z` : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
};
const inferNoticeTone = (message: string): NoticeTone => /失败|错误|无权|没有.*权限|不能|请先|不存在|缺失|未连接|无效|尚未/.test(message) ? "error" : "success";

function DashboardPreview({ item, versionNumber, onClose, backLabel="返回工作台" }: { item: DashboardContent | ReviewTask; versionNumber?: number; onClose: () => void;backLabel?:string }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [message, setMessage] = useState("正在读取预览…");
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/contents/${encodeURIComponent(item.code)}/versions`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { error?: string; versions?: Array<{ versionNumber: number; current: boolean; fileUrl?: string | null; files?: Array<{ fileUrl: string | null }> }> };
        if (!response.ok) throw new Error(data.error ?? "内容暂时无法打开");
        const selected = data.versions?.find((version) => version.versionNumber === versionNumber) ?? data.versions?.find((version) => version.current);
        const previewUrls = item.contentType === "video"
          ? [selected?.fileUrl].filter((url): url is string => Boolean(url))
          : (selected?.files ?? []).map((file) => file.fileUrl).filter((url): url is string => Boolean(url));
        if (!cancelled) { setUrls(previewUrls); setMessage(previewUrls.length ? "" : "原文件不存在、尚未上传完成或存储盘未连接"); }
      })
      .catch((error: unknown) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "内容暂时无法打开"); });
    return () => { cancelled = true; };
  }, [item.code, item.contentType, versionNumber]);
  return <div className="dashboard-preview-backdrop" onClick={onClose}>
    <section className="dashboard-preview" onClick={(event) => event.stopPropagation()}>
      <header><div><small>{item.code}</small><h2>{item.title}</h2><p>{item.uploaderName} · {item.contentType === "video" ? "视频" : "图文"} · V{versionNumber ?? ("latestVersionNumber" in item ? item.latestVersionNumber : item.versionNumber)}</p></div><button onClick={onClose}>×</button></header>
      <div className="dashboard-preview-media">
        {urls.length && item.contentType === "video" ? <video controls preload="metadata" src={urls[0]} onError={() => setMessage("视频编码不受当前浏览器支持，或原文件暂时不可读取")} /> : null}
        {urls.length && item.contentType !== "video" ? <div className="dashboard-preview-images">{urls.map((url, index) => <img src={url} alt={`${item.title} 第${index + 1}张`} key={url} />)}</div> : null}
        {message ? <div className="dashboard-preview-message">{message}</div> : null}
      </div>
      <footer><button onClick={onClose}>{backLabel}</button></footer>
    </section>
  </div>;
}

function DashboardNoticeDialog({id,onClose,onChanged,notify}:{id:number;onClose:()=>void;onChanged:()=>Promise<void>;notify:(message:string,tone?:NoticeTone)=>void}){
 const [detail,setDetail]=useState<null|{id:number;title:string;body:string;authorName:string;createdAt:string;requiresReply:boolean;canConfirmRead:boolean;canReply:boolean;replied:boolean;attachments:Array<{id:number;fileName:string;mimeType:string;fileUrl:string}>}>(null),[reply,setReply]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const load=useCallback(async()=>{const response=await fetch(`/api/notices/${id}`,{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error??"公告暂时无法打开");setDetail(data);},[id]);
 useEffect(()=>{void load().catch(error=>setError(error.message));},[load]);
 const act=async(action:"read"|"reply")=>{if(busy)return;setBusy(true);try{const response=await fetch(`/api/notices/${id}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(action==="reply"?{action,body:reply}:{action})});const data=await response.json();if(!response.ok)throw new Error(data.error??"操作失败");await load();await onChanged();window.dispatchEvent(new Event("orbit-notices-changed"));if(action==="reply")setReply("");notify(action==="reply"?"回复已发送，待处理提醒已完成":detail?.requiresReply?"已确认阅读，请按要求回复":"已确认阅读","success");}catch(error){notify(error instanceof Error?error.message:"操作失败","error");}finally{setBusy(false);}};
 return <CenterDialog title={detail?.title??"待处理通知"} onClose={onClose} closeDisabled={busy}>{error?<p role="alert">{error}</p>:!detail?<div className="empty-state">正在读取公告…</div>:<><small>{detail.authorName} · {formatServerTime(detail.createdAt)}{detail.requiresReply?" · 要求回复":""}</small><p className="communication-body">{detail.body}</p>{detail.attachments.length?<div className={`notice-direct-attachments ${detail.attachments[0].mimeType.startsWith("video/")?"video":"images"}`}>{detail.attachments.map(file=>file.mimeType.startsWith("video/")?<video key={file.id} controls preload="metadata" src={file.fileUrl}/>:<img key={file.id} src={file.fileUrl} alt={file.fileName}/>)}</div>:null}{detail.canConfirmRead?<footer><button className="primary-button" disabled={busy} onClick={()=>void act("read")}>确认已阅</button></footer>:null}{detail.canReply?<form className="dashboard-notice-reply" onSubmit={event=>{event.preventDefault();void act("reply");}}><label><span>{detail.replied?"继续回复":"回复内容"}</span><textarea required maxLength={2000} value={reply} onChange={event=>setReply(event.target.value)}/></label><button className="primary-button" disabled={busy||!reply.trim()}>发送回复</button></form>:null}</>}</CenterDialog>;
}

function RecommendationDialog({items,canCancel,onPreview,onClose,onChanged,notify}:{items:DashboardContent[];canCancel:boolean;onPreview:(item:DashboardContent)=>void;onClose:()=>void;onChanged:()=>Promise<void>;notify:(message:string,tone?:NoticeTone)=>void}) {
  const [busyCode,setBusyCode]=useState("");
  const cancelRecommendation=async(item:DashboardContent)=>{
    if(!window.confirm(`确认取消“${item.title}”的推荐？\n\n取消后不会删除内容，内容原有公开范围保持不变。`))return;
    setBusyCode(item.code);
    try{
      const response=await fetch(`/api/contents/${encodeURIComponent(item.code)}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"unfeature"})});
      const data=await response.json() as {error?:string};
      if(!response.ok)throw new Error(data.error??"取消推荐失败");
      await onChanged();notify("已取消推荐案例");
    }catch(error){notify(error instanceof Error?error.message:"取消推荐失败","error");}
    finally{setBusyCode("");}
  };
  return <div className="recommendation-dialog-backdrop" onClick={onClose}>
    <section className="recommendation-dialog" onClick={event=>event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="recommendation-dialog-title">
      <header><div><small>工作台 / 快捷查看</small><h2 id="recommendation-dialog-title">推荐案例</h2></div><button aria-label="关闭推荐案例" onClick={onClose}>×</button></header>
      <div className="recommendation-dialog-list">
        <table><thead><tr><th>内容</th><th>类型</th><th>上传人</th><th>版本</th><th>审核结果</th><th>推荐评语</th><th /></tr></thead>
          <tbody>{items.map(item=><tr key={`${item.code}-${item.recommendedVersionId}`} style={{backgroundColor:employeeColor(item.uploaderUserId,item.contentColor)}}><td><button className="recommendation-title" onClick={()=>onPreview(item)}><strong>{item.title}</strong><small>{item.code}</small></button></td><td>{item.contentType==="video"?"视频":"图文"}</td><td>{item.uploaderName}</td><td>V{item.recommendedVersionNumber}</td><td>{item.recommendationDecision==="rejected"?"已驳回":"已通过"}</td><td className="recommendation-comment">{item.featuredReason||"—"}</td><td><div className="recommendation-actions"><button onClick={()=>onPreview(item)}>查看</button>{canCancel?<button className="danger-text" disabled={busyCode===item.code} onClick={()=>void cancelRecommendation(item)}>{busyCode===item.code?"处理中…":"取消推荐"}</button>:null}</div></td></tr>)}</tbody>
        </table>{!items.length?<div className="empty-state">当前没有推荐案例</div>:null}
      </div>
      <footer><span>共 {items.length} 条</span><button onClick={onClose}>关闭</button></footer>
    </section>
  </div>;
}

export default function Home() {
  const { context, requestSwitch } = useBusinessContext();
  const [activeNav, setActiveNav] = useState("工作台");
  const [reportNavOpen,setReportNavOpen]=useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: NoticeTone } | null>(null);
  const [versionTarget, setVersionTarget] = useState("");
  const [contentTarget, setContentTarget] = useState("");
  const [navEpoch, setNavEpoch] = useState(0);
  const [platformIcons, setPlatformIcons] = useState<PlatformIcons>({ dy: "", ks: "", xhs: "" });
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [preview, setPreview] = useState<{ item: DashboardContent | ReviewTask; versionNumber?: number } | null>(null);
  const [recommendationsOpen,setRecommendationsOpen]=useState(false);
  const [noticeTarget,setNoticeTarget]=useState<number|null>(null);
  const can = (permission: string) => dashboard.user.roleCode === "super_admin" || (!dashboard.user.deniedPermissions?.includes(permission)&&permissionGranted(dashboard.user.permissions, permission));
  const canReport = () => can("report.create") || can("report.receive") || can("report.cc");
  const canManageReportTemplates = () => can("report.template_manage");
  const moduleAvailable=(name:string)=>dashboard.user.moduleAccess?.[name]??true;
  const canReview = Boolean(dashboard.user.canReview ?? can("review.process"));
  const workspaceNav = [["工作台", ""], ["内容池", "content.view"], ["审核中心", "review.process"], ["发布管理", "publishing.view"], ["版本管理", "version.view"], ["素材中心","asset.view"]];
  const communicationNav = [["通知公告","notice.view"]];
  const [unreadNotices,setUnreadNotices]=useState(0);
  useEffect(()=>{let stopped=false;const refresh=()=>{if(!can("notice.view"))return;void fetch("/api/notices?page=1",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(data=>{if(!stopped&&data)setUnreadNotices(data.unread??0);});};refresh();const timer=window.setInterval(refresh,30000);window.addEventListener("orbit-notices-changed",refresh);return()=>{stopped=true;clearInterval(timer);window.removeEventListener("orbit-notices-changed",refresh);};},[dashboard.user.roleCode,dashboard.user.permissions,activeNav]);
  const businessNav = [["产品库", "business.product_masters"], ["商品管理", "business.view"], ["短视频账号", "business.view"], ["平台与店铺", "business.view"], ["数据统计", "analytics.view"]];
  const systemNav = [["组织与权限", "admin.view"], ["配置中心","admin.settings"], ["操作日志", "audit.view"]];
  const loadDashboard = useCallback(async () => { const response = await fetch("/api/dashboard", { cache: "no-store" }); if (response.ok) setDashboard(await response.json() as DashboardData); }, []);
  useEffect(() => { void loadDashboard(); const timer = window.setInterval(() => void loadDashboard(), 30000); return () => window.clearInterval(timer); }, [loadDashboard]);
  useEffect(() => {
    if(dashboard.user.roleCode)return;
    const timer=window.setInterval(()=>void loadDashboard(),1000);
    return()=>window.clearInterval(timer);
  },[dashboard.user.roleCode,loadDashboard]);
  useEffect(() => {
    const required:Record<string,string>={"通知公告":"notice.view","素材中心":"asset.view","工作报备":"report.create","报备模板":"report.template_manage","内容池":"content.view","审核中心":"review.process","发布管理":"publishing.view","版本管理":"version.view","产品库":"business.product_masters","商品管理":"business.view","短视频账号":"business.view","平台与店铺":"business.view","数据统计":"analytics.view","组织与权限":"admin.view","配置中心":"admin.settings","操作日志":"audit.view"};
    const permission=required[activeNav];
    if(permission&&dashboard.user.roleCode&& (activeNav==="工作报备"?!canReport():!can(permission))||permission&&dashboard.user.roleCode&&!moduleAvailable(activeNav)){
      setActiveNav("工作台");
      setNotice({message:"当前账号已无权访问该模块，已返回工作台",tone:"error"});
    }
  },[activeNav,dashboard.user.permissions,dashboard.user.roleCode]);
  const openModule = (name: string, targetId = "") => { setPreview(null);setNoticeTarget(null);setRecommendationsOpen(false); setVersionTarget(name === "版本管理" ? targetId : ""); setContentTarget(name === "内容池" ? targetId : ""); setNavEpoch((value) => value + 1); setActiveNav(name); void loadDashboard(); };
  const showNotice = (message: string, tone?: NoticeTone) => { const resolved = tone ?? inferNoticeTone(message); setNotice({ message, tone: resolved }); window.setTimeout(() => setNotice((current) => current?.message === message ? null : current), resolved === "error" ? 6000 : 3000); void loadDashboard(); };
  const logout=async()=>{try{const response=await fetch("/api/auth/logout",{method:"POST"});if(!response.ok)throw new Error("退出失败，请重试");clearBusinessContext();window.location.reload();}catch(error){showNotice(error instanceof Error?error.message:"退出失败，请重试","error");}};
  const metricCards = useMemo(() => {
    const rows = [] as Array<[string, string, string, string]>;
    if (canReview) rows.push(["待审核", String(dashboard.summary.pendingReview), `${dashboard.summary.reviewing} 条审核中`, "amber"]);
    if (can("publishing.view")) rows.push(["待发布", String(dashboard.summary.pendingPublish), "审核通过后进入发布池", "blue"]);
    if (can("publishing.view")) rows.push(["本月已发布", String(dashboard.summary.publishedThisMonth), `本周完成 ${dashboard.summary.publishedThisWeek} 条`, "green"]);
    rows.push(["内容总资产", String(dashboard.summary.totalAssets), `视频 ${dashboard.summary.videoAssets} · 图文 ${dashboard.summary.imageTextAssets}`, "purple"]);
    return rows;
  }, [dashboard, canReview]);
  const workbenchTasks=useMemo(()=>{
    const own=dashboard.contentTasks.filter(item=>item.taskPriority===0||item.taskPriority===1).map(item=>({...item,versionNumber:item.latestVersionNumber,waitingHours:null as number|null,workKind:item.reviewStatus==="rejected"?"修改后重新提交":"完成草稿并提交",workPriority:item.reviewStatus==="rejected"?1:2}));
    const review=dashboard.reviewTasks.map(item=>({...item,latestVersionNumber:item.versionNumber,activityAt:item.submittedAt,waitingHours:item.waitingHours??0,workKind:item.priority===0||item.lockedByCurrent?"继续审核":"审核内容",workPriority:item.priority===0||item.lockedByCurrent?0:3}));
    return [...own,...review].sort((a,b)=>a.workPriority-b.workPriority||(a.workPriority<=2?String(a.activityAt).localeCompare(String(b.activityAt)):String(b.activityAt).localeCompare(String(a.activityAt)))).filter((item,index,all)=>all.findIndex(other=>other.code===item.code)===index).slice(0,10);
  },[dashboard.contentTasks,dashboard.reviewTasks]);

  return <AuthGate>{<main className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">O</span><div><strong>内容中台</strong><small>VIDEO OPS</small></div></div><nav aria-label="主导航">
      <p className="nav-label">工作空间</p>{workspaceNav.filter(([item, permission]) => (!permission || can(permission))&&moduleAvailable(item)).map(([item], index) => <button className={activeNav === item ? "nav-item active" : "nav-item"} key={item} onClick={() => openModule(item)}><span className="nav-icon">{["⌂", "▣", "✓", "↗", "⑂","▧"][index]}</span>{item}{item === "审核中心" && dashboard.summary.pendingReview > 0 ? <em>{dashboard.summary.pendingReview}</em> : null}</button>)}{canReport()||canManageReportTemplates()?<><button className={`nav-item report-parent ${activeNav==="工作报备"||activeNav==="报备模板"?"active":""}`} onClick={()=>setReportNavOpen(v=>!v)}><span className="nav-icon">▤</span>工作报备<span className="nav-chevron">{reportNavOpen?"⌃":"⌄"}</span></button>{reportNavOpen?<div className="nav-subitems">{canReport()?<button className={activeNav==="工作报备"?"nav-subitem active":"nav-subitem"} onClick={()=>openModule("工作报备")}>工作报备</button>:null}{canManageReportTemplates()?<button className={activeNav==="报备模板"?"nav-subitem active":"nav-subitem"} onClick={()=>openModule("报备模板")}>模板管理</button>:null}</div>:null}</>:null}
      {communicationNav.some(([item,permission])=>can(permission)&&moduleAvailable(item))?<p className="nav-label">团队协作</p>:null}{communicationNav.filter(([item,permission])=>can(permission)&&moduleAvailable(item)).map(([item])=><button key={item} className={activeNav===item?"nav-item active":"nav-item"} onClick={()=>openModule(item)}><span className="nav-icon">{item==="通知公告"?"◇":"▧"}</span>{item}{item==="通知公告"&&unreadNotices>0?<em>{unreadNotices}</em>:null}</button>)}
      <p className="nav-label">业务资料</p>{businessNav.filter(([, permission]) => can(permission)).map(([item], index) => <button className={activeNav === item ? "nav-item active" : "nav-item"} key={item} onClick={() => openModule(item)}><span className="nav-icon">{["◇", "◎", "⌘", "⌘", "⌁"][index]}</span>{item}</button>)}
      <p className="nav-label">系统</p>{systemNav.filter(([, permission]) => can(permission)).map(([item]) => <button className={activeNav === item ? "nav-item active" : "nav-item"} key={item} onClick={() => openModule(item)}><span className="nav-icon">{item === "组织与权限" ? "♙" : item==="配置中心"?"⚙":"≡"}</span>{item}</button>)}
    </nav><div className="sidebar-footer"><div className="avatar">{dashboard.user.displayName[0]}</div><div><strong>{dashboard.user.displayName}</strong><small>{dashboard.user.roleName}</small></div></div></aside>
    <section className="workspace"><header className="topbar"><div><p className="eyebrow">{new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}</p><h1>{activeNav}</h1></div><div className="top-actions"><span className="top-user-context"><strong>{dashboard.user.displayName}</strong>{dashboard.user.roleName?` · ${dashboard.user.roleName}`:""}{context?<small>{context.platformName}｜{context.accountName}{context.groupName?` · ${context.groupName}`:""}</small>:null}</span>{context?<button className="top-context-switch" onClick={requestSwitch}>切换账号</button>:null}<button className="top-logout" onClick={()=>void logout()}>退出登录</button></div></header>
      {activeNav === "工作台" ? <div className="content-area dashboard-clean">
        <section className="welcome-row"><div><h2>你好，{dashboard.user.displayName}</h2><p>优先处理需要你操作的内容，其他可见内容按最近业务变化展示。</p></div><div className="lan-status"><span />局域网服务正常 <small>{dashboard.checkedAt ? `检查于 ${new Date(dashboard.checkedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : "正在检查"}</small></div></section>
        {dashboard.noticeTasks.length?<section className="panel dashboard-notice-panel"><div className="panel-heading"><div><h3>待处理通知</h3><p>要求回复的通知会持续提醒，普通通知确认已阅后完成</p></div><button className="text-button" onClick={()=>openModule("通知公告")}>查看全部 →</button></div><div className="dashboard-notice-list">{dashboard.noticeTasks.map(item=><button key={item.id} style={{backgroundColor:employeeColor(item.authorUserId,item.contentColor)}} onClick={()=>setNoticeTarget(item.id)}><span className={item.requiresReply?"reply-required":"unread"}>{item.statusText}</span><strong>{item.title}</strong><small>{item.authorName} · {formatServerTime(item.createdAt)}{item.attachmentCount?` · ${item.attachmentCount}个附件`:""}</small></button>)}</div></section>:null}
        <section className="metrics" aria-label="业务概览">{metricCards.map(([label, value, note, tone]) => <article className="metric-card" key={label}><div className={`metric-icon ${tone}`}>{label === "待审核" ? "✓" : label === "待发布" ? "↗" : label === "本月已发布" ? "▥" : "▣"}</div><div><p>{label}</p><strong>{value}</strong><small>{note}</small></div></article>)}</section>
        <section className="panel dashboard-task-panel"><div className="panel-heading table-heading"><div><h3>我的待办</h3><p>未完成审核优先，其次是驳回修改和草稿；新的审核任务按等待最久优先</p></div>{can("content.view") ? <button className="text-button" onClick={() => openModule("内容池")}>查看更多 →</button> : null}</div><div className="table-wrap"><table><thead><tr><th>内容</th><th>需要处理</th><th>上传人</th><th>版本</th><th>状态</th><th>等待/业务时间</th><th /></tr></thead><tbody>{workbenchTasks.map(item=><tr key={item.code} style={{backgroundColor:employeeColor(item.uploaderUserId??item.uploaderName,item.contentColor)}} className={item.workPriority===0?"task-urgent":""}><td><button className="dashboard-content-link" onClick={()=>setPreview({item})}><strong>{item.title}</strong><small>{item.code} · {item.contentType==="video"?"视频":"图文"}</small></button></td><td><strong>{item.workKind}</strong></td><td>{item.uploaderName}</td><td>V{item.latestVersionNumber}</td><td><span className={`status ${item.reviewStatus==="rejected"?"red":item.reviewStatus==="pending"?"amber":item.reviewStatus==="reviewing"?"blue":"slate"}`}><i/>{reviewLabels[item.reviewStatus]??item.reviewStatus}</span></td><td>{item.waitingHours===null?formatServerTime(item.activityAt??item.updatedAt):item.waitingHours<1?"不足1小时":`${item.waitingHours}小时`}</td><td><button onClick={()=>setPreview({item})}>查看</button></td></tr>)}</tbody></table>{!workbenchTasks.length?<div className="empty-state">当前没有需要你处理的内容</div>:null}</div></section>
        {dashboard.featured.length ? <section className="panel featured-workbench"><div className="panel-heading"><div><h3>★ 推荐案例</h3><p>以审核评语判断值得学习或需要避免的部分</p></div><button className="text-button" onClick={() => setRecommendationsOpen(true)}>查看全部 →</button></div><div className="featured-card-grid">{dashboard.featured.slice(0,6).map((item, index) => <button key={`${item.code}-${item.recommendedVersionId ?? index}`} style={{backgroundColor:employeeColor(item.uploaderUserId,item.contentColor)}} className="featured-card" onClick={() => setPreview({ item, versionNumber: item.recommendedVersionNumber })}><div className={`thumb thumb-${(index % 4) + 1}`}><span>{item.contentType === "video" ? "▶" : "▤"}</span></div><div><span>★ 推荐案例 · V{item.recommendedVersionNumber}</span><strong>{item.title}</strong><p>{item.featuredReason}</p><small>{item.uploaderName} · {item.recommendationDecision === "rejected" ? "改进案例" : "参考案例"}</small></div></button>)}</div></section> : null}
      </div> : <ModuleView key={`${activeNav}-${navEpoch}`} name={activeNav} notify={showNotice} navigate={openModule} versionTarget={versionTarget} contentTarget={contentTarget} platformIcons={platformIcons} setPlatformIcons={setPlatformIcons} />}
    </section>{noticeTarget?<DashboardNoticeDialog id={noticeTarget} onClose={()=>setNoticeTarget(null)} onChanged={loadDashboard} notify={showNotice}/>:null}{recommendationsOpen?<RecommendationDialog items={dashboard.featured} canCancel={can("content.feature")||can("review.recommend")} onPreview={item=>setPreview({item,versionNumber:item.recommendedVersionNumber})} onClose={()=>setRecommendationsOpen(false)} onChanged={loadDashboard} notify={showNotice}/>:null}{preview ? <DashboardPreview item={preview.item} versionNumber={preview.versionNumber} backLabel={recommendationsOpen?"返回推荐案例":"返回工作台"} onClose={() => setPreview(null)} /> : null}{notice ? <div className={`toast global-toast ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}><span>{notice.tone === "error" ? "!" : "✓"}</span><strong>{notice.message}</strong><button onClick={() => setNotice(null)}>×</button></div> : null}
  </main>}</AuthGate>;
}

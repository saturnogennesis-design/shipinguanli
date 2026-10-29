"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {employeeColor} from "@/lib/content-presentation";
import {ContentPreview} from "./content-preview";
import {CenterDialog} from "./communication-center";
import { permissionGranted } from "@/lib/permissions";

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
    void fetch(`/api/contents/${encodeURIComponent(item.code)}/versions${"recommendedVersionId" in item&&item.recommendedVersionId?"?recommendedVersionId="+item.recommendedVersionId:""}`, { cache: "no-store" })
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
    <section className="dashboard-preview" role="dialog" aria-modal="true" aria-label={item.title} onClick={(event) => event.stopPropagation()}>
      <header><div><small>{item.code}</small><h2>{item.title}</h2><p>{item.uploaderName} · {item.contentType === "video" ? "视频" : "图文"} · V{versionNumber ?? ("latestVersionNumber" in item ? item.latestVersionNumber : item.versionNumber)}</p></div><button type="button" aria-label="关闭预览" onClick={onClose}>×</button></header>
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


export { DashboardNoticeDialog, DashboardPreview, RecommendationDialog };
export type { DashboardContent, ReviewTask };

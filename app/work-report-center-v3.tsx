"use client";
import { useEffect,useState,useRef, Fragment } from "react";
import { ReportAttachments } from "./report-attachments";
import { CenterDialog } from "./communication-center";
type Row=any;
type Props={notify:(message:string,tone?:"success"|"error")=>void};
const date=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const time=(s?:string)=>s?new Date(s.includes("T")?s:s.replace(" ","T")+"Z").toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false}):"-";
const text=(s:string)=>String(s??"").replace(/<br\s*\/?>/gi,"\n").replace(/<\/(p|div|li)>/gi,"\n").replace(/<[^>]*>/g,"").replace(/&nbsp;/g," ");
async function api(url:string,body?:unknown,method="POST"){const r=await fetch(url,body?{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)}:{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error??"操作失败");return d;}
function Path({row,uid}:{row:Row;uid:number}){return <div className="report-path">{row.path?.map((p:Row,i:number)=><Fragment key={i}>{i>0?<span className="report-path-arrow"><small>{row.arrows[i-1]}</small><span>⟶</span></span>:null}<span className={p.id===uid?"report-node me":"report-node"}>{p.id===uid?"我":p.name}</span></Fragment>)}</div>;}
function Numbered({value,onChange}:{value:string;onChange:(s:string)=>void}){
 const ref=useRef<HTMLTextAreaElement>(null);
 function key(e:React.KeyboardEvent<HTMLTextAreaElement>){if(e.key!=="Enter"||e.shiftKey||e.nativeEvent.isComposing)return;e.preventDefault();const el=e.currentTarget,pos=el.selectionStart;const before=value.slice(0,pos),after=value.slice(el.selectionEnd);const count=(before.match(/^\s*\d+\. /gm)||[]).length;const insert="\n\n"+(count+1)+". ";onChange(before+insert+after);requestAnimationFrame(()=>{ref.current?.setSelectionRange(pos+insert.length,pos+insert.length);});}
 return <textarea ref={ref} className="report-numbered-input" value={value} placeholder="1. " onFocus={()=>{if(!value)onChange("1. ");}} onKeyDown={key} onChange={e=>onChange(e.target.value)} aria-label="按条填写，回车自动编号"/>;
}
export function WorkReportCenterV3({notify}:Props){
 const [data,setData]=useState<Row>({reports:[],cc:[],users:[],templates:[],currentUserId:0});
 const [tab,setTab]=useState<"report"|"cc">("report"),[hidden,setHidden]=useState(false),[mode,setMode]=useState("list");
 const [current,setCurrent]=useState<Row>(null),[form,setForm]=useState({completed:"",plan:"",remark:"",recipientUserId:"",productMasterId:"",templateCode:"RPT-DAILY"});
 const [attachmentRevision,setAttachmentRevision]=useState(0);
 const [pendingFiles,setPendingFiles]=useState<File[]>([]),[productPickerOpen,setProductPickerOpen]=useState(false);
 const [cc,setCc]=useState<Row>(null),[ccPeople,setCcPeople]=useState<Row[]>([]),[ids,setIds]=useState<number[]>([]),[remark,setRemark]=useState("");
 const [busy,setBusy]=useState(false),[query,setQuery]=useState(""),[typeFilter,setTypeFilter]=useState("all"),[personQuery,setPersonQuery]=useState(""),[page,setPage]=useState(1),[size,setSize]=useState(20);
 const [confirm,setConfirm]=useState<{title:string;body:string;run:()=>Promise<void>|void}|null>(null);
 const [chooseTemplate,setChooseTemplate]=useState(false),[lightbox,setLightbox]=useState<string|null>(null);
 const scroll=useRef(0),listRef=useRef<HTMLDivElement>(null),lock=useRef(false);
 const uid=data.currentUserId;
 async function load(){setData(await api("/api/reports"));}
 useEffect(()=>{load().catch(e=>notify(e.message,"error"));const refresh=()=>{if(document.visibilityState==="visible")void load().catch(()=>{});};const timer=window.setInterval(refresh,30000);window.addEventListener("focus",refresh);return()=>{window.clearInterval(timer);window.removeEventListener("focus",refresh);};},[]);
 useEffect(()=>{if(mode==="list"&&listRef.current)listRef.current.scrollTop=scroll.current;},[mode]);
 async function work(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);try{await fn();}catch(e){notify((e as Error).message,"error");}finally{lock.current=false;setBusy(false);}}
 function leave(){setConfirm({title:"退出编辑？",body:"未保存的修改将丢失，已保存的草稿仍会保留。",run:()=>{setMode("list");setPendingFiles([]);setCurrent(null);}});}
 function newReport(r?:Row,template?:Row){setCurrent(r?.id?r:null);setPendingFiles([]);setProductPickerOpen(false);setForm({completed:text(r?.completed??""),plan:text(r?.plan??""),remark:text(r?.remark??""),recipientUserId:String(r?.recipientUserId??data.lastRecipientUserId??""),productMasterId:String(r?.productMasterId??""),templateCode:r?.templateCode??template?.code??"RPT-DAILY"});setMode("edit");setChooseTemplate(false);}
 async function editReceived(row:Row){await work(async()=>{const d=await api("/api/reports/"+row.id+"?markRead=0");newReport(d.report);});}
 async function view(row:Row){await work(async()=>{const d=await api("/api/reports/"+row.id+(row.ccId?"?ccId="+row.ccId:""));setCurrent(d.report);setMode("view");await load();});}
 function valid(s:string){return s.replace(/^\s*\d+[.、)]\s*/gm,"").trim().length>0;}
 function save(action:string,r?:Row){
   const f=r?{completed:r.completed,plan:r.plan,remark:r.remark,recipientUserId:r.recipientUserId,productMasterId:r.productMasterId,templateCode:r.templateCode}:form,target=r??current;
   const recipientEditing=Boolean(target?.canEdit&&target?.status==="submitted");
   const filesToUpload=r?[]:pendingFiles;
   const run=()=>work(async()=>{
     // Save an editable draft, finish all uploads, then submit. Failed uploads keep the draft editable.
     const firstAction=filesToUpload.length&&!recipientEditing?"draft":action;
     const saved=await api(target?"/api/reports/"+target.id:"/api/reports",{...f,action:firstAction},target?"PATCH":"POST");
     const reportId=target?.id??saved.report?.id;
     if(!reportId)throw Error("报备未保存成功，请重试");
     if(filesToUpload.length){
       setCurrent({...target,...f,id:reportId,key:"report-"+reportId,status:recipientEditing?"submitted":"draft"});
       for(const file of filesToUpload){
         const fd=new FormData();fd.append("file",file);
         const upload=await fetch(`/api/reports/${reportId}/attachments`,{method:"POST",body:fd}),result=await upload.json();
         if(!upload.ok){setMode("edit");throw Error((result.error??"附件上传失败")+(recipientEditing?"；文案已保存，请重试剩余附件。":"；已保存草稿和成功上传的附件，请重试剩余文件。"));}
         setPendingFiles(files=>files.filter(item=>item!==file));setAttachmentRevision(value=>value+1);
       }
       if(action==="submit"&&!recipientEditing)await api("/api/reports/"+reportId,{...f,action:"submit"},"PATCH");
     }
     await load();setMode("list");setPendingFiles([]);notify(recipientEditing?"口播文案已更新":action==="submit"?"报备已提交":"草稿已保存","success");
   });
   if(action==="submit"){const spoken=f.templateCode==="RPT-SPOKEN-COPY";if(!valid(f.completed)||(!spoken&&!valid(f.plan))||!f.recipientUserId||(spoken&&!f.productMasterId)){notify(spoken?"请填写口播文案、选择商品和接收人":"请填写今日工作、明日计划，并选择接收人","error");return;}setConfirm({title:recipientEditing?"确认覆盖口播文案？":"确认提交报备？",body:recipientEditing?"保存后将覆盖当前文案，并记录本次修改。":"提交日期："+date()+"\n接收人："+(data.users.find((p:Row)=>p.id===Number(f.recipientUserId))?.name??"未选择")+"\n提交后创建人不能修改或撤回。",run});}else void run();
 }
 function change(row:Row,action:string){setConfirm({title:action==="delete"?"删除草稿？":action==="hide"?"隐藏记录？":"恢复显示？",body:action==="delete"?"草稿删除后无法恢复。":action==="hide"?"仅从你的列表中隐藏，可在“已隐藏”中恢复，不影响其他账号。":"恢复后重新显示在你的列表。",run:()=>work(async()=>{await api("/api/reports",{key:row.key,action});await load();setMode("list");notify("操作完成","success");})});}
 async function startCc(row:Row){setCc(row);setIds([]);setRemark("");setCcPeople([]);await work(async()=>{const d=await api("/api/reports/"+row.id,{action:"options"});setCcPeople(d.users);});}
 function submitCc(){if(!ids.length)return;setConfirm({title:"确认抄送？",body:"将“"+(cc.title??"该报备")+"”抄送给 "+ids.length+" 人，并记录本次备注。原接收人的阅读状态不受影响。",run:()=>work(async()=>{await api("/api/reports/"+cc.id,{userIds:ids,remark});setCc(null);await load();setTab("cc");setHidden(false);setMode("list");notify("抄送已完成","success");})});}
 async function copy(row:Row){await work(async()=>{const d=await api("/api/reports/"+row.id+"?markRead=0");newReport({...d.report,id:undefined,status:"copy"});});}
 function actions(row:Row){return <div className="report-actions">{row.hidden?<button disabled={busy} onClick={()=>change(row,"unhide")}>恢复显示</button>:row.status==="draft"?<><button disabled={busy} onClick={()=>save("submit",row)}>提交</button><button disabled={busy} onClick={()=>newReport(row)}>编辑</button>{data.canCreate?<button disabled={busy} onClick={()=>copy(row)}>复制</button>:null}<button className="danger" disabled={busy} onClick={()=>change(row,"delete")}>删除</button></>:<><button disabled={busy} onClick={()=>change(row,"hide")}>隐藏</button>{row.canEdit?<button disabled={busy} onClick={()=>void editReceived(row)}>修改文案</button>:null}{row.canCc?<button disabled={busy} onClick={()=>void startCc(row)}>抄送</button>:null}{row.kind==="report"&&!row.incoming&&data.canCreate?<button disabled={busy} onClick={()=>copy(row)}>复制</button>:null}</>}</div>;}
 const ccGroups:Row[]=[];
 for(const row of data.cc){if(row.incoming){ccGroups.push(row);continue;}const existing=ccGroups.find(g=>!g.incoming&&g.id===row.id&&g.fromUserId===row.fromUserId&&g.hidden===row.hidden);if(existing)existing.children.push(row);else ccGroups.push({...row,children:[row]});}
 const base=tab==="report"?data.reports:ccGroups,rows=base.filter((r:Row)=>r.hidden===hidden&&(typeFilter==="all"||r.templateCode===typeFilter)&&String(r.title??((r.submitterName??"")+"的日报")).includes(query));
 const pages=Math.max(1,Math.ceil(rows.length/size)),actualPage=Math.min(page,pages),visible=rows.slice((actualPage-1)*size,actualPage*size);
 const reportUnread=data.reports.filter((r:Row)=>r.incoming&&!r.readAt&&r.status==="submitted").length,ccUnread=data.cc.filter((r:Row)=>r.incoming&&!r.readAt).length;
 const groups=[...new Set<string>(data.users.filter((p:Row)=>p.id!==uid).map((p:Row)=>p.departmentName??"未分配部门"))];
 return <div className="report-v39">
 {mode==="list"?<section className="report-list-page">
<header className="report-list-heading"><h2>工作报备</h2><div className="report-heading-actions">{data.canCreate?<div className="report-create-menu"><button className="primary-button" onClick={()=>newReport(undefined,data.templates[0])}>新建日报</button>{chooseTemplate?<div>{data.templates.map((t:Row)=><button key={t.id} onClick={()=>newReport(undefined,t)}>{t.name}<small>{t.code==="RPT-SPOKEN-COPY"?"口播文案":"日报"}</small></button>)}</div>:null}</div>:null}<button onClick={()=>{setHidden(v=>!v);setPage(1);}}>{hidden?"返回列表":"已隐藏"}</button></div></header>
 <div className="report-tabs">{(["report","cc"] as const).map(t=><button key={t} className={tab===t?"active":""} onClick={()=>{setTab(t);setPage(1);}}>{t==="report"?"报备":"抄送"}{(t==="report"?reportUnread:ccUnread)>0?<b className="report-unread-count">{t==="report"?reportUnread:ccUnread}</b>:null}</button>)}</div>
 <div className="report-list-tools"><input aria-label="搜索报备" value={query} placeholder="搜索名称" onChange={e=>{setQuery(e.target.value);setPage(1);}}/><select aria-label="模板类型筛选" value={typeFilter} onChange={e=>{setTypeFilter(e.target.value);setPage(1);}}><option value="all">全部模板类型</option><option value="RPT-DAILY">日报</option></select><span className="report-legend-sent">{tab==="report"?"我提交的":"我抄送的"}</span><span className="report-legend-received">{tab==="report"?"发送给我的":"抄送给我的"}</span></div>
 <div className="table-wrap report-table-wrap" ref={listRef} onScroll={e=>scroll.current=e.currentTarget.scrollTop}><table className="report-table"><thead><tr><th>名称</th><th>模板类型</th><th>路径</th><th>{tab==="cc"?"抄送时间":"提交时间"}</th><th>状态</th><th>操作</th></tr></thead><tbody>{visible.map((r:Row)=><tr key={r.key} className={r.incoming?"report-row-received":"report-row-sent"}><td><div className="report-title-cell">{r.templateCode==="RPT-SPOKEN-COPY"&&r.productImageUrl?<img className="report-list-product-thumb" src={r.productImageUrl} alt={r.productName??"商品图"} title={r.productName??"无商品"}/>:null}<button className="report-title-link" title={r.title??(r.submitterName+"的日报")} onClick={()=>void view(r)}>{r.title??(r.submitterName+"的日报")}{r.incoming&&!r.readAt?<i className="report-unread-dot"/>:null}</button></div>{r.status==="draft"?<small>草稿</small>:null}</td><td>{r.templateCode==="RPT-SPOKEN-COPY"?"口播文案":"日报"}</td><td>{r.children?r.children.map((child:Row)=><div key={child.key}><Path row={child} uid={uid}/>{child.remark?<small className="report-cc-note">{child.remark}</small>:null}</div>):<Path row={r} uid={uid}/>}</td><td>{r.children?r.children.map((c:Row)=><div key={c.key}>{time(c.ccAt)}</div>):time(tab==="cc"?r.ccAt:r.submittedAt)}</td><td>{r.status==="draft"?"未提交":r.incoming?"—":tab==="cc"?"—":<span title={r.readAt?time(r.readAt):""}>{r.readAt?"对方已读":"对方未读"}</span>}</td><td>{r.children?r.children.map((c:Row)=><div key={c.key}>{actions(c)}</div>):actions(r)}</td></tr>)}</tbody></table>{!visible.length?<div className="empty-state">暂无记录</div>:null}</div>
 <footer className="report-pagination"><select aria-label="每页数量" value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1);}}>{[20,50,100].map(n=><option key={n} value={n}>每页 {n} 条</option>)}</select><button disabled={actualPage===1} onClick={()=>setPage(actualPage-1)}>上一页</button><span>{actualPage} / {pages} · {rows.length} 条</span><button disabled={actualPage===pages} onClick={()=>setPage(actualPage+1)}>下一页</button></footer>
 </section>:mode==="edit"?<section className="report-editor-page">
<header><button className="report-close" disabled={busy} onClick={leave} aria-label="关闭编辑">×</button><h2>{current?(current.templateCode==="RPT-SPOKEN-COPY"?"编辑口播文案":"编辑草稿"):(form.templateCode==="RPT-SPOKEN-COPY"?"新建口播文案":"新建日报")}</h2></header>
 <main><div className="report-editor-meta"><span>日期：{date()}</span>{current?.lastEditedAt?<span>上次修改时间：{time(current.lastEditedAt)}</span>:null}</div>
<label>今日完成的工作 <em>*</em><Numbered value={form.completed} onChange={completed=>setForm({...form,completed})}/></label><label>明日工作计划 <em>*</em><Numbered value={form.plan} onChange={plan=>setForm({...form,plan})}/></label>
 <label>备注 <small>选填</small><textarea value={form.remark} onChange={e=>setForm({...form,remark:e.target.value})}/></label>
 <ReportAttachments reportId={current?.id} pending={pendingFiles} onPendingChange={setPendingFiles} refreshKey={attachmentRevision} editable notify={notify} busy={busy}/>

 <label>接收人 <em>*</em>{!current?.canEdit?<input placeholder="搜索姓名或部门" value={personQuery} onChange={e=>setPersonQuery(e.target.value)}/>:null}<select disabled={Boolean(current?.canEdit)} value={form.recipientUserId} onChange={e=>setForm({...form,recipientUserId:e.target.value})}><option value="">请选择接收人</option>{groups.map(g=><optgroup label={g} key={g}>{data.users.filter((p:Row)=>p.id!==uid&&(p.departmentName??"未分配部门")===g&&((p.name+g).includes(personQuery)||String(p.id)===form.recipientUserId)).map((p:Row)=><option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>)}</select></label></main>
 <footer>{!current?.canEdit?<button disabled={busy} onClick={()=>save("draft")}>保存</button>:null}<button disabled={busy} className="primary-button" onClick={()=>save("submit")}>{current?.canEdit?"保存修改":"提交"}</button><button disabled={busy} onClick={leave}>退出</button></footer></section>:current?<section className="report-editor-page">
 <header><button className="report-close" aria-label="关闭详情" onClick={()=>setMode("list")}>×</button><div><h2>{current.title??(current.submitterName+"的日报")}</h2><Path row={current} uid={uid}/></div>{actions(current)}</header>
 <main><p className="report-meta">{current.kind==="cc"?"抄送时间："+time(current.ccAt):"提交时间："+time(current.submittedAt)}</p>{current.templateCode==="RPT-SPOKEN-COPY"?<div className="report-product-preview"><strong>商品：{current.productName??"无商品"}</strong>{current.productImageUrl?<button type="button" onClick={()=>setLightbox(current.productImageUrl)}><img src={current.productImageUrl} alt={current.productName??"商品图"}/></button>:null}</div>:null}<h3>{current.templateCode==="RPT-SPOKEN-COPY"?"口播文案":"今日完成的工作"}</h3><pre className="report-read-numbered">{text(current.completed)}</pre>{current.templateCode!=="RPT-SPOKEN-COPY"?<><h3>明日工作计划</h3><pre className="report-read-numbered">{text(current.plan)}</pre></>:null}<h3>备注</h3><pre className="report-read-numbered">{text(current.remark)||"—"}</pre>{current.kind==="cc"?<><h3>本次抄送备注</h3><pre className="report-read-numbered">{current.ccRemark||"—"}</pre></>:null}<ReportAttachments reportId={current.id} files={current.attachments} notify={notify}/><h3>接收人</h3><p className="report-recipient">{current.recipientName??"—"}</p>{current.templateCode==="RPT-SPOKEN-COPY"?<><h3>操作记录</h3><div className="report-activity-list">{current.logs?.length?current.logs.map((log:Row)=><div key={log.id}><strong>{log.action==="submit"?"提交文案":log.action==="edit_copy"?"修改文案":"抄送"}</strong><span>{log.userName} · {time(log.createdAt)}</span>{log.details?.remark?<small>备注：{log.details.remark}</small>:null}</div>):<p>暂无记录</p>}</div></>:null}</main></section>:null}
 {cc?<CenterDialog title="抄送" onClose={()=>{if(!busy)setCc(null);}} closeDisabled={busy}><div className="cc-overlay-form"><strong>{cc.title??(cc.submitterName+"的日报")}</strong><Path row={cc} uid={uid}/><div className="template-account-list">{busy&&!ccPeople.length?"正在读取可选账号…":ccPeople.map(p=><label key={p.id}><input type="checkbox" disabled={p.disabled||busy} checked={ids.includes(p.id)} onChange={e=>setIds(v=>e.target.checked?[...v,p.id]:v.filter(id=>id!==p.id))}/>{p.name}{p.disabled?<small>{p.reason}</small>:null}</label>)}</div><label>本次抄送备注<textarea value={remark} onChange={e=>setRemark(e.target.value)}/></label><footer><button disabled={busy} onClick={()=>setCc(null)}>取消</button><button className="primary-button" disabled={busy||!ids.length} onClick={submitCc}>提交抄送</button></footer></div></CenterDialog>:null}
 {confirm?<CenterDialog title={confirm.title} onClose={()=>{if(!busy)setConfirm(null);}} closeDisabled={busy}><p style={{whiteSpace:"pre-line"}}>{confirm.body}</p><footer><button disabled={busy} onClick={()=>setConfirm(null)}>取消</button><button className="primary-button" disabled={busy} onClick={()=>{const run=confirm.run;setConfirm(null);void run();}}>确认</button></footer></CenterDialog>:null}{lightbox?<CenterDialog title="商品大图" onClose={()=>setLightbox(null)}><div className="report-product-lightbox"><img src={lightbox} alt="商品大图"/></div></CenterDialog>:null}
 </div>;
}

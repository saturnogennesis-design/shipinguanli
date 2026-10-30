"use client";
import { useEffect, useState } from "react";
import { CenterDialog } from "./communication-center";
import { previewOffice, type OfficePreview } from "@/lib/office-preview";
import { MAX_REPORT_ATTACHMENTS, MAX_REPORT_FILE_BYTES } from "@/lib/report-attachments";
export type ReportAttachment={id:number;fileName:string;fileSize:number;mimeType:string;url:string};
function extension(name:string){return name.toLowerCase().split(".").pop()??"";}
function size(bytes:number){return `${(bytes/1024/1024).toFixed(1)} MB`;}
function OfficeContent({content}:{content:OfficePreview}) {
  const [sheet,setSheet]=useState(0);
  const table=(rows:string[][])=><div className="report-document-table"><table><tbody>{rows.map((row,index)=><tr key={index}>{row.map((cell,column)=><td key={column}>{cell}</td>)}</tr>)}</tbody></table></div>;
  return <>{content.kind==="word"?<article className="report-word-preview">{content.blocks.length?content.blocks.map((block,index)=>block.type==="paragraph"?<p key={index}>{block.text||"\u00a0"}</p>:<div key={index}>{table(block.rows)}</div>):<p>正文为空或仅包含图片，请下载原件查看。</p>}</article>:<><nav className="report-sheet-tabs" aria-label="选择工作表">{content.sheets.map((item,index)=><button key={index} aria-pressed={sheet===index} onClick={()=>setSheet(index)}>{item.name}</button>)}</nav>{table(content.sheets[sheet]?.rows??[])}</>}{content.truncated?<p role="status">仅展示部分内容，请下载原件查看完整文档。</p>:null}<p className="report-document-hint">此处为正文／表格内容预览，不执行宏或公式；复杂排版、图片、图表及数字格式请下载原件查看。</p></>;
}
export function DocumentPreview({file,onClose}:{file:ReportAttachment|File;onClose:()=>void}) {
  const [state,setState]=useState<{loading:boolean;error?:string;url?:string;office?:OfficePreview}>({loading:true});
  const name=file instanceof File?file.name:file.fileName,kind=extension(name),local=file instanceof File;
  useEffect(()=>{
    let active=true,url:string|undefined;const controller=new AbortController();
    (async()=>{
      let blob:Blob;
      if(file instanceof File)blob=file;
      else {
        const response=await fetch(file.url+((kind==="doc"||kind==="xls")?(file.url.includes("?")?"&preview=1":"?preview=1"):""),{cache:"no-store",signal:controller.signal});
        if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error??"附件读取失败");}
        blob=await response.blob();
      }
      if(kind==="docx"||kind==="xlsx") {
        const office=await previewOffice(await blob.arrayBuffer(),kind);
        if(active)setState({loading:false,office});
      }else {
        url=URL.createObjectURL(blob);
        if(active)setState({loading:false,url});else URL.revokeObjectURL(url);
      }
    })().catch(error=>{if(active)setState({loading:false,error:error instanceof Error?error.message:"预览失败，请下载原件查看"});});
    return()=>{active=false;controller.abort();if(url)URL.revokeObjectURL(url);};
  },[file,kind]);
  return <CenterDialog title={name} onClose={onClose}><div className="report-document-preview">{state.loading?<p role="status">正在准备文档预览…</p>:state.error?<p role="alert">{state.error}</p>:state.office?<OfficeContent content={state.office}/>:state.url?(file instanceof File&&/\.(jpe?g|png|webp|gif)$/i.test(file.name))||(!local&&(file as ReportAttachment).mimeType.startsWith("image/"))?<img src={state.url} alt={name}/>:<iframe title={name} src={state.url}/>:null}</div>{!local?<footer><a className="primary-button" href={(file as ReportAttachment).url+((file as ReportAttachment).url.includes("?")?"&download=1":"?download=1")} download={name}>下载原件</a></footer>:null}</CenterDialog>;
}
export function ReportAttachments({reportId,files,pending=[],onPendingChange,onChanged,editable=false,spoken=false,refreshKey=0,notify,busy=false}:{
  reportId?:number;files?:ReportAttachment[];pending?:File[];onPendingChange?:(files:File[])=>void;onChanged?:()=>void;
  editable?:boolean;spoken?:boolean;refreshKey?:number;busy?:boolean;notify:(message:string,tone?:"success"|"error")=>void;
}) {
  const [saved,setSaved]=useState<ReportAttachment[]>(files??[]),[preview,setPreview]=useState<ReportAttachment|File|null>(null),[remove,setRemove]=useState<ReportAttachment|null>(null),[deleting,setDeleting]=useState(false),[loadError,setLoadError]=useState("");
  useEffect(()=>{
    setLoadError("");if(!reportId){setSaved(files??[]);return;}
    const controller=new AbortController();
    fetch(`/api/reports/${reportId}/attachments`,{cache:"no-store",signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error??"附件读取失败");setSaved(data.items);}).catch(error=>{if(!controller.signal.aborted)setLoadError(error.message);});
    return()=>controller.abort();
  },[reportId,files,refreshKey]);
  function choose(selected:File[]) {
    const accepted:File[]=[];
    for(const file of selected) {
      const allowed=spoken?/\.(jpe?g|png|webp|gif)$/i:/\.(docx?|xlsx?|pdf)$/i;
      if(!allowed.test(file.name)){notify(spoken?"请选择图片":"请选择 Word、Excel 或 PDF 文件","error");continue;}
      if(file.size<1||file.size>(spoken?10*1024*1024:MAX_REPORT_FILE_BYTES)){notify(`${file.name}：文件为空或超过大小限制`,"error");continue;}
      if(saved.length+pending.length+accepted.length>=MAX_REPORT_ATTACHMENTS){notify(`每份报备最多添加 ${MAX_REPORT_ATTACHMENTS} 个附件`,"error");break;}
      accepted.push(file);
    }
    onPendingChange?.([...pending,...accepted]);
  }
  async function deleteSaved() {
    if(!remove||busy||deleting)return;setDeleting(true);
    try {
      const response=await fetch(remove.url,{method:"DELETE"}),result=await response.json();
      if(!response.ok)throw Error(result.error??"删除失败");
      setSaved(rows=>rows.filter(row=>row.id!==remove.id));setRemove(null);onChanged?.();notify(result.warning??"附件已删除",result.warning?"error":"success");
    }catch(error){notify((error as Error).message,"error");}finally{setDeleting(false);}
  }
  return <section className="report-attachments"><h3>{spoken?"示例图片":"附件"}</h3>{editable?<><p>{spoken?"支持图片，单张不超过 10MB。":"支持 Word（.doc、.docx）、Excel（.xls、.xlsx）和 PDF，单个不超过 20MB。"}每份报备最多 10 个附件。</p><label className="report-upload-label"><span aria-hidden="true">＋</span>上传附件<input aria-label={spoken?"添加示例图片":"添加日报文档"} type="file" multiple disabled={busy||deleting||Boolean(loadError)} accept={spoken?"image/jpeg,image/png,image/webp,image/gif":".doc,.docx,.xls,.xlsx,.pdf"} onChange={event=>{choose(Array.from(event.target.files??[]));event.currentTarget.value="";}}/></label></>:null}{loadError?<p role="alert">{loadError}</p>:null}<ul>{saved.map(file=><li key={file.id}><span>{file.fileName}<small>{size(file.fileSize)}</small></span><div><button type="button" onClick={()=>setPreview(file)}>预览</button><a href={file.url+"?download=1"} download={file.fileName}>下载原件</a>{editable?<button type="button" disabled={busy||deleting} onClick={()=>setRemove(file)}>删除</button>:null}</div></li>)}{pending.map((file,index)=><li key={index}><span>{file.name}<small>{size(file.size)} · 待保存</small></span><div>{["doc","xls"].includes(extension(file.name))?<small>保存草稿后可预览</small>:<button type="button" disabled={busy} onClick={()=>setPreview(file)}>预览</button>}<button type="button" disabled={busy} onClick={()=>onPendingChange?.(pending.filter((_,at)=>at!==index))}>移除</button></div></li>)}</ul>{!saved.length&&!pending.length&&!loadError?<p>暂无附件</p>:null}{preview?<DocumentPreview file={preview} onClose={()=>setPreview(null)}/>:null}{remove?<CenterDialog title="删除附件？" closeDisabled={deleting} onClose={()=>setRemove(null)}><p>“{remove.fileName}”将立即从报备中删除，此操作不可恢复。</p><footer><button disabled={deleting} onClick={()=>setRemove(null)}>取消</button><button disabled={deleting} onClick={()=>void deleteSaved()}>确认删除</button></footer></CenterDialog>:null}</section>;
}

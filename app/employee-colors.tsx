"use client";
import {useState} from "react";
import {employeeColor,employeePalette} from "@/lib/content-presentation";
export function EmployeeColors({onChanged,userId,color,allowed=false}:{onChanged:()=>void;userId?:number;color?:string|null;allowed?:boolean}){
 const [open,setOpen]=useState(false),[rows,setRows]=useState<Array<{id:number;name:string;color:string|null}>>([]),[error,setError]=useState("");
 const load=async()=>{const response=await fetch("/api/content-colors",{cache:"no-store"});const data=await response.json();if(!response.ok)setError(data.error);else setRows(userId?data.users.filter((row:{id:number})=>row.id===userId):data.users);};
 if(!allowed)return null;
 return <><button style={{borderLeft:`8px solid ${employeeColor(userId??0,color)}`}} onClick={()=>{setOpen(true);void load();}}>{userId?"设置颜色":"员工配色"}</button>{open?<div className="modal-backdrop"><section className="modal employee-color-dialog" role="dialog" aria-modal="true" aria-label="员工配色"><header><h3>员工配色</h3><button onClick={()=>setOpen(false)}>关闭</button></header>{error?<p role="alert">{error}</p>:null}<div className="employee-color-list">{rows.map(row=><label key={row.id} style={{backgroundColor:employeeColor(row.id,row.color)}}>{row.name}<select aria-label={`${row.name}的颜色`} value={row.color??""} onChange={async e=>{const response=await fetch("/api/content-colors",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:row.id,color:e.target.value||null})});if(!response.ok){setError("颜色保存失败");return;}await load();window.dispatchEvent(new Event("orbit-colors-changed"));onChanged();}}><option value="">自动分配</option>{employeePalette.map((color,i)=><option key={color} value={color}>中性色 {i+1}</option>)}</select></label>)}</div></section></div>:null}</>;
}

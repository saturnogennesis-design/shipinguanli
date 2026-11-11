'use client';
import {useEffect,useState} from 'react';
import {CrossEditor} from './cross-editor';
import {projectApi} from './project-management';
import {emptyRelatedView} from './cross-related';
import {TaskAssignDialog} from './scoped-task-dialogs';
import {type TaskItem} from './scoped-task-types';
import {recordState,type Detail,type Row,type Person,type Category,type BusinessType,type Access} from './cross-types';
type Props={detail:Detail;rows:Row[];people:Person[];categories:Category[];types:BusinessType[];access:Access;user:number;project:number;onChanged:()=>Promise<void>};
export function InlineSubpackages(props:Props){
 const {detail,types}=props;const [started,setStarted]=useState<number[]>([]);const [cancel,setCancel]=useState<TaskItem|null>(null),[error,setError]=useState('');
 const children=detail.related.filter(r=>r.main_id===detail.row.id),pending=detail.row.childTasks?.filter(t=>!t.resultId)??[];
 return <div className="inline-subpackages" aria-label="子包内容"><p className="inline-child-intro">子包资料、文件与操作在此直接处理，无需离开当前产品。</p>{children.map(row=><InlineChild key={row.id} {...props} row={row} startEdit={started.includes(row.id)}/>)}{pending.map(task=><section className="inline-child-placeholder" key={'task'+task.id}><div><span className="task-type">{task.typeName}</span><strong>{detail.row.title}</strong><span>待制作</span></div><p>任务已分配，上传后在这里直接查看文件及审核状态。</p><button onClick={async()=>{try{const t=(await projectApi('/api/cross-records/tasks')).items.find((t:TaskItem)=>t.id===task.id);if(!t?.canStart)throw Error('当前账号没有此任务制作权限');const result=await projectApi('/api/cross-records/tasks',{action:'start',id:t.id,revision:t.revision});setStarted(ids=>[...ids,result.id]);await props.onChanged();}catch(e){setError((e as Error).message);}}}>上传{types.find(t=>t.name===task.typeName)?.name??'子包'}</button>{props.access.canAssign?<button onClick={async()=>{try{const t=(await projectApi('/api/cross-records/tasks')).items.find((t:TaskItem)=>t.id===task.id);if(!t?.canCancel)throw Error('没有取消此任务的权限');setCancel(t);}catch(e){setError((e as Error).message);}}}>取消任务</button>:null}</section>)}{!children.length&&!pending.length?<p className="empty-state">暂无可查看的子包，请先发布分配子包任务。</p>:null}{error?<p role="alert">{error}</p>:null}{cancel?<TaskAssignDialog cancel task={cancel} people={props.people} types={types} onClose={()=>setCancel(null)} onSaved={props.onChanged}/>:null}</div>;
}
function InlineChild({row,startEdit=false,...props}:Props&{row:Row;startEdit?:boolean}){
 const [detail,setDetail]=useState<Detail|null>(null),[tab,setTab]=useState('info'),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{let live=true;void projectApi('/api/cross-records?id='+row.id).then(d=>{if(live){setDetail(d);setError('');}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[row.id]);
 return <section className="inline-child-panel" data-child-id={row.id}><header><span className="task-type">{props.types.find(t=>t.code===row.package_type)?.name??row.package_type}</span><strong>{row.title}</strong><span>{recordState(detail?.row??row)}</span></header>{error?<p role="alert">{error}</p>:null}{message?<p role="status">{message}</p>:null}{detail?<CrossEditor initial={detail} draft={null} initialTab={tab} onTabChange={setTab} onDetailChanged={setDetail} initialEditing={startEdit} relatedView={emptyRelatedView} onRelatedViewChange={()=>{}} rows={props.rows} people={props.people} categories={props.categories} types={props.types} access={props.access} userId={props.user} project={props.project} onClose={()=>{}} onChanged={props.onChanged} onCreate={()=>{}} notify={setMessage}/>:!error?<p className="empty-state">正在读取子包内容…</p>:null}</section>;
}

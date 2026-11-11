'use client';
import {useLayoutEffect,useRef} from 'react';
import {CenterDialog} from './communication-center';
import {CrossThumb} from './cross-components';
import {states,type Row} from './cross-types';
export type ClueMotherView={q:string;scroll:number};
export function ClueMotherDialog({loading=false,source,rows,project,view,onView,onOpen,onClose}:{loading?:boolean;source:Row;rows:Row[];project:number;view:ClueMotherView;onView:(v:ClueMotherView)=>void;onOpen:(r:Row)=>void;onClose:()=>void}){
 const list=useRef<HTMLDivElement>(null);useLayoutEffect(()=>{if(list.current)list.current.scrollTop=view.scroll;},[view.scroll]);
 const mothers=rows.filter(r=>r.kind==='mother'&&r.parent_id===source.id&&r.lifecycle!=='deleted'),items=mothers.filter(r=>!view.q||`${r.title} ${r.makerName}`.toLowerCase().includes(view.q.toLowerCase()));
 return <CenterDialog title="关联母版" onClose={onClose}><div className="clue-mother-summary"><strong>{source.title}</strong><span>{mothers.length} 个母版</span></div><input className="clue-mother-search" aria-label="搜索关联母版" placeholder="搜索母版名称或制作人" value={view.q} onChange={e=>onView({q:e.target.value,scroll:0})}/><div className="clue-mother-list" ref={list} onScroll={e=>onView({...view,scroll:e.currentTarget.scrollTop})}>{loading?<p role="status">正在读取关联母版…</p>:items.map(row=><button type="button" key={row.id} onClick={()=>onOpen(row)}><CrossThumb row={row} project={project} hover/><span><strong>{row.title}</strong><small>{row.makerName} · {states[row.status]}{row.lifecycle==='archived'?' · 已归档':''}</small></span><span aria-hidden="true">→</span></button>)}{!loading&&!items.length?<p className="empty-state">{mothers.length?'没有符合条件的母版':'暂无可查看的关联母版'}</p>:null}</div></CenterDialog>;
}

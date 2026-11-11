"use client";
import {ApprovedChildTags} from './approved-child-tags';
import {recordState} from './cross-types';
import {CrossFilters,CrossThumb,defaultFilters,matchesFilter,Pager,type Filters} from './cross-components';
import {crossViewRows} from '@/lib/cross-summary';
import {states,localTime,type Row,type Person,type Category,type BusinessType} from './cross-types';
export type RelatedView={filter:Filters;expanded:number[];page:number};
export const emptyRelatedView:RelatedView={filter:{...defaultFilters},expanded:[],page:1};
type Props={kind:Row['kind'];items:Row[];rows:Row[];people:Person[];categories:Category[];types:BusinessType[];project:number;value:RelatedView;onChange:(view:RelatedView)=>void;onOpen:(row:Row)=>void};
export function CrossRelated({kind,items,rows,people,categories,types,project,value,onChange,onOpen}:Props){
 const matches=(r:Row)=>(!value.filter.status||(r.lifecycle??'active')==='active')&&matchesFilter(r,value.filter,rows);
 const filtered=Object.entries(value.filter).some(([key,text])=>key!=='dateField'&&Boolean(text));
 const children=(r:Row)=>items.filter(item=>item.main_id===r.id);
 const roots=kind==='clue'?items.filter(matches):kind==='mother'?items.filter(r=>r.package_type==='main'?(matches(r)||children(r).some(matches)):!items.some(main=>main.id===r.main_id)&&matches(r)):items.filter(matches);
 const pageCount=Math.max(1,Math.ceil(roots.length/20)),page=Math.min(value.page,pageCount),visible=roots.slice((page-1)*20,page*20);
 const typeName=(r:Row)=>types.find(t=>t.code===r.package_type)?.name??'产品主图';
 function toggle(id:number){onChange({...value,expanded:value.expanded.includes(id)?value.expanded.filter(x=>x!==id):[...value.expanded,id]});}
 function renderItem(r:Row,child=false){const linked=children(r),expanded=value.expanded.includes(r.id);return <div className={child?'cross-relation-item child':'cross-relation-item'} key={r.id}>
  <div className="cross-relation-row"><button className="cross-relation-toggle" aria-label={(expanded?'收起':'展开')+r.title} aria-expanded={expanded} onClick={()=>toggle(r.id)}>{expanded?'⌄':'›'}</button><button className="cross-relation-open" onClick={()=>onOpen(r)}><CrossThumb row={r} project={project}/><span className="cross-relation-name"><strong>{r.title}</strong><ApprovedChildTags row={r}/><small>{typeName(r)}{linked.length?' · '+linked.length+' 个子包':''}{filtered&&matches(r)?' · 命中筛选':''}</small></span><span className="cross-relation-person">{r.creatorName}</span><span className="cross-relation-state">{recordState(r)}{r.lifecycle==='archived'?' · 已归档':''}</span><span aria-hidden="true">→</span></button></div>
  {expanded?<div className="cross-relation-expanded">{linked.length?linked.map(item=>renderItem(item,true)):<><dl><div><dt>产品分类</dt><dd>{categories.find(c=>c.id===r.product_category_id)?.name??'未分类'}</dd></div><div><dt>文件</dt><dd>{r.fileCount} 个</dd></div><div><dt>版本</dt><dd>{r.version_number?'V'+r.version_number:'未提交'}</dd></div><div><dt>更新时间</dt><dd>{localTime(r.updated_at)}</dd></div></dl><button className="cross-text-action" onClick={()=>onOpen(r)}>查看详情 →</button></>}</div>:null}
 </div>;}
 return <div className="cross-related-browser"><div className="cross-related-statuses" role="tablist" aria-label="下级资料状态">{[['','全部'],['draft','草稿'],['pending','待审核'],['approved','已通过'],['rejected','已退回']].map(([status,label])=><button key={status} role="tab" aria-selected={value.filter.status===status} onClick={()=>{const filter={...value.filter,status};const matchingGroups=status?items.filter(r=>r.package_type==='main'&&children(r).some(child=>(child.lifecycle??'active')==='active'&&matchesFilter(child,filter,rows))).map(r=>r.id):[];onChange({...value,filter,page:1,expanded:[...new Set([...value.expanded,...matchingGroups])]});}}>{label}<span>{status?crossViewRows(items,status).length:items.length}</span></button>)}</div><CrossFilters hideStatus hideNumbers value={value.filter} onChange={filter=>{const active=Object.entries(filter).some(([key,text])=>key!=='dateField'&&Boolean(text));const matchingGroups=active?items.filter(r=>r.package_type==='main'&&children(r).some(child=>matchesFilter(child,filter,rows))).map(r=>r.id):[];onChange({...value,filter,page:1,expanded:[...new Set([...value.expanded,...matchingGroups])]});}} people={people} categories={categories} types={kind==='clue'?[]:types}/>
  {kind==='clue'?<div className="cross-related-card-grid">{visible.map(item=><button className="cross-related-card" key={item.id} onClick={()=>onOpen(item)}><CrossThumb row={item} project={project}/><div><strong>{item.title}</strong><small>{item.creatorName}</small><span>{states[item.status]}{item.lifecycle==='archived'?' · 已归档':''}</span></div><span aria-hidden="true">→</span></button>)}</div>:<div className="cross-related-list">{visible.map(item=>renderItem(item))}</div>}
  {!visible.length?<div className="cross-tab-empty">暂无符合条件的资料</div>:null}<Pager page={page} total={roots.length} size={20} onChange={next=>onChange({...value,page:next})}/>
 </div>;
}

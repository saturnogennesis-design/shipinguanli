'use client';
import type {Row} from './cross-types';
const production:Record<string,string>={draft:'制作中',pending:'待审核',rejected:'已退回',approved:'已通过',todo:'待制作',making:'制作中'};
export function MainProductStatus({row,onOpen}:{row:Row;onOpen:(id:number)=>void}){
 if(row.status!=='approved')return <span className="flow-muted">—</span>;
 if(row.mainProductRestricted)return <span className="flow-muted">关联产品不在查看范围</span>;
 const main=row.mainProduct;if(!main)return <span className="flow-muted">待制作产品主包</span>;
 const label=main.lifecycle==='deleted'?'回收站':main.lifecycle==='archived'?'已归档 · '+(production[main.status]??main.status):production[main.status]??main.status;
 return <button className={'main-product-status status-'+main.status} onClick={()=>onOpen(main.id)} title={'查看产品主包：'+main.title}>{label}<span aria-hidden="true"> ↗</span></button>;
}
export function ProductCurrentFlow({row}:{row:Row}){
 if(row.package_type!=='main')return <span className="flow-muted">子包制作人：{row.makerName}</span>;
 if(row.lifecycle==='archived'||row.lifecycle==='deleted')return <span className="flow-muted">{row.lifecycle==='archived'?'已归档':'回收站'}</span>;
 const entries=row.currentFlow;if(!entries?.length)return <span className="flow-muted">暂无流转信息</span>;
 return <div className="product-current-flow">{entries.map((entry,index)=><span key={index} className={'current-flow-entry phase-'+entry.phase}>{entry.phase==='unassigned'?'未分配':entry.phase==='restricted'?'流转信息不在查看范围':entry.phase==='publish'?(entry.ownerName?'发布人：'+entry.ownerName:'待发布'):entry.phase==='main'?'主包制作人：'+entry.ownerName:entry.typeName+'子包制作人：'+entry.ownerName}{entry.phase==='child'||entry.phase==='main'?<small>{production[entry.state??'']??entry.state}</small>:null}</span>)}</div>;
}

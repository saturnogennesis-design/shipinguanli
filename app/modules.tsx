"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ContentPreview, uploadContentFile } from "./content-preview";
import { CommunicationCenter, CenterDialog } from "./communication-center";
import { MaterialCenterV3 } from "./material-center-v3";
import { WorkReportCenterV3 } from "./work-report-center-v3";
import { employeeColor,employeePalette } from "@/lib/content-presentation";
import { dutyPermissions, permissionGranted, permissionGroups, permissionKeys } from "@/lib/permissions";
import { useBusinessContext } from "./business-context";

export type PlatformKey = string;
export type PlatformIcons = Record<PlatformKey, string>;
type Props = {
  name: string;
  notify: (message: string, tone?: "success" | "error") => void;
  navigate: (name: string, targetId?: string) => void;
  versionTarget: string;
  contentTarget?: string;
  platformIcons: PlatformIcons;
  setPlatformIcons: React.Dispatch<React.SetStateAction<PlatformIcons>>;
};
type Tone = "amber" | "green" | "red" | "blue" | "slate";

type ReviewItem = {
  id: string;
  title: string;
  owner: string;
  product: string;
  productImageUrl?: string | null;
  version: string;
  time: string;
  kind: string;
  detail: string;
  status: string;
  lockOwner?: string;
  queueItemId?: number;
  uploaderUserId?: number;
  contentColor?:string|null;
  submittedAt?:string;
  versionId?: number;
};
const platformName: Record<string, string> = {
  dy: "抖音",
  ks: "快手",
  xhs: "小红书",
};
type ManagedPlatform = {
  id: number;
  key: PlatformKey;
  name: string;
  mark: string;
  status: "启用" | "停用";
  accounts: number;
};
type ManagedStore = {
  id: string;
  dbId: number;
  platformKey: PlatformKey;
  name: string;
  code: string;
  status: "启用" | "停用";
  referenced: boolean;
};
type BusinessData = {
  platforms: Array<{
    id: number;
    code: string;
    name: string;
    sortOrder: number;
    status: string;
    accountCount: number;
    iconStoragePath: string | null;
  }>;
  stores: Array<{
    id: number;
    platformId: number;
    platformCode: string;
    code: string;
    name: string;
    status: string;
  }>;
  accounts: Array<{
    id: number;
    platformId: number;
    platformCode: string;
    platformName: string;
    code: string;
    name: string;
    platformHandle: string | null;
    status: string;
    ownerName: string | null;
    productCount: number;
  }>;
  products: Array<{
    id: number;
    platformId: number;
    platformCode: string;
    platformName: string;
    storeId: number;
    storeName: string;
    code: string;
    name: string;
    productType: string | null;
    status: string;
    ownerName: string | null;
    imageUrl?: string | null;
  }>;
  productMasters: Array<{
    id: number;
    name: string;
    imageStoragePath: string | null;
    status: string;
    code?: string;
    legacyProductId?: number;
    imageUrl?: string | null;
  }>;
  bindings: Array<{ accountId: number; productId: number }>;
  publishedContents: Array<{
    uploaderUserId?:number;
    contentColor?:string|null;
    id: string;
    title: string;
    kind: string;
    version: number;
    productId: number | null;
    productCode: string | null;
    product: string | null;
    productType: string | null;
    productStatus: string | null;
    accountId: number | null;
    account: string | null;
    platform: string;
    shop: string | null;
    publishedAt: string | null;
  }>;
};
const emptyBusinessData: BusinessData = {
  platforms: [],
  stores: [],
  accounts: [],
  products: [],
  productMasters: [],
  bindings: [],
  publishedContents: [],
};
const initialManagedPlatforms: ManagedPlatform[] = [];
const initialManagedStores: ManagedStore[] = [];

function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <span className={`status ${tone}`}>
      <i />
      {children}
    </span>
  );
}

function ProductImage({url,name="商品",className=""}:{url?:string|null;name?:string;className?:string}){
  const [open,setOpen]=useState(false);
  if(!url)return <span className={`product-placeholder ${className}`} title="无商品图片">◇</span>;
  return <><button type="button" className={`product-image-button ${className}`} title={`查看${name}大图`} onClick={(event)=>{event.stopPropagation();setOpen(true);}}><img loading="lazy" src={url} alt={name}/></button>{open?<CenterDialog title={name} onClose={()=>setOpen(false)}><div className="product-lightbox"><img src={url} alt={name}/></div></CenterDialog>:null}</>;
}

function ContentCoverThumb({url,kind}:{url?:string|null;kind:string}){
  const [failed,setFailed]=useState(false);
  return <div className="publish-content-visual">{url&&!failed?<img loading="lazy" src={url} alt="" onError={()=>setFailed(true)}/>:<span className="publish-cover-placeholder">{kind==="视频"?"▶":"▤"}</span>}</div>;
}

function ModuleHeader({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="module-header">
      <div>
        <h2>{title}</h2>
        {description ? <p className="module-description-collapsed" aria-hidden="true">{description}</p> : null}
      </div>
      {action && (
        <button className="primary-button" onClick={onAction}>
          ＋ {action}
        </button>
      )}
    </div>
  );
}

function ProductCatalogPanel({notify}:{notify:(message:string,tone?:"success"|"error")=>void}){
  type Row={id:number;name:string;imageUrl?:string|null};
  const [rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(true),[name,setName]=useState(""),[image,setImage]=useState<File|null>(null),[busy,setBusy]=useState(false),[editing,setEditing]=useState<Row|null>(null),[editName,setEditName]=useState(""),[editImage,setEditImage]=useState<File|null>(null),[removing,setRemoving]=useState<Row|null>(null);
  const request=async <T,>(url:string,init?:RequestInit)=>{const response=await fetch(url,{cache:"no-store",...init});const data=await response.json().catch(()=>({})) as T&{error?:string};if(!response.ok)throw new Error(data.error??"操作失败");return data;};
  const refresh=useCallback(async()=>{setLoading(true);try{const data=await request<{items?:Row[]}>("/api/product-masters");setRows(data.items??[]);}catch(error){notify(error instanceof Error?error.message:"产品读取失败","error");}finally{setLoading(false);}},[notify]);
  useEffect(()=>{void refresh();},[refresh]);
  const add=async(event:React.FormEvent)=>{event.preventDefault();if(!name.trim())return;setBusy(true);try{const created=await request<{id:number;name:string;imageUploadUrl:string|null}>("/api/product-masters",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:name.trim(),imageType:image?.type})});if(image&&created.imageUploadUrl)await request(created.imageUploadUrl,{method:"PUT",headers:{"content-type":image.type},body:image});setName("");setImage(null);await refresh();notify("产品已加入统一产品库","success");}catch(error){notify(error instanceof Error?error.message:"新增失败","error");}finally{setBusy(false);}};
  const saveEdit=async(event:React.FormEvent)=>{event.preventDefault();if(!editing||!editName.trim())return;setBusy(true);try{const result=await request<{imageUploadUrl?:string|null}>("/api/product-masters",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:editing.id,name:editName.trim(),imageType:editImage?.type})});if(editImage&&result.imageUploadUrl)await request(result.imageUploadUrl,{method:"PUT",headers:{"content-type":editImage.type},body:editImage});setEditing(null);await refresh();notify("产品资料已保存","success");}catch(error){notify(error instanceof Error?error.message:"保存失败","error");}finally{setBusy(false);}};
  const remove=async()=>{if(!removing)return;setBusy(true);try{await request(`/api/product-masters?id=${removing.id}`,{method:"DELETE"});setRemoving(null);await refresh();notify("产品已停用，历史内容保留为无图片","success");}catch(error){notify(error instanceof Error?error.message:"停用失败","error");}finally{setBusy(false);}};
  return <><ModuleHeader title="产品库" description="统一产品目录；短视频素材和 Etsy 母图都从这里选择产品。"/><section className="panel product-catalog-panel"><header className="panel-heading"><div><h2>产品目录</h2><p>产品删除后不影响历史记录，只在新建内容时不再提供选择。</p></div></header><div className="v3-product-grid">{rows.map(row=><article key={row.id}>{row.imageUrl?<img loading="lazy" src={row.imageUrl} alt={row.name}/>:<div>暂无图片</div>}<strong title={row.name}>{row.name}</strong><span className="v3-product-actions"><button onClick={()=>{setEditing(row);setEditName(row.name);setEditImage(null);}}>修改</button><button onClick={()=>setRemoving(row)}>删除</button></span></article>)}{!rows.length?<div className="empty-state">{loading?"正在读取产品…":"暂无产品，请先新增"}</div>:null}</div><form className="v3-product-add" onSubmit={add}><label>产品名称<input required value={name} onChange={event=>setName(event.target.value)} placeholder="例如：珍珠耳钉"/></label><label>产品图片<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>setImage(event.target.files?.[0]??null)}/></label><button className="primary-button" disabled={busy}>{busy?"正在保存…":"新增产品"}</button></form></section>{editing?<CenterDialog title="修改产品" onClose={()=>setEditing(null)} closeDisabled={busy}><form className="v3-form" onSubmit={saveEdit}><label>产品名称<input required value={editName} onChange={event=>setEditName(event.target.value)}/></label><label>更换产品图片（不更换可留空）<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>setEditImage(event.target.files?.[0]??null)}/></label><footer><button type="button" disabled={busy} onClick={()=>setEditing(null)}>取消</button><button className="primary-button" disabled={busy}>{busy?"正在保存…":"保存修改"}</button></footer></form></CenterDialog>:null}{removing?<CenterDialog title="停用产品" onClose={()=>setRemoving(null)} closeDisabled={busy}><p>“{removing.name}”将从新建内容和素材选择中隐藏，历史关联不会被删除。</p><footer><button disabled={busy} onClick={()=>setRemoving(null)}>取消</button><button className="danger-confirm" disabled={busy} onClick={()=>void remove()}>{busy?"正在处理…":"确认停用"}</button></footer></CenterDialog>:null}</>;
}

function Toolbar({
  placeholder = "搜索",
  children,
}: {
  placeholder?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="module-toolbar">
      <label>
        <span>⌕</span>
        <input placeholder={placeholder} />
      </label>
      <div>{children}</div>
    </div>
  );
}

type RuleJoin = "and" | "or" | "exclude";
type RuleOperator =
  | "contains"
  | "not_contains"
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "empty"
  | "not_empty"
  | "before"
  | "after";
export type SmartFilterRule = {
  id: string;
  join: RuleJoin;
  field: string;
  operator: RuleOperator;
  value: string;
};
export type SmartFilterField<T> = {
  key: string;
  label: string;
  type: "text" | "select" | "number" | "date";
  options?: Array<{ value: string; label: string }>;
  getValue: (row: T) => unknown;
};

const ruleId = () => `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ruleJoinLabel: Record<RuleJoin, string> = {
  and: "并且",
  or: "或者",
  exclude: "排除",
};
const operatorLabel: Record<RuleOperator, string> = {
  contains: "包含",
  not_contains: "不包含",
  eq: "等于",
  neq: "不等于",
  gt: "大于",
  gte: "大于等于",
  lt: "小于",
  lte: "小于等于",
  empty: "为空",
  not_empty: "不为空",
  before: "早于",
  after: "晚于",
};
function operatorsFor(type: SmartFilterField<unknown>["type"]): RuleOperator[] {
  if (type === "select") return ["eq", "neq", "empty", "not_empty"];
  if (type === "number") return ["eq", "neq", "gt", "gte", "lt", "lte", "empty", "not_empty"];
  if (type === "date") return ["before", "after", "eq", "empty", "not_empty"];
  return ["contains", "not_contains", "eq", "neq", "empty", "not_empty"];
}
function normalizeRuleValue(value: unknown) {
  if (value === null || value === undefined) return [] as string[];
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => String(item).trim().toLocaleLowerCase("zh-CN"));
}
function matchesSmartRule<T>(row: T, rule: SmartFilterRule, field?: SmartFilterField<T>) {
  if (!field) return true;
  const values = normalizeRuleValue(field.getValue(row));
  const expected = rule.value.trim().toLocaleLowerCase("zh-CN");
  const empty = !values.length || values.every((item) => !item);
  if (rule.operator === "empty") return empty;
  if (rule.operator === "not_empty") return !empty;
  if (field.type === "number") {
    const actual = Number(values[0]);
    const target = Number(expected);
    if (!Number.isFinite(actual) || !Number.isFinite(target)) return false;
    if (rule.operator === "gt") return actual > target;
    if (rule.operator === "gte") return actual >= target;
    if (rule.operator === "lt") return actual < target;
    if (rule.operator === "lte") return actual <= target;
  }
  if (field.type === "date") {
    const actual = new Date(String(field.getValue(row))).getTime();
    const target = new Date(rule.value).getTime();
    if (!Number.isFinite(actual) || !Number.isFinite(target)) return false;
    if (rule.operator === "before") return actual < target + 24 * 60 * 60 * 1000;
    if (rule.operator === "after") return actual >= target;
    if (rule.operator === "eq") {
      const end = target + 24 * 60 * 60 * 1000;
      return actual >= target && actual < end;
    }
  }
  if (rule.operator === "contains") return values.some((item) => item.includes(expected));
  if (rule.operator === "not_contains") return values.every((item) => !item.includes(expected));
  if (rule.operator === "neq") return values.every((item) => item !== expected);
  return values.some((item) => item === expected);
}
function applySmartFilters<T>(rows: T[], rules: SmartFilterRule[], fields: SmartFilterField<T>[]) {
  if (!rules.length) return rows;
  const fieldMap = new Map(fields.map((field) => [field.key, field]));
  const andRules = rules.filter((rule) => rule.join === "and");
  const orRules = rules.filter((rule) => rule.join === "or");
  const excludeRules = rules.filter((rule) => rule.join === "exclude");
  return rows.filter(
    (row) =>
      andRules.every((rule) => matchesSmartRule(row, rule, fieldMap.get(rule.field))) &&
      (!orRules.length || orRules.some((rule) => matchesSmartRule(row, rule, fieldMap.get(rule.field)))) &&
      !excludeRules.some((rule) => matchesSmartRule(row, rule, fieldMap.get(rule.field))),
  );
}
function ruleSummary<T>(rule: SmartFilterRule, fields: SmartFilterField<T>[]) {
  const field = fields.find((item) => item.key === rule.field);
  const option = field?.options?.find((item) => item.value === rule.value);
  const suffix = ["empty", "not_empty"].includes(rule.operator) ? "" : ` ${option?.label ?? rule.value}`;
  return `${ruleJoinLabel[rule.join]} ${field?.label ?? rule.field} ${operatorLabel[rule.operator]}${suffix}`;
}
type FilterView={sort?:string;group?:string};
type FilterScheme={id:number;name:string;conditions:SmartFilterRule[];view?:FilterView;isShared?:boolean;canManage?:boolean};
export function RuleFilterBar<T>({
  moduleKey,
  fields,
  rules,
  onChange,view={},onViewChange,
}: {
  view?:FilterView;
  onViewChange?:(view:FilterView)=>void;
  moduleKey: string;
  fields: SmartFilterField<T>[];
  rules: SmartFilterRule[];
  onChange: (rules: SmartFilterRule[]) => void;
}) {
  const [expanded,setExpanded]=useState(false);
  const [builderOpen,setBuilderOpen]=useState(false);
  const primaryKeys:Record<string,string[]>={
    contents:["query","product","contentType","owner"],reviews:["query","product","owner","contentType"],publishing:["query","product","publishStatus","platform"],versions:["query","product","owner","contentType"],trash:["query","product","reviewStatus","owner"],published_contents:["query","product","publishStatus","platform"],products:["query","platform","store","status"],accounts:["query","platform","product","status"],platform_stores:["query","platform","platformStatus","storeStatus"],analytics_metrics:["query","platform","account","recordedOn"],employees:["query","department","role","status"],roles:["query","dataScope","people","permission"],departments:["query","parent","members"],audit:["query","user","module","createdAt"]
  };
  const preferred=primaryKeys[moduleKey]??fields.slice(0,4).map(field=>field.key);
  const ordered=[...preferred.map(key=>fields.find(field=>field.key===key)).filter((field):field is SmartFilterField<T>=>Boolean(field)),...fields.filter(field=>!preferred.includes(field.key))];
  const visibleFields=expanded?ordered:ordered.slice(0,4);
  const rulesFor=(key:string)=>rules.filter(rule=>rule.field===key);
  const setSimple=(field:SmartFilterField<T>,value:string)=>{
    const remaining=rules.filter(rule=>rule.field!==field.key);
    if(!value){onChange(remaining);return;}
    const operator:RuleOperator=field.type==="text"?"contains":"eq";
    onChange([...remaining,{id:ruleId(),join:"and",field:field.key,operator,value}]);
  };
  const setDate=(field:SmartFilterField<T>,operator:"after"|"before",value:string)=>{
    const remaining=rules.filter(rule=>!(rule.field===field.key&&(rule.operator===operator||rule.operator==="eq")));
    onChange(value?[...remaining,{id:ruleId(),join:"and",field:field.key,operator,value}]:remaining);
  };
  const valueFor=(field:SmartFilterField<T>)=>rulesFor(field.key).find(rule=>!["after","before"].includes(rule.operator))?.value??"";
  const dateValue=(field:SmartFilterField<T>,operator:"after"|"before")=>rulesFor(field.key).find(rule=>rule.operator===operator)?.value??"";
  const activeView=Boolean(view.sort&&view.sort!=="default"||view.group&&!["default","status"].includes(view.group));
  const reset=()=>{onChange([]);onViewChange?.({sort:"default",group:moduleKey==="contents"?"status":"default"});};
  const addRule=()=>{
    const field=ordered[0];
    if(!field)return;
    const operator:RuleOperator=field.type==="text"?"contains":field.type==="date"?"after":field.type==="number"?"gt":"eq";
    onChange([...rules,{id:ruleId(),join:"and",field:field.key,operator,value:""}]);
    setBuilderOpen(true);
  };
  const updateRule=(id:string,patch:Partial<SmartFilterRule>)=>onChange(rules.map(rule=>rule.id===id?{...rule,...patch}:rule));
  const removeRule=(id:string)=>onChange(rules.filter(rule=>rule.id!==id));
  return <section className="condition-filter" aria-label="筛选条件">
    <div className="condition-filter-heading"><strong>筛选条件</strong><small>可添加多个条件，支持并且、或者、排除</small>{rules.length||activeView?<button onClick={reset}>重置</button>:null}<button className="condition-builder-toggle" onClick={()=>setBuilderOpen(value=>!value)}>{builderOpen?"收起组合筛选":"组合筛选"}</button></div>
    <div className="condition-filter-controls">
      {visibleFields.map(field=><label key={field.key} className={field.type==="date"?"condition-date":""}><span>{field.label}</span>{field.type==="select"?<select value={valueFor(field)} onChange={event=>setSimple(field,event.target.value)}><option value="">全部</option>{field.options?.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>:field.type==="date"?<div><input aria-label={`${field.label}开始日期`} type="date" value={dateValue(field,"after")} onChange={event=>setDate(field,"after",event.target.value)}/><b>至</b><input aria-label={`${field.label}结束日期`} type="date" value={dateValue(field,"before")} onChange={event=>setDate(field,"before",event.target.value)}/></div>:<input type={field.type==="number"?"number":"search"} value={valueFor(field)} placeholder={field.type==="text"?`搜索${field.label}`:"全部"} onChange={event=>setSimple(field,event.target.value)}/>}</label>)}
      {onViewChange?<label><span>排序</span><select value={view.sort??"default"} onChange={event=>onViewChange({...view,sort:event.target.value})}><option value="default">业务默认顺序</option><option value="newest">最新优先</option><option value="oldest">最早优先</option></select></label>:null}
      {onViewChange&&moduleKey==="reviews"?<label><span>列表分组</span><select value={view.group??"default"} onChange={event=>onViewChange({...view,group:event.target.value})}><option value="default">按员工集中</option><option value="employee">按员工集中</option><option value="none">不分组</option></select></label>:null}
      {ordered.length>4?<button className="condition-more" onClick={()=>setExpanded(value=>!value)}>{expanded?"收起条件":"更多条件"}<span>{expanded?"⌃":"⌄"}</span></button>:null}
    </div>
    {builderOpen?<div className="condition-builder" aria-label="组合筛选条件">
      {!rules.length?<p className="condition-builder-empty">还没有组合条件，点击“添加条件”开始筛选。</p>:null}
      {rules.map(rule=>{const field=fields.find(item=>item.key===rule.field)??fields[0];const operators=field?operatorsFor(field.type):[];const needsValue=!['empty','not_empty'].includes(rule.operator);return <div className="condition-builder-row" key={rule.id}>
        <select aria-label="条件关系" value={rule.join} onChange={event=>updateRule(rule.id,{join:event.target.value as RuleJoin})}><option value="and">并且</option><option value="or">或者</option><option value="exclude">排除</option></select>
        <select aria-label="筛选字段" value={rule.field} onChange={event=>{const next=fields.find(item=>item.key===event.target.value)??fields[0];const nextOperator=next.type==="text"?"contains":next.type==="date"?"after":next.type==="number"?"gt":"eq";updateRule(rule.id,{field:next.key,operator:nextOperator,value:""});}}>{fields.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select>
        <select aria-label="筛选方式" value={rule.operator} onChange={event=>updateRule(rule.id,{operator:event.target.value as RuleOperator})}>{operators.map(operator=><option key={operator} value={operator}>{operatorLabel[operator]}</option>)}</select>
        {needsValue?(field?.type==="select"?<select aria-label="筛选值" value={rule.value} onChange={event=>updateRule(rule.id,{value:event.target.value})}><option value="">请选择</option>{field.options?.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>:<input aria-label="筛选值" type={field?.type==="date"?"date":field?.type==="number"?"number":"search"} value={rule.value} onChange={event=>updateRule(rule.id,{value:event.target.value})} placeholder="输入值"/>):<span className="condition-builder-no-value">无需填写</span>}
        <button className="condition-builder-remove" aria-label="删除此条件" onClick={()=>removeRule(rule.id)}>×</button>
      </div>;})}
      <button className="condition-builder-add" onClick={addRule}>＋ 添加条件</button>
    </div>:null}
    {rules.length?<div className="condition-filter-tags">{rules.map(rule=><span key={rule.id}>{ruleSummary({...rule,join:"and"},fields).replace(/^并且\s/,"")}<button aria-label="移除此条件" onClick={()=>onChange(rules.filter(item=>item.id!==rule.id))}>×</button></span>)}</div>:null}
  </section>;
}

type UnifiedContent = {
  categoryId?:number|null;
  categoryName?:string|null;
  id: string;
  title: string;
  kind: string;
  product: string;
  productId?: number | null;
  productMasterId?: number | null;
  productImageUrl?: string | null;
  account: string;
  owner: string;
  version: string;
  status: string;
  visibility: string;
  remark: string;
  time: string;
  createdAt?: string;
  contentColor?: string | null;
  groupId?:number|null;
  groupName?:string|null;
  archivedAt?: string | null;
  archiveReason?: string;
  reviewComment?: string;
  detail: string;
  locked?: boolean;
  lockOwner?: string;
  contentId?: number;
  uploaderUserId?: number;
  versionId?: number;
  uploadStatus?: string;
  rejectionReason?: string;
  rejectedAt?: string;
  fileSize?: number;
  durationSeconds?: number | null;
  imageCount?: number;
  featured?: boolean;
  featuredReason?: string;
  featuredTags?: string[];
  featuredAt?: string;
  coverUrl?: string | null;
};
type ContentLoadOptions = {
  page?: number;
  pageSize?: number;
  q?: string;
  type?: string;
  status?: string;
  owner?: string;
  recommended?: boolean;
  createdFrom?:string;
  createdTo?:string;
  code?:string;
  rules?: string;
  board?: boolean;
  archived?: boolean;
  lanePages?: string;
  lanePageSizes?:string;
  sort?: string;
  group?:string;
};
type ContentPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  laneTotals?: number[];
};

function parseServerDate(value: string) {
  const normalized = /[zZ]$|[+-]\d\d:\d\d$/.test(value)
    ? value
    : value.includes("T")
      ? `${value}Z`
      : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}
function formatServerTime(
  value: string,
  options: Intl.DateTimeFormatOptions = {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
) {
  return parseServerDate(value)?.toLocaleString("zh-CN", options) ?? value;
}
function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024)
    return `${(value / 1024 / 1024).toFixed(value > 10 * 1024 * 1024 ? 1 : 2)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
function formatDuration(value?: number | null) {
  if (value === null || value === undefined) return "时长待识别";
  const seconds = Math.max(0, Math.round(value));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function readVideoDuration(file: File) {
  return new Promise<number | null>((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const finish = (value: number | null) => {
      URL.revokeObjectURL(url);
      video.remove();
      resolve(value);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () =>
      finish(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => finish(null);
    video.src = url;
  });
}

type VersionFile = {
  v: string;
  file: string;
  size: string;
  owner: string;
  time: string;
  current?: boolean;
};
type VersionGroup = {
  title: string;
  id: string;
  current: string;
  kind: string;
  product: string;
  owner: string;
  time: string;
  detail: string;
  versions: VersionFile[];
};
const initialVersionGroups: VersionGroup[] = [
  {
    title: "珍珠耳环上身展示",
    id: "CNT-0825-018",
    current: "V3",
    kind: "视频",
    product: "珍珠耳环 PE-014",
    owner: "林晓",
    time: "今天 11:26",
    detail: "00:28 · 86.4 MB",
    versions: [
      {
        v: "V3",
        file: "pearl-earring-v3.mp4",
        size: "86.4 MB",
        owner: "林晓",
        time: "今天 11:26",
        current: true,
      },
      {
        v: "V2",
        file: "pearl-earring-v2.mp4",
        size: "84.1 MB",
        owner: "林晓",
        time: "昨天 16:40",
      },
      {
        v: "V1",
        file: "pearl-earring.mp4",
        size: "81.9 MB",
        owner: "林晓",
        time: "8月23日 10:12",
      },
    ],
  },
  {
    title: "戒指细节轮播图",
    id: "CNT-0825-017",
    current: "V2",
    kind: "图文",
    product: "星芒戒指 RG-031",
    owner: "陈瑜",
    time: "今天 10:48",
    detail: "8 张图片 · 24.8 MB",
    versions: [
      {
        v: "V2",
        file: "ring-detail-v2.zip",
        size: "24.8 MB",
        owner: "陈瑜",
        time: "今天 10:48",
        current: true,
      },
      {
        v: "V1",
        file: "ring-detail.zip",
        size: "22.6 MB",
        owner: "陈瑜",
        time: "8月24日 13:05",
      },
    ],
  },
  {
    title: "小红书通勤搭配",
    id: "CNT-0825-011",
    current: "V1",
    kind: "视频",
    product: "锁骨链 NK-008",
    owner: "周莉",
    time: "今天 09:12",
    detail: "00:41 · 102.3 MB",
    versions: [
      {
        v: "V1",
        file: "commute-necklace.mp4",
        size: "102.3 MB",
        owner: "周莉",
        time: "今天 09:12",
        current: true,
      },
    ],
  },
  {
    title: "礼盒开箱展示",
    id: "CNT-0825-009",
    current: "V3",
    kind: "视频",
    product: "礼盒套装 BX-002",
    owner: "林晓",
    time: "今天 08:55",
    detail: "00:35 · 91.6 MB",
    versions: [
      {
        v: "V3",
        file: "giftbox-open-v3.mp4",
        size: "91.6 MB",
        owner: "林晓",
        time: "今天 08:55",
        current: true,
      },
      {
        v: "V2",
        file: "giftbox-open-v2.mp4",
        size: "89.2 MB",
        owner: "林晓",
        time: "昨天 11:20",
      },
      {
        v: "V1",
        file: "giftbox-open.mp4",
        size: "87.8 MB",
        owner: "林晓",
        time: "8月22日 15:31",
      },
    ],
  },
  {
    title: "开箱与包装展示",
    id: "CNT-0824-063",
    current: "V1",
    kind: "视频",
    product: "礼盒套装 BX-002",
    owner: "林晓",
    time: "昨天 17:20",
    detail: "00:36 · 88.7 MB",
    versions: [
      {
        v: "V1",
        file: "package-unboxing.mp4",
        size: "88.7 MB",
        owner: "林晓",
        time: "昨天 17:20",
        current: true,
      },
    ],
  },
];

function ContentDetailPanel({
  item,
  editable = false,
  navigate,
  onBack,
  footer,
  onTitleChange,
  onRemarkChange,
  productControl,
  extraFields,
  mediaEditor,
  showHistory = true,
}: {
  item: UnifiedContent;
  editable?: boolean;
  navigate: (name: string, targetId?: string) => void;
  onBack?: () => void;
  footer?: React.ReactNode;
  onTitleChange?: (title: string) => void;
  onRemarkChange?: (remark: string) => void;
  productControl?: React.ReactNode;
  extraFields?: React.ReactNode;
  mediaEditor?:React.ReactNode;
  showHistory?: boolean;
}) {
  const tone: Tone =
    item.status === "已通过"
      ? "green"
      : item.status === "已驳回"
        ? "red"
        : item.status === "审核中"
          ? "blue"
          : item.status === "待审核"
            ? "amber"
            : "slate";
  type HistoryRecord = {
    versionNumber: number;
    fileName: string;
    fileSize: number | string;
    uploaderName: string;
    createdAt: string;
    current: boolean;
    fileUrl?: string | null;
    files?: Array<{ id: number; fileName: string; fileUrl: string | null }>;
  };
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = useState(true);
  const formatSize = (size: number | string) =>
    typeof size === "number"
      ? `${(size / 1024 / 1024).toFixed(size > 10 * 1024 * 1024 ? 1 : 2)} MB`
      : size;
  const openHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const response = await fetch(
        `/api/contents/${encodeURIComponent(item.id)}/versions`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("历史版本暂未接入数据库");
      const data = (await response.json()) as { versions: HistoryRecord[] };
      setHistoryRecords(data.versions);
    } catch {
      setHistoryRecords([]);
    } finally {
      setHistoryLoading(false);
    }
  };
  useEffect(() => {
    let cancelled = false;
    const loadPreview = async () => {
      setPreviewLoading(true);
      try {
        const response = await fetch(
          `/api/contents/${encodeURIComponent(item.id)}/versions`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error();
        const data = (await response.json()) as { versions: HistoryRecord[] };
        const current = data.versions.find((version) => version.current);
        const urls =
          item.kind === "视频"
            ? [current?.fileUrl].filter((url): url is string => Boolean(url))
            : (current?.files ?? [])
                .map((file) => file.fileUrl)
                .filter((url): url is string => Boolean(url));
        if (!cancelled) setPreviewUrls(urls);
      } catch {
        if (!cancelled) setPreviewUrls([]);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [item.id, item.kind, item.version]);
  return (
    <>
      <section
        className={
          item.featured
            ? "panel unified-detail featured-detail"
            : "panel unified-detail"
        }
      >
        <div className="unified-detail-head">
          <div className="detail-title-wrap">
            {onBack && (
              <button className="back-square" onClick={onBack}>
                ←
              </button>
            )}
            <div>
              <div className="review-title-badges">
                <Badge tone={tone}>{item.status}</Badge>
                {item.featured && (
                  <span className="featured-badge">★ 推荐案例</span>
                )}
                <span>
                  {item.kind} · {item.version}
                </span>
              </div>
              <h2>{item.title}</h2>
              <p>
                {item.id} · 上传人 {item.owner} · 更新于 {item.time}
              </p>
            </div>
          </div>
          {showHistory && (
            <button
              className="history-button"
              onClick={() => void openHistory()}
            >
              ⑂ 查看历史版本
            </button>
          )}
        </div>
        <div className="unified-detail-body">
          {mediaEditor??<div className="detail-preview">
            {previewLoading ? (
              <div className="phone-preview">
                <span>…</span>
                <p>正在读取预览</p>
              </div>
            ) : item.kind === "视频" && previewUrls[0] ? (
              <video
                className="real-video-preview"
                controls
                preload="metadata"
                src={previewUrls[0]}
              />
            ) : item.kind === "图文" && previewUrls.length ? (
              <div className="real-image-preview">
                {previewUrls.map((url, index) => (
                  <img
                    src={url}
                    alt={`${item.title} 第${index + 1}张`}
                    key={url}
                  />
                ))}
              </div>
            ) : (
              <div className="phone-preview">
                <span>{item.kind === "视频" ? "▶" : "▤"}</span>
                <p>文件尚未上传完成</p>
              </div>
            )}
            <small>{item.detail}</small>
          </div>}
          <div className="detail-fields">
            <h3>内容基础信息{editable ? " · 编辑模式" : ""}</h3>
            <div className="detail-field-grid">
              <label className="wide">
                <span>内容标题</span>
                {editable ? (
                  <input
                    value={item.title}
                    onChange={(e) => onTitleChange?.(e.target.value)}
                  />
                ) : (
                  <strong>{item.title}</strong>
                )}
              </label>
              <label>
                <span>内容类型</span>
                <strong>{item.kind}</strong>
              </label>
              <label>
                <span>文件版本</span>
                <strong>{item.version}</strong>
              </label>
              <label>
                <span>关联商品</span>
                {productControl ?? <strong className="detail-product-value"><ProductImage url={item.productImageUrl} name={item.product}/>{item.product || "未分配"}</strong>}
              </label>
              <label>
                <span>所属项目</span>
                <strong>{item.account || "未分配"}</strong>
              </label>
              <label>
                <span>上传员工</span>
                <strong>{item.owner}</strong>
              </label>
              <label>
                <span>可见范围</span>
                <strong>◌ {item.featured?"推荐共享":"本人及授权人员"}</strong>
              </label>
              <label className="wide">
                <span>备注</span>
                {editable ? (
                  <textarea
                    value={item.remark}
                    onChange={(e) => onRemarkChange?.(e.target.value)}
                    placeholder="填写内容备注"
                  />
                ) : (
                  <strong>{item.remark || "暂无备注"}</strong>
                )}
              </label>
            </div>
            {item.featured && (
              <div className="featured-reason">
                <strong>★ 推荐案例审核评语</strong>
                <p>{item.featuredReason}</p>
              </div>
            )}
            {item.status === "已驳回" && (
              <div className="rejection-reason">
                <strong>驳回原因</strong>
                <p>{item.rejectionReason || "暂无驳回批注"}</p>
                {item.rejectedAt && <small>驳回时间：{item.rejectedAt}</small>}
              </div>
            )}
            {extraFields}
            {item.locked && (
              <div className="detail-lock-note">
                ♙ 当前内容由 {item.lockOwner} 审核中，业务状态和内容文件已锁定。
              </div>
            )}
          </div>
        </div>
        {footer && <div className="unified-detail-footer">{footer}</div>}
      </section>
      {historyOpen && (
        <div
          className="settings-drawer-backdrop"
          onClick={() => setHistoryOpen(false)}
        >
          <aside
            className="settings-drawer version-history-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drawer-head">
              <div>
                <small>内容历史版本</small>
                <h3>{item.title}</h3>
                <p>
                  {item.id} · 当前 {item.version}
                </p>
              </div>
              <button onClick={() => setHistoryOpen(false)}>×</button>
            </div>
            <div className="history-drawer-body">
              {historyLoading ? (
                <div className="history-loading">正在读取历史版本…</div>
              ) : historyRecords.length ? (
                historyRecords.map((version) => (
                  <article
                    className={
                      version.current
                        ? "history-record current"
                        : "history-record"
                    }
                    key={version.versionNumber}
                  >
                    <div className="history-version-mark">
                      V{version.versionNumber}
                    </div>
                    <div>
                      <strong>{version.fileName}</strong>
                      <small>
                        {formatSize(version.fileSize)} · {version.uploaderName}
                      </small>
                      <small>{version.createdAt}</small>
                    </div>
                    {version.current ? (
                      <Badge tone="green">当前版本</Badge>
                    ) : (
                      <Badge tone="slate">历史版本</Badge>
                    )}
                    {version.fileUrl && (
                      <a
                        href={version.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        查看文件
                      </a>
                    )}
                  </article>
                ))
              ) : (
                <div className="empty-state">暂无可查看的版本记录</div>
              )}
            </div>
            <div className="drawer-actions">
              <button onClick={() => setHistoryOpen(false)}>关闭</button>
              <button
                className="primary-button"
                onClick={() => {
                  setHistoryOpen(false);
                  navigate("版本管理", item.id);
                }}
              >
                进入版本管理中心
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

type TrashContent = {
  uploaderUserId?:number;
  contentColor?:string|null;
  id: number;
  code: string;
  title: string;
  contentType: string;
  reviewStatus: string;
  trashPreviousStatus: string | null;
  latestVersionNumber: number;
  deletedAt: string;
  createdAt: string;
  uploaderName: string;
  productName: string | null;
  accountName: string | null;
};
function ContentRecycleBin({
  notify,
  onBack,
  onChanged,
}: {
  notify: (message: string, tone?: "success" | "error") => void;
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const [items, setItems] = useState<TrashContent[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("全部类型");
  const [owner, setOwner] = useState("全部员工");
  const [canPurge, setCanPurge] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<"restore" | "purge" | null>(null);
  const [busy, setBusy] = useState(false);
  const [smartRules, setSmartRules] = useState<SmartFilterRule[]>([]);
  const [previewItem,setPreviewItem]=useState<TrashContent|null>(null);
  const [page,setPage]=useState(1);const [pageSize,setPageSize]=useState(20);
  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/contents/trash", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        error?: string;
        contents?: TrashContent[];
        canPurge?: boolean;
      };
      if (!response.ok || !data.contents)
        throw new Error(data.error ?? "回收站读取失败");
      setItems(data.contents);
      setCanPurge(Boolean(data.canPurge));
      setSelected((current) =>
        current.filter((code) =>
          data.contents!.some((item) => item.code === code),
        ),
      );
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "回收站读取失败");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const owners = useMemo(
    () => [...new Set(items.map((item) => item.uploaderName))],
    [items],
  );
  const recycleProductOptions = useMemo(
    () => [...new Set(items.map((item) => item.productName ?? "未分配"))].sort((a, b) => a.localeCompare(b)),
    [items],
  );
  const recycleFields = useMemo<SmartFilterField<TrashContent>[]>(() => [
    { key: "query", label: "关键词", type: "text", getValue: (item) => [item.title, item.code, item.productName, item.accountName, item.uploaderName] },
    { key: "contentType", label: "内容类型", type: "select", options: [{ value: "video", label: "视频" }, { value: "image_text", label: "图文" }], getValue: (item) => item.contentType },
    { key: "owner", label: "上传员工", type: "select", options: owners.map((value) => ({ value, label: value })), getValue: (item) => item.uploaderName },
    { key: "reviewStatus", label: "删除前状态", type: "select", options: [{value:"draft",label:"草稿"},{value:"pending",label:"待审核"},{value:"reviewing",label:"审核中"},{value:"approved",label:"已通过"},{value:"rejected",label:"已驳回"}], getValue: (item) => item.trashPreviousStatus ?? item.reviewStatus },
    { key: "product", label: "关联商品", type: "select", options: recycleProductOptions.map((value) => ({ value, label: value })), getValue: (item) => item.productName ?? "未分配" },
    { key: "account", label: "所属项目", type: "text", getValue: (item) => item.accountName },
    { key: "version", label: "版本", type: "number", getValue: (item) => item.latestVersionNumber },
    { key: "createdAt", label: "上传时间", type: "date", getValue: (item) => item.createdAt },
    { key: "deletedAt", label: "删除时间", type: "date", getValue: (item) => item.deletedAt },
  ], [items, owners, recycleProductOptions]);
  const visible = useMemo(() => applySmartFilters(items, smartRules, recycleFields), [items, smartRules, recycleFields]);
  const pageCount=Math.max(1,Math.ceil(visible.length/pageSize));const pageRows=visible.slice((Math.min(page,pageCount)-1)*pageSize,Math.min(page,pageCount)*pageSize);
  const act = async (action: "restore" | "purge") => {
    setBusy(true);
    try {
      const response = await fetch("/api/contents/trash", {
        method: action === "restore" ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ codes: selected }),
      });
      const data = (await response.json()) as {
        error?: string;
        count?: number;
      };
      if (!response.ok) throw new Error(data.error ?? "操作失败");
      setConfirm(null);
      setSelected([]);
      await load();
      await onChanged();
      notify(
        action === "restore"
          ? `已恢复 ${data.count ?? 0} 条内容`
          : `已永久删除 ${data.count ?? 0} 条内容及对应文件`,
      );
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };
  const previousLabel = (status: string | null) =>
    ({
      draft: "草稿",
      pending: "待审核",
      reviewing: "审核中",
      approved: "已通过",
      rejected: "已驳回",
    })[status ?? ""] ??
    status ??
    "草稿";
  return (
    <>
      <div className="drilldown-header recycle-bin-header">
        <button onClick={onBack}>←</button>
        <div>
          <small>内容池 / 回收站</small>
          <h2>内容回收站</h2>
          <p>
            删除内容先进入这里；恢复后回到原流程状态，永久删除会同时清理原始文件。
          </p>
        </div>
        <strong>{items.length} 条</strong>
      </div>
      <section className="panel module-panel recycle-bin-panel">
        <div className="content-filter-main legacy-list-filter" aria-hidden="true">
          <label>
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索内容名称、编号、商品或上传人"
            />
          </label>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option>全部类型</option>
            <option>视频</option>
            <option>图文</option>
          </select>
          <select
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
          >
            <option>全部员工</option>
            {owners.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <button className="secondary-button" onClick={() => void load()}>
            ↻ 刷新
          </button>
        </div>
        <RuleFilterBar moduleKey="trash" fields={recycleFields} rules={smartRules} onChange={setSmartRules} />
        <div className="trash-toolbar">
          <div>
            <strong>已选择 {selected.length} 条</strong>
            <small>永久删除后无法恢复，请先确认不是需要保留的正式内容。</small>
          </div>
          <div>
            <button
              disabled={!selected.length || busy}
              onClick={() => setConfirm("restore")}
            >
              恢复所选内容
            </button>
            {canPurge && (
              <button
                className="danger"
                disabled={!selected.length || busy}
                onClick={() => setConfirm("purge")}
              >
                永久删除
              </button>
            )}
          </div>
        </div>
        <div className="table-wrap">
          <table className="module-table recycle-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={
                      pageRows.length > 0 &&
                      pageRows.every((item) => selected.includes(item.code))
                    }
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [
                              ...new Set([
                                ...selected,
                                ...pageRows.map((item) => item.code),
                              ]),
                            ]
                          : selected.filter(
                              (code) =>
                                !pageRows.some((item) => item.code === code),
                            ),
                      )
                    }
                  />
                </th>
                <th>内容</th>
                <th>删除前状态</th>
                <th>关联商品</th>
                <th>所属项目</th>
                <th>上传人</th>
                <th>版本</th>
                <th>上传时间</th>
                <th>删除时间</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((item, index) => (
                <tr key={item.code} style={{backgroundColor:employeeColor(item.uploaderUserId??item.uploaderName,item.contentColor)}}>
                  <td onClick={()=>setPreviewItem(item)} style={{cursor:"pointer"}}>
                    <input
                      type="checkbox"
                      checked={selected.includes(item.code)}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? [...selected, item.code]
                            : selected.filter((code) => code !== item.code),
                        )
                      }
                    />
                  </td>
                  <td>
                    <div className={`thumb thumb-${(index % 4) + 1}`}>
                      <span>{item.contentType === "video" ? "▶" : "▤"}</span>
                    </div>
                    <div className="content-cell">
                      <strong>{item.title}</strong>
                      <small>
                        {item.code} ·{" "}
                        {item.contentType === "video" ? "视频" : "图文"}
                      </small>
                    </div>
                  </td>
                  <td>
                    <Badge tone="slate">
                      {previousLabel(
                        item.trashPreviousStatus ?? item.reviewStatus,
                      )}
                    </Badge>
                  </td>
                  <td>{item.productName ?? "未分配"}</td>
                  <td>{item.accountName ?? "未分配"}</td>
                  <td>{item.uploaderName}</td>
                  <td>V{item.latestVersionNumber}</td>
                  <td>{formatServerTime(item.createdAt)}</td>
                  <td>{formatServerTime(item.deletedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !visible.length && (
            <div className="empty-state">回收站中没有符合条件的内容</div>
          )}
        </div>
        <div className="list-pagination"><label>每页<select value={pageSize} onChange={event=>{setPageSize(Number(event.target.value));setPage(1);setSelected([]);}}><option value="20">20条</option><option value="50">50条</option><option value="100">100条</option></select></label><span>共{visible.length}条 · {Math.min(page,pageCount)}/{pageCount}页</span><button disabled={page<=1} onClick={()=>{setPage(value=>value-1);setSelected([]);}}>上一页</button><button disabled={page>=pageCount} onClick={()=>{setPage(value=>value+1);setSelected([]);}}>下一页</button></div>
      </section>
      {previewItem?<CenterDialog title="回收站预览（只读）" onClose={()=>setPreviewItem(null)}><div className="report-detail"><p>{previewItem.code} · V{previewItem.latestVersionNumber}</p><h3>{previewItem.title}</h3><p>{previewItem.contentType==="video"?"视频内容":"图文内容"} · 上传人：{previewItem.uploaderName}</p><p>删除前状态：{previousLabel(previewItem.trashPreviousStatus??previewItem.reviewStatus)}</p><p>已删除时间：{formatServerTime(previewItem.deletedAt)}</p><small>回收站内容仅可预览和查看，不能在此处编辑、恢复或删除。</small></div></CenterDialog>:null}
      {confirm && (
        <div className="modal-backdrop confirm-layer">
          <div className="modal confirm-modal">
            <div className="confirm-icon">!</div>
            <h3>
              {confirm === "restore"
                ? `确认恢复 ${selected.length} 条内容？`
                : `确认永久删除 ${selected.length} 条内容？`}
            </h3>
            <p>
              {confirm === "restore"
                ? "内容将恢复到删除前的流程状态；审核队列占用不会恢复。"
                : "数据库记录、所有历史版本以及视频或图片原文件都会被删除，此操作无法撤销。"}
            </p>
            <div className="confirm-actions">
              <button disabled={busy} onClick={() => setConfirm(null)}>
                取消
              </button>
              <button
                disabled={busy}
                className={
                  confirm === "purge" ? "danger-confirm" : "primary-button"
                }
                onClick={() => void act(confirm)}
              >
                {busy
                  ? "处理中"
                  : confirm === "restore"
                    ? "确认恢复"
                    : "确认永久删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ContentPool({
  notify,
  navigate,
  rows,
  setRows,
  onResubmit,
  reloadContents,
  pagination,
  businessData,
  canFeature,
  currentUserId,
  initialTarget,
}: Pick<Props, "notify" | "navigate"> & {
  rows: UnifiedContent[];
  setRows: React.Dispatch<React.SetStateAction<UnifiedContent[]>>;
  onResubmit: (row: UnifiedContent, fileName: string) => void;
  reloadContents: (options?: ContentLoadOptions) => Promise<void>;
  pagination: ContentPagination;
  businessData: BusinessData;
  canFeature: boolean;
  currentUserId: number;
  initialTarget?: string;
}) {
  const { context } = useBusinessContext();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [archivedView,setArchivedView]=useState(false);
  const [expandedLane,setExpandedLane]=useState<number|null>(null);
  const [lanePages,setLanePages]=useState([1,1,1,1]);
  const [lanePageSizes,setLanePageSizes]=useState([20,20,20,20]);
  const [archiveTarget,setArchiveTarget]=useState<UnifiedContent|null>(null);
  const [archiveReason,setArchiveReason]=useState("");
  const [archiveBusy,setArchiveBusy]=useState(false);
  const [boardSort,setBoardSort]=useState("default");
  const [boardPermissions,setBoardPermissions]=useState<string[]>([]);
  const [companyManager,setCompanyManager]=useState(false);
  const [contentGroups,setContentGroups]=useState<Array<{id:number;name:string;code:string;accountId:number|null;accountName:string|null;themeColor:string|null;coverPath:string|null;canView?:boolean;canUpload?:boolean}>>([]);
  const [groupScope,setGroupScope]=useState("mine");
  const [uploadGroupId,setUploadGroupId]=useState("");
  const [categories,setCategories]=useState<Array<{id:number;name:string;status:string}>>([]);
  const [uploadCategoryId,setUploadCategoryId]=useState("");
  useEffect(()=>{void fetch('/api/content-categories').then(response=>response.json()).then(data=>setCategories(data.items??[]));},[]);
  const scrollPositions=useRef<Record<number,number>>({});
  const boardCan=(permission:string)=>permissionGranted(boardPermissions,permission);
  useEffect(()=>{void fetch("/api/auth/me",{cache:"no-store"}).then(r=>r.json()).then(({user})=>{
    setBoardPermissions(user?.roleCode==="super_admin"?["*"]:user?.permissions??[]);
    setCompanyManager(user?.roleCode==="super_admin"||(user?.dataScope==="company"&&permissionGranted(user?.permissions??[],"content.delete")&&["admin.users","review.process","publishing.assign","publishing.status"].some(key=>permissionGranted(user?.permissions??[],key))));
  });},[]);
  useEffect(()=>{void Promise.all([fetch("/api/groups?scope=view",{cache:"no-store"}).then(r=>r.ok?r.json():{groups:[]}),fetch("/api/groups?scope=upload",{cache:"no-store"}).then(r=>r.ok?r.json():{groups:[]})]).then(([visible,uploadable])=>{const visibleIds=new Set<number>((visible.groups??[]).map((item:{id:number})=>item.id));const uploadIds=new Set<number>((uploadable.groups??[]).map((item:{id:number})=>item.id));const combined=[...(visible.groups??[]),...(uploadable.groups??[])].filter((item,index,all)=>all.findIndex(other=>other.id===item.id)===index).map(item=>({...item,canView:visibleIds.has(item.id),canUpload:uploadIds.has(item.id)}));setContentGroups(combined);const preferred=uploadable.groups?.find((item:{id:number;accountId:number|null})=>item.id===context?.groupId&&item.accountId===context.accountId)??uploadable.groups?.find((item:{accountId:number|null})=>item.accountId===context?.accountId)??uploadable.groups?.[0];setUploadGroupId(current=>current||String(preferred?.id??""));setAccount(current=>current||String(preferred?.accountId??""));});},[context?.accountId,context?.groupId]);
  useEffect(()=>{void fetch("/api/system/settings",{cache:"no-store"}).then(async response=>response.ok?response.json():null).then(data=>{if(!data?.settings)return;const next={...emptyUiSettings,...data.settings};setUiSettings(next);const size=Number(next.defaultPageSize);if([20,50,100].includes(size))setListPageSize(size);});},[]);
  const patchContent=async(code:string,payload:Record<string,unknown>)=>{
    const response=await fetch(`/api/contents/${encodeURIComponent(code)}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
    const data=await response.json();if(!response.ok)throw new Error(data.error??"操作失败");
  };
  const [detailActionBusy,setDetailActionBusy]=useState(false);
  const [trashTarget,setTrashTarget]=useState<UnifiedContent|null>(null);
  const runDetailAction=async(row:UnifiedContent,action:string)=>{
    if(detailActionBusy)return;setDetailActionBusy(true);
    try{await patchContent(row.id,{action});await reloadContents();notify(action==="submit"?"已提交审核":"已撤回草稿","success");}catch(e){notify((e as Error).message,"error");}finally{setDetailActionBusy(false);}
  };
  const archiveContent=async()=>{
    if(!archiveTarget)return;setArchiveBusy(true);
    try{
      const payload={action:archiveTarget.archivedAt?"unarchive":"archive",codes:[archiveTarget.id],reason:archiveReason,confirmRecommendationCancellation:false};let response=await fetch("/api/contents/batch",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});let data=await response.json();if(!response.ok&&data.requiresRecommendationConfirmation&&window.confirm(`${data.error}，是否继续？`)){response=await fetch("/api/contents/batch",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...payload,confirmRecommendationCancellation:true})});data=await response.json();}if(!response.ok)throw new Error(data.error);
      setArchiveTarget(null);setArchiveReason("");await reloadContents();notify("处理完成","success");
    }catch(reason){notify(reason instanceof Error?reason.message:"处理失败","error");}finally{setArchiveBusy(false);}
  };
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailId, setDetailId] = useState("");
  const [detailMode, setDetailMode] = useState<"view" | "edit">("view");
  const [batchModal, setBatchModal] = useState<"rename" | "remark" | null>(
    null,
  );
  const [batchValue, setBatchValue] = useState("");
  const [titleBase, setTitleBase] = useState("");
  const [contentType, setContentType] = useState("");
  const [product, setProduct] = useState("");
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productNextSequence, setProductNextSequence] = useState(1);
  const [account, setAccount] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [uploadRows, setUploadRows] = useState<
    {
      fileName: string;
      title: string;
      file: File;
      durationSeconds: number | null;
    }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const [uploadExitConfirm, setUploadExitConfirm] = useState(false);
  const [createdUploadCodes, setCreatedUploadCodes] = useState<string[]>([]);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const [versionUploadOpen, setVersionUploadOpen] = useState(false);
  const [versionFiles, setVersionFiles] = useState<File[]>([]);
  const setVersionFile = (file: File | null) =>
    setVersionFiles(file ? [file] : []);
  const [versionConfirmOpen, setVersionConfirmOpen] = useState(false);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [draftExistingFiles,setDraftExistingFiles]=useState<Array<{id:number;fileName:string;fileUrl:string|null}>>([]);
  const [draftAddedFiles,setDraftAddedFiles]=useState<File[]>([]);
  const [draftRemovedIds,setDraftRemovedIds]=useState<number[]>([]);
  const [draftOriginal,setDraftOriginal]=useState<{title:string;remark:string}|null>(null);
  const [draftPreview,setDraftPreview]=useState("");
  const [draftUploading, setDraftUploading] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [filterKind, setFilterKind] = useState("全部类型");
  const [filterStatus, setFilterStatus] = useState("全部状态");
  const [filterOwner, setFilterOwner] = useState("全部员工");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [uploadTimePreset,setUploadTimePreset]=useState("全部时间");
  const [createdFrom,setCreatedFrom]=useState("");
  const [createdTo,setCreatedTo]=useState("");
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(20);
  const [uiSettings,setUiSettings]=useState<UiSettings>(emptyUiSettings);
  const [superFilterOpen, setSuperFilterOpen] = useState(false);
  const [smartRules, setSmartRules] = useState<SmartFilterRule[]>([]);
  const [savedFilters, setSavedFilters] = useState<
    Array<{
      id: number;
      name: string;
      conditions: Array<{ field: string; operator: string; value: unknown }>;
    }>
  >([]);
  const [filterSchemeName, setFilterSchemeName] = useState("");
  const [featureModal, setFeatureModal] = useState<
    "feature" | "unfeature" | null
  >(null);
  const [featureReason, setFeatureReason] = useState("");
  const [featureTags, setFeatureTags] = useState("");
  const [featureBusy, setFeatureBusy] = useState(false);
  useEffect(() => {
    if (initialTarget === "__featured__") {
      setSmartRules(current=>current.some(rule=>rule.field==="recommended"&&rule.value==="是")?current:[{ id: ruleId(), join: "and", field: "recommended", operator: "eq", value: "是" }]);
      return;
    }
    if (initialTarget && rows.some((row) => row.id === initialTarget)) {
      setDetailId(initialTarget);
      setDetailMode("view");
    }
  }, [initialTarget, rows]);
  const ownerOptions = useMemo(
    () => [...new Set(rows.map((row) => row.owner))],
    [rows],
  );
  const contentFilterFields = useMemo<SmartFilterField<UnifiedContent>[]>(() => [
    { key: "query", label: "关键词", type: "text", getValue: (row) => [row.title, row.id, row.product, row.account, row.owner] },
    { key: "reviewStatus", label: "审核状态", type: "select", options: ["草稿", "待审核", "审核中", "已通过", "已驳回"].map((label) => ({ value: label, label })), getValue: (row) => row.status },
    { key: "categoryId", label: "业务分类", type: "select", options: categories.map(category=>({value:String(category.id),label:category.name})), getValue: (row) => String(row.categoryId??"") },
    { key: "contentType", label: "文件格式", type: "select", options: ["视频", "图文"].map((label) => ({ value: label, label })), getValue: (row) => row.kind },
    { key: "owner", label: "上传员工", type: "select", options: [...new Set(rows.map((row) => row.owner))].map((label) => ({ value: label, label })), getValue: (row) => row.owner },
    { key: "group", label: "内容小组", type: "select", options: [...new Set(rows.map((row) => row.groupName).filter(Boolean))].map((label) => ({ value: String(label), label: String(label) })), getValue: (row) => row.groupName??"未分组" },
    { key: "product", label: "关联商品", type: "select", options: [...new Set(rows.map((row) => row.product))].map((label) => ({ value: label, label })), getValue: (row) => row.product },
    { key: "account", label: "所属项目", type: "select", options: [...new Set(rows.map((row) => row.account))].map((label) => ({ value: label, label })), getValue: (row) => row.account },
    { key: "visibility", label: "可见范围", type: "select", options: ["仅本人和管理员", "全部可见"].map((label) => ({ value: label, label })), getValue: (row) => row.visibility },
    { key: "recommended", label: "推荐案例", type: "select", options: [{ value: "是", label: "是" }, { value: "否", label: "否" }], getValue: (row) => row.featured ? "是" : "否" },
    { key: "createdAt", label: "上传时间", type: "date", getValue: (row) => row.createdAt ?? row.time },
    { key: "fileSize", label: "文件大小", type: "number", getValue: (row) => row.fileSize ?? 0 },
    { key: "duration", label: "视频时长", type: "number", getValue: (row) => row.durationSeconds ?? 0 },
    { key: "imageCount", label: "图片数量", type: "number", getValue: (row) => row.imageCount ?? 0 },
    { key: "version", label: "版本", type: "text", getValue: (row) => row.version },
  ], [rows,categories]);
  const filteredRows = rows; // Server applies rules before per-lane pagination.
  const totalPages = Math.max(1, pagination.totalPages);
  const visibleRows = filteredRows;
  useEffect(() => {
    setListPage(1);setLanePages([1,1,1,1]);setSelectedIds([]);scrollPositions.current={};
  }, [listPageSize, smartRules,archivedView,boardSort,groupScope]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reloadContents({
        page: listPage,
        pageSize: listPageSize,
        board:true, archived:archivedView, lanePages:JSON.stringify(lanePages),lanePageSizes:JSON.stringify(lanePageSizes),sort:boardSort,
        group:groupScope,
        rules: JSON.stringify(smartRules),
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [listPage,listPageSize,smartRules,archivedView,lanePages,lanePageSizes,boardSort,groupScope]);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("orbit:content-pool-state");
      if (!raw) return;
      const state = JSON.parse(raw) as {
        pageSize?: number;
        smartRules?: SmartFilterRule[];
        groupScope?:string;
      };
      setSmartRules(state.smartRules ?? []);
      setGroupScope(state.groupScope??"mine");
      setListPageSize(
        [20, 50, 100].includes(state.pageSize ?? 0) ? state.pageSize! : 20,
      );
    } catch {}
  }, []);
  useEffect(() => {
    sessionStorage.setItem(
      "orbit:content-pool-state",
      JSON.stringify({
        pageSize: listPageSize,
        smartRules,
        groupScope,
      }),
    );
  }, [listPageSize, smartRules,groupScope]);
  useEffect(() => {
    if (!superFilterOpen) return;
    void fetch("/api/filters?module=contents", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { saved?: typeof savedFilters }) =>
        setSavedFilters(data.saved ?? []),
      )
      .catch(() => setSavedFilters([]));
  }, [superFilterOpen]);
  const currentFilterConditions = () => [
    { field: "query", operator: "contains", value: filterQuery },
    { field: "contentType", operator: "eq", value: filterKind },
    { field: "reviewStatus", operator: "eq", value: filterStatus },
    { field: "owner", operator: "eq", value: filterOwner },
    { field: "recommended", operator: "eq", value: featuredOnly },
    {field:"createdFrom",operator:"gte",value:createdFrom},
    {field:"createdTo",operator:"lte",value:createdTo},
  ];
  const applySavedFilter = (
    conditions: Array<{ field: string; value: unknown }>,
  ) => {
    let hasSavedDate=false;
    for (const condition of conditions) {
      if (condition.field === "query")
        setFilterQuery(String(condition.value ?? ""));
      if (condition.field === "contentType")
        setFilterKind(String(condition.value ?? "全部类型"));
      if (condition.field === "reviewStatus")
        setFilterStatus(String(condition.value ?? "全部状态"));
      if (condition.field === "owner")
        setFilterOwner(String(condition.value ?? "全部员工"));
      if (condition.field === "recommended")
        setFeaturedOnly(Boolean(condition.value));
      if(condition.field==="createdFrom"){setCreatedFrom(String(condition.value??""));hasSavedDate=Boolean(condition.value);}
      if(condition.field==="createdTo"){setCreatedTo(String(condition.value??""));hasSavedDate=Boolean(condition.value)||hasSavedDate;}
    }
    setUploadTimePreset(hasSavedDate?"自定义":"全部时间");
    setSuperFilterOpen(false);
  };
  const saveFilterScheme = async () => {
    if (!filterSchemeName.trim()) {
      notify("请填写筛选方案名称");
      return;
    }
    const response = await fetch("/api/filters", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        moduleKey: "contents",
        name: filterSchemeName.trim(),
        conditions: currentFilterConditions(),
      }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      notify(data.error ?? "筛选方案保存失败");
      return;
    }
    setFilterSchemeName("");
    setSuperFilterOpen(false);
    notify("超级筛选方案已保存");
  };
  const selected = rows.filter((row) => selectedIds.includes(row.id));
  const detail = rows.find((row) => row.id === detailId);
  const formatDateInput=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  const applyUploadTimePreset=(preset:string)=>{setUploadTimePreset(preset);if(preset==="全部时间"){setCreatedFrom("");setCreatedTo("");return;}if(preset==="自定义")return;const end=new Date();const start=new Date(end);if(preset==="近7天")start.setDate(end.getDate()-6);if(preset==="近30天")start.setDate(end.getDate()-29);setCreatedFrom(formatDateInput(start));setCreatedTo(formatDateInput(end));};

  const renameUploadRows = (base: string, current = uploadRows, start = productNextSequence) => {
    const match=base.match(/^(.*?)(\d{3})$/);
    const prefix=match?match[1]:base;
    const first=match?Number(match[2]):start;
    setUploadRows(current.map((row,index)=>({...row,title:`${prefix}${String(first+index).padStart(3,"0")}`})));
  };
  const selectUploadProduct = async (value: string) => {
    setProduct(value);
    setProductPickerOpen(false);
    const item = businessData.productMasters.find((candidate) => String(candidate.id) === value);
    if (!item) { setTitleBase(""); setProductNextSequence(1); return; }
    let sequence = 1;
    try {
      const response = await fetch(`/api/contents/next-title?productMasterId=${encodeURIComponent(value)}`, { cache: "no-store" });
      if (response.ok) sequence = Number((await response.json()).sequence) || 1;
    } catch {}
    const prefix = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}-${String(new Date().getDate()).padStart(2,"0")}-${item.name}-`;
    setProductNextSequence(sequence);
    setTitleBase(`${prefix}${String(sequence).padStart(3,"0")}`);
    renameUploadRows(`${prefix}${String(sequence).padStart(3,"0")}`, uploadRows, sequence);
  };
  const detectedFileKind = (file: File) =>
    file.type.startsWith("video/") ||
    /\.(mp4|mov|m4v|avi|mkv|webm)$/i.test(file.name)
      ? "视频"
      : file.type.startsWith("image/") ||
          /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(file.name)
        ? "图文"
        : "未知";
  const chooseFiles = async (files: FileList | null) => {
    if (!contentType) {
      notify("请先选择内容类型，再选择文件");
      return;
    }
    const incoming = Array.from(files ?? []);
    if (incoming.some((file) => detectedFileKind(file) !== contentType)) {
      setUploadRows([]);
      notify(
        contentType === "视频"
          ? "视频上传只能选择视频文件，不能混入图片"
          : "图文上传只能选择图片，不能混入视频",
      );
      return;
    }
    const picked = incoming.slice(0, 20);
    const base = titleBase.trim() || `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}-${String(new Date().getDate()).padStart(2,"0")}-${businessData.productMasters.find((item)=>String(item.id)===product)?.name??"内容"}-${String(productNextSequence).padStart(3,"0")}`;
    const titleMatch=base.match(/^(.*?)(\d{3})$/);
    const titlePrefix=titleMatch?titleMatch[1]:base;
    const titleStart=titleMatch?Number(titleMatch[2]):productNextSequence;
    const durations =
      contentType === "视频"
        ? await Promise.all(picked.map(readVideoDuration))
        : picked.map(() => null);
    const next = picked.map((file, index) => ({
      fileName: file.name,
      file,
      durationSeconds: durations[index],
        title: `${titlePrefix}${String(titleStart + index).padStart(3, "0")}`,
    }));
    setUploadRows(next);
    if (incoming.length > 20)
      notify(
        contentType === "视频"
          ? "单次最多上传20条视频，其余文件未加入队列"
          : "一套图文最多20张图片，其余图片未加入本套内容",
      );
  };
  const resetUploadForm = () => {
    setUploadOpen(false);
    setUploadRows([]);
    setTitleBase("");
    setContentType("");
    setProduct("");
    setProductPickerOpen(false);
    setProductNextSequence(1);
    setAccount("");
    setVisibility("private");
    setCreatedUploadCodes([]);
    setUploadExitConfirm(false);
  };
  const cleanupUploadSession = async (codes = createdUploadCodes) => {
    if (!codes.length) return;
    const response = await fetch("/api/contents/upload-session", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ codes }),
    });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      throw new Error(data.error ?? "未完成内容清理失败");
    }
  };
  const requestUploadExit = () => {
    if (!uploadRows.length && !createdUploadCodes.length && !uploading) {
      resetUploadForm();
      return;
    }
    setUploadExitConfirm(true);
  };
  const confirmUploadExit = async () => {
    uploadAbortRef.current?.abort();
    setUploading(false);
    try {
      await cleanupUploadSession();
      resetUploadForm();
      notify("已退出上传，并删除本次尚未提交的内容和文件");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "退出清理失败，请重试");
    }
  };
  const saveUploads = async (finalAction: "draft" | "submit") => {
    if (!uploadRows.length) {
      notify("请先选择至少一个文件");
      return;
    }
    if (!titleBase.trim() || !contentType || !product) {
      notify("请选择商品，并填写内容类型和标题");
      return;
    }
    setUploading(true);
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    let createdCodes: string[] = [];
    try {
      const fileDetails = uploadRows.map((row) => ({
        fileName: row.file.name,
        mimeType: row.file.type || "application/octet-stream",
        fileSize: row.file.size,
        durationSeconds: row.durationSeconds,
      }));
      const common = {
        categoryId:Number(uploadCategoryId)||null,
        productMasterId: Number(product) || null,
        productId: null,
        accountId: Number(account) || null,
        visibility,
      };
      const items =
        contentType === "视频"
          ? uploadRows.map((row) => ({
              title: row.title,
              contentType: "video",
              durationSeconds: row.durationSeconds,
              files: [
                {
                  fileName: row.file.name,
                  mimeType: row.file.type || "application/octet-stream",
                  fileSize: row.file.size,
                  durationSeconds: row.durationSeconds,
                },
              ],
              ...common,
            }))
          : [
              {
                title: uploadRows[0]?.title || titleBase.trim(),
                contentType: "image_text",
                files: fileDetails,
                ...common,
              },
            ];
      const createResponse = await fetch("/api/contents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items,groupId:Number(uploadGroupId)||null }),
      });
      const created = (await createResponse.json()) as {
        error?: string;
        items?: { contentCode: string; uploads: { uploadUrl: string }[] }[];
      };
      if (!createResponse.ok || !created.items)
        throw new Error(created.error ?? "创建内容失败");
      createdCodes = created.items.map((item) => item.contentCode);
      setCreatedUploadCodes(createdCodes);
      const uploadTasks =
        contentType === "视频"
          ? created.items.map((item, index) => ({
              uploadUrl: item.uploads[0]?.uploadUrl,
              file: uploadRows[index].file,
            }))
          : created.items[0].uploads.map((upload, index) => ({
              uploadUrl: upload.uploadUrl,
              file: uploadRows[index].file,
            }));
      for (let start = 0; start < uploadTasks.length; start += 3) {
        await Promise.all(
          uploadTasks.slice(start, start + 3).map(async (item) => {
            const file = item.file;
            const uploadResponse = await uploadContentFile(item.uploadUrl, {
              method: "PUT",
              headers: {
                "content-type": file.type || "application/octet-stream",
              },
              body: file,
              signal: controller.signal,
            });
            if (!uploadResponse.ok) {
              const data = (await uploadResponse.json()) as { error?: string };
              throw new Error(data.error ?? `${file.name} 上传失败`);
            }
          }),
        );
      }
      if (finalAction === "submit")
        for (const code of createdCodes) {
          const response = await fetch(
            `/api/contents/${encodeURIComponent(code)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "submit" }),
            },
          );
          if (!response.ok) {
            const data = (await response.json()) as { error?: string };
            throw new Error(data.error ?? `${code} 提交审核失败`);
          }
        }
      await reloadContents();
      const count = created.items.length;
      const imageCount = uploadRows.length;
      resetUploadForm();
      notify(
        finalAction === "submit"
          ? contentType === "视频"
            ? `已上传并提交 ${count} 条视频，进入待审核列表`
            : `已上传并提交 1 套图文（${imageCount}张），进入待审核列表`
          : contentType === "视频"
            ? `已保存 ${count} 条视频草稿，每条内容自动生成独立 V1`
            : `已将 ${imageCount} 张图片保存为 1 套图文草稿，并自动生成 V1`,
      );
    } catch (reason) {
      if ((reason as Error)?.name !== "AbortError") {
        try {
          await cleanupUploadSession(createdCodes);
        } catch {}
        setCreatedUploadCodes([]);
        notify(
          reason instanceof Error
            ? `${reason.message}；本次未完成记录已清理，可重新上传`
            : "上传失败，本次未完成记录已清理",
        );
      }
    } finally {
      uploadAbortRef.current = null;
      setUploading(false);
    }
  };
  const updateSelected = (
    change: (row: UnifiedContent, index: number) => UnifiedContent,
  ) =>
    setRows(
      rows.map((row) => {
        const index = selectedIds.indexOf(row.id);
        return index >= 0 ? change(row, index) : row;
      }),
    );
  const applyContentAction = async (
    row: UnifiedContent,
    action: "submit" | "withdraw",
  ) => {
    const response = await fetch(
      `/api/contents/${encodeURIComponent(row.id)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      },
    );
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      throw new Error(data.error ?? "操作失败");
    }
  };
  const withdraw = async () => {
    const targets = selected.filter((row) => row.status === "待审核");
    try {
      await Promise.all(
        targets.map((row) => applyContentAction(row, "withdraw")),
      );
      await reloadContents();
      notify(`已撤回 ${targets.length} 条待审核内容；审核中的内容未处理`);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "撤回失败");
    }
  };
  const submitDrafts = async () => {
    const targets = selected.filter((row) => row.status === "草稿");
    try {
      await Promise.all(
        targets.map((row) => applyContentAction(row, "submit")),
      );
      await reloadContents();
      notify(`已批量提交 ${targets.length} 条草稿`);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "提交失败");
    }
  };
  const deleteSelected = async () => {
    if(!window.confirm("将所选可删除内容移入回收站？可在回收站恢复；审核中的内容不能撤回或删除。"))return;
    const targets = selected.filter(
      (row) => ["草稿", "已驳回"].includes(row.status) && !row.locked,
    );
    try {
      const payload={action:"trash",codes:targets.map(row=>row.id),confirmRecommendationCancellation:false};let response=await fetch("/api/contents/batch",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});let data=await response.json();if(!response.ok&&data.requiresRecommendationConfirmation&&window.confirm(`${data.error}，是否继续移入回收站？`)){response=await fetch("/api/contents/batch",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...payload,confirmRecommendationCancellation:true})});data=await response.json();}if(!response.ok)throw new Error(data.error??"删除失败");
      await reloadContents();
      setSelectedIds([]);
      notify(`已将 ${targets.length} 条内容移入回收站；其他状态内容未删除`,"success");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "删除失败");
    }
  };
  const archiveSelected=async()=>{
    const targets=selected.filter(row=>archivedView?Boolean(row.archivedAt):row.status!=="草稿");if(!targets.length){notify(archivedView?"请选择需要恢复的归档内容":"草稿不能归档，请选择审核流程中的内容","error");return;}
    const reason=archivedView?"":window.prompt("请输入本次批量归档原因")?.trim()??"";if(!archivedView&&!reason)return;
    try{const payload={action:archivedView?"unarchive":"archive",codes:targets.map(row=>row.id),reason,confirmRecommendationCancellation:false};let response=await fetch("/api/contents/batch",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});let data=await response.json();if(!response.ok&&data.requiresRecommendationConfirmation&&window.confirm(`${data.error}，是否继续？`)){response=await fetch("/api/contents/batch",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...payload,confirmRecommendationCancellation:true})});data=await response.json();}if(!response.ok)throw new Error(data.error??"操作失败");setSelectedIds([]);await reloadContents();notify(archivedView?`已恢复 ${targets.length} 条内容`:`已归档 ${targets.length} 条内容`,"success");}catch(error){notify((error as Error).message,"error");}
  };
  const applyBatchModal = async () => {
    if (!batchValue.trim()) return;
    const targets = selected.filter((row) => row.status === "草稿");
    try {
      await Promise.all(
        targets.map(async (row, index) => {
          const response = await fetch(
            `/api/contents/${encodeURIComponent(row.id)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                action: "update",
                title:
                  batchModal === "rename"
                    ? `${batchValue.trim()}${String(index + 1).padStart(3, "0")}`
                    : row.title,
                remark:
                  batchModal === "remark" ? batchValue.trim() : row.remark,
              }),
            },
          );
          const result = (await response.json()) as { error?: string };
          if (!response.ok) throw new Error(result.error ?? "批量修改失败");
        }),
      );
      await reloadContents();
      notify(
        batchModal === "rename"
          ? `已批量修改 ${targets.length} 条草稿名称`
          : `已批量填写 ${targets.length} 条草稿备注`,
      );
      setBatchModal(null);
      setBatchValue("");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "批量修改失败");
    }
  };
  const openDetail = (rowId: string, mode: "view" | "edit") => {
    setDetailId(rowId);
    setDetailMode(mode);
    setDraftFile(null);
  };
  const beginDraftEdit=async(row:UnifiedContent)=>{
    setDraftOriginal({title:row.title,remark:row.remark});setDraftFile(null);setDraftAddedFiles([]);setDraftRemovedIds([]);setDraftPreview("");
    try{const response=await fetch(`/api/contents/${encodeURIComponent(row.id)}/versions`,{cache:"no-store"});const data=await response.json() as {error?:string;versions?:Array<{current:boolean;files?:Array<{id:number;fileName:string;fileUrl:string|null}>}>};if(!response.ok)throw new Error(data.error??"文件列表读取失败");setDraftExistingFiles(data.versions?.find(version=>version.current)?.files??[]);setDetailMode("edit");}catch(error){notify((error as Error).message,"error");}
  };
  const cancelDraftEdit=()=>{
    if(detail&&draftOriginal)setRows(current=>current.map(row=>row.id===detail.id?{...row,title:draftOriginal.title,remark:draftOriginal.remark}:row));
    setDetailMode("view");setDraftFile(null);setDraftAddedFiles([]);setDraftRemovedIds([]);setDraftExistingFiles([]);setDraftPreview("");setDraftOriginal(null);
  };
  const saveDraftMetadata = async () => {
    if (!detail || detail.status !== "草稿" || detailMode !== "edit") return;
    if(!detail.title.trim()){notify("内容标题不能为空","error");return;}
    const added=detail.kind==="视频"?(draftFile?[draftFile]:[]):draftAddedFiles;let token="";
    setDraftUploading(true);
    try {
      if(added.length||draftRemovedIds.length){
        const preparedResponse=await fetch(`/api/contents/${encodeURIComponent(detail.id)}/draft-files`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({files:added.map(file=>({fileName:file.name,mimeType:file.type||"application/octet-stream",fileSize:file.size})),removeFileIds:draftRemovedIds})});
        const prepared=await preparedResponse.json() as {error?:string;token?:string;uploads?:Array<{uploadUrl:string}>};if(!preparedResponse.ok||!prepared.token)throw new Error(prepared.error??"无法准备草稿文件");token=prepared.token;
        for(let index=0;index<(prepared.uploads?.length??0);index++){const file=added[index];const uploaded=await uploadContentFile(prepared.uploads![index].uploadUrl,{method:"PUT",headers:{"content-type":file.type||"application/octet-stream"},body:file});if(!uploaded.ok){const failed=await uploaded.json().catch(()=>({}));throw new Error(failed.error??`${file.name} 上传失败`);}}
        const durationSeconds=detail.kind==="视频"&&draftFile?await readVideoDuration(draftFile):null;
        const committed=await fetch(`/api/contents/${encodeURIComponent(detail.id)}/draft-files`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({token,removeFileIds:draftRemovedIds,durationSeconds})});const commitData=await committed.json();if(!committed.ok)throw new Error(commitData.error??"草稿文件保存失败");token="";
      }
      const response = await fetch(
        `/api/contents/${encodeURIComponent(detail.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "update",
            title: detail.title,
            remark: detail.remark,
          }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "草稿保存失败");
      await reloadContents();
      setDetailMode("view");setDraftFile(null);setDraftAddedFiles([]);setDraftRemovedIds([]);setDraftExistingFiles([]);setDraftOriginal(null);setDraftPreview("");notify("草稿修改已保存，不会生成新版本","success");
    } catch (reason) {
      if(token)await fetch(`/api/contents/${encodeURIComponent(detail.id)}/draft-files`,{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({token})}).catch(()=>undefined);
      notify(reason instanceof Error ? reason.message : "草稿保存失败","error");
    } finally {
      setDraftUploading(false);
    }
  };
  const submitFeature = async () => {
    if (!detail || !featureModal) return;
    if (featureModal === "feature" && !featureReason.trim()) {
      notify("请填写推荐理由");
      return;
    }
    setFeatureBusy(true);
    try {
      const response = await fetch(
        `/api/contents/${encodeURIComponent(detail.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: featureModal,
            featuredReason: featureReason.trim(),
            featuredTags: featureTags
              .split(/[，,]/)
              .map((item) => item.trim())
              .filter(Boolean),
          }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "推荐案例设置失败");
      setFeatureModal(null);
      setFeatureReason("");
      setFeatureTags("");
      await reloadContents();
      notify(
        featureModal === "feature"
          ? "推荐案例只能在审核时设置"
          : "已取消推荐案例；公开范围保持不变",
      );
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "推荐案例设置失败");
    } finally {
      setFeatureBusy(false);
    }
  };
  const openVersionUpload = (rowId: string, openUpload: boolean) => {
    setDetailId(rowId);
    setVersionFiles([]);
    setVersionUploadOpen(openUpload);
  };
  const submitNewVersion = async () => {
    if (!detail || detail.status !== "已驳回" || !versionFiles.length) return;
    let preparedVersionId:number|undefined;
    try {
      const durationSeconds =
        detail.kind === "视频"
          ? await readVideoDuration(versionFiles[0])
          : null;
      const files = versionFiles.map((file) => ({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
      }));
      const prepareResponse = await fetch(
        `/api/contents/${encodeURIComponent(detail.id)}/versions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ files, durationSeconds }),
        },
      );
      const prepared = (await prepareResponse.json()) as {
        error?: string;
        uploads?: Array<{ uploadUrl: string }>;
        versionNumber?: number;
        versionId?:number;
      };
      if (
        !prepareResponse.ok ||
        !prepared.uploads?.length ||
        !prepared.versionNumber
      )
        throw new Error(prepared.error ?? "无法创建新版本");
      preparedVersionId=prepared.versionId;
      for (let index = 0; index < prepared.uploads.length; index++) {
        const file = versionFiles[index];
        const uploadResponse = await uploadContentFile(prepared.uploads[index].uploadUrl, {
          method: "PUT",
          headers: { "content-type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!uploadResponse.ok) {
          const data = (await uploadResponse.json()) as { error?: string };
          throw new Error(data.error ?? `${file.name} 上传失败`);
        }
      }
      const updated: UnifiedContent = {
        ...detail,
        version: `V${prepared.versionNumber}`,
        status: "待审核",
        time: new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        remark: "已上传修改版本，等待重新审核",
        locked: false,
        lockOwner: undefined,
      };
      onResubmit(
        updated,
        detail.kind === "图文"
          ? `${versionFiles.length}张图片`
          : versionFiles[0].name,
      );
      await reloadContents();
      setVersionConfirmOpen(false);
      setVersionUploadOpen(false);
      setVersionFiles([]);
      notify(`${updated.version} 已提交并重新流转到审核中心`);
    } catch (reason) {
      if(preparedVersionId)await fetch(`/api/contents/${encodeURIComponent(detail.id)}/versions`,{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({versionId:preparedVersionId})}).catch(()=>undefined);
      notify(reason instanceof Error ? reason.message : "新版本上传失败");
    }
  };

  if (trashOpen)
    return (
      <ContentRecycleBin
        notify={notify}
        onBack={() => setTrashOpen(false)}
        onChanged={reloadContents}
      />
    );
  const renderDetail = () => {
    if(!detail)return null;
    const editing = !detail.archivedAt && detail.status === "草稿" && detailMode === "edit";
    return (
      <CenterDialog title="内容详情" closeDisabled={draftUploading||Boolean(draftPreview)} onClose={()=>{if(editing&&!window.confirm("关闭后将放弃未保存的草稿修改，确定关闭吗？"))return;if(editing)cancelDraftEdit();setDetailId("");setDraftFile(null);}}>
        <ContentDetailPanel
          item={detail}
          editable={editing}
          mediaEditor={editing?<div className="draft-media-editor"><header><strong>{detail.kind==="图文"?`图片 ${draftExistingFiles.length-draftRemovedIds.length+draftAddedFiles.length}/20`:"视频文件"}</strong><small>{detail.kind==="图文"?"点击图片查看大图，右上角可移除":"视频只允许选择一个新文件替换"}</small></header>{detail.kind==="图文"?<div className="draft-thumbnail-grid">{draftExistingFiles.filter(file=>!draftRemovedIds.includes(file.id)).map(file=><figure key={file.id}><button className="draft-thumb" onClick={()=>file.fileUrl&&setDraftPreview(file.fileUrl)}>{file.fileUrl?<img src={file.fileUrl} alt={file.fileName}/>:<span>图片</span>}</button><button className="draft-thumb-remove" aria-label={`删除${file.fileName}`} onClick={()=>setDraftRemovedIds(current=>[...current,file.id])}>×</button></figure>)}{draftAddedFiles.map((file,index)=>{const url=URL.createObjectURL(file);return <figure key={`${file.name}-${index}`}><button className="draft-thumb" onClick={()=>setDraftPreview(url)}><img src={url} alt={file.name}/></button><button className="draft-thumb-remove" aria-label={`移除${file.name}`} onClick={()=>setDraftAddedFiles(current=>current.filter((_,i)=>i!==index))}>×</button></figure>;})}</div>:<div className="draft-video-replace"><span>{draftFile?draftFile.name:"当前视频保持不变"}</span></div>}<label className="secondary-button draft-add-files"><input type="file" multiple={detail.kind==="图文"} accept={detail.kind==="图文"?"image/*":"video/*"} onChange={event=>{const files=Array.from(event.target.files??[]);if(detail.kind==="图文"){const remaining=20-(draftExistingFiles.length-draftRemovedIds.length+draftAddedFiles.length);setDraftAddedFiles(current=>[...current,...files.slice(0,Math.max(0,remaining))]);}else setDraftFile(files[0]??null);event.currentTarget.value="";}}/>{detail.kind==="图文"?"＋ 添加图片（可多选）":"选择新视频"}</label></div>:undefined}
          navigate={navigate}
          onBack={() => {
            setDetailId("");
            setDraftFile(null);
          }}
          onTitleChange={(title) =>
            setRows(
              rows.map((row) =>
                row.id === detail.id ? { ...row, title } : row,
              ),
            )
          }
          onRemarkChange={(remark) =>
            setRows(
              rows.map((row) =>
                row.id === detail.id ? { ...row, remark } : row,
              ),
            )
          }
          footer={
            editing ? (
              <div className="detail-page-actions draft-edit-actions">
                <div className="draft-file-controls">
                  <button
                    disabled={draftUploading}
                    onClick={cancelDraftEdit}
                  >
                    取消
                  </button>
                  <button
                    className="primary-button"
                    disabled={draftUploading}
                    onClick={() => void saveDraftMetadata()}
                  >
                    保存修改
                  </button>
                </div>
              </div>
            ) : (
              <div className="detail-page-actions">
                <span>{detail.archivedAt?"已归档 · "+detail.archiveReason:""}</span>
                <div className="detail-action-group">
                  {!detail.archivedAt&&detail.status==="草稿"&&boardCan("content.edit")?<button onClick={()=>void beginDraftEdit(detail)}>编辑草稿</button>:null}
                  {!detail.archivedAt&&detail.status==="草稿"&&boardCan("content.submit")?<button onClick={()=>void runDetailAction(detail,"submit")}>提交审核</button>:null}
                  {!detail.archivedAt&&detail.status==="待审核"&&boardCan("content.withdraw")?<button onClick={()=>void runDetailAction(detail,"withdraw")}>撤回审核</button>:null}
                  {boardCan("content.archive")&&detail.status!=="草稿"&&(detail.uploaderUserId===currentUserId||companyManager)?<button onClick={()=>{setArchiveTarget(detail);setArchiveReason("");}}>{detail.archivedAt?"恢复归档":"归档"}</button>:null}
                  {boardCan("content.delete")&&["草稿","已驳回"].includes(detail.status)&&(detail.uploaderUserId===currentUserId||companyManager)?<button onClick={()=>setTrashTarget(detail)}>移入回收站</button>:null}
                  {canFeature && detail.featured && (
                    <button
                      className="secondary-button"
                      onClick={() => setFeatureModal("unfeature")}
                    >
                      取消推荐案例
                    </button>
                  )}
                  {!detail.archivedAt && detail.status === "已驳回" && detail.uploaderUserId === currentUserId && boardCan("version.upload") && (
                    <button
                      className="primary-button"
                      onClick={() => {
                        setVersionFile(null);
                        setVersionUploadOpen(true);
                      }}
                    >
                      ↑ 上传新版本
                    </button>
                  )}
                </div>
              </div>
            )
          }
        />
        {versionUploadOpen && (
          <div className="modal-backdrop">
            <div className="modal version-upload-modal">
              <div className="modal-head">
                <div>
                  <h3>上传修改版本</h3>
                  <p>
                    {detail.title} · 当前 {detail.version} · 新版本将自动生成 V
                    {(Number(detail.version.replace("V", "")) || 1) + 1}
                  </p>
                </div>
                <button onClick={() => setVersionUploadOpen(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="version-rule-note">
                  <strong>重新审核规则</strong>
                  <p>
                    新版本提交后状态变为待审核，并重新进入审核中心；原版本和历史审核记录继续保留。
                  </p>
                </div>
                <label className="file-picker">
                  <input
                    type="file"
                    multiple={detail.kind === "图文"}
                    accept={detail.kind === "视频" ? "video/*" : "image/*"}
                    onChange={(e) =>
                      setVersionFiles(
                        Array.from(e.target.files ?? []).slice(0, 20),
                      )
                    }
                  />
                  <span>↑</span>
                  <strong>
                    {versionFiles.length
                      ? detail.kind === "图文"
                        ? `已选择 ${versionFiles.length} 张图片`
                        : versionFiles[0].name
                      : detail.kind === "图文"
                        ? "选择本套图文的全部图片"
                        : "选择修改后的视频"}
                  </strong>
                  <small>
                    {versionFiles.length
                      ? "文件已选择，下一步需要二次确认"
                      : detail.kind === "图文"
                        ? "一次选择1至20张图片，作为一个完整版本"
                        : "每个视频版本只选择一个文件"}
                  </small>
                </label>
              </div>
              <div className="modal-actions">
                <button onClick={() => setVersionUploadOpen(false)}>
                  取消
                </button>
                <button
                  className="primary-button"
                  disabled={!versionFiles.length}
                  onClick={() => setVersionConfirmOpen(true)}
                >
                  继续提交
                </button>
              </div>
            </div>
          </div>
        )}
        {versionConfirmOpen && (
          <div className="modal-backdrop confirm-layer">
            <div className="modal confirm-modal">
              <div className="confirm-icon">!</div>
              <h3>确认上传新版本并重新提交审核？</h3>
              <p>系统将生成新版本，内容状态变为“待审核”，并流转到审核中心。</p>
              <div className="confirm-actions publish-confirm-actions">
                <button onClick={() => setVersionConfirmOpen(false)}>
                  返回检查
                </button>
                <button className="primary-button" onClick={submitNewVersion}>
                  确认提交
                </button>
              </div>
            </div>
          </div>
        )}
        {featureModal && (
          <div className="modal-backdrop confirm-layer">
            <div className="modal feature-modal">
              <div className="modal-head">
                <div>
                  <small>推荐案例</small>
                  <h3>取消推荐案例</h3>
                  <p>{detail.title}</p>
                </div>
                <button onClick={() => setFeatureModal(null)}>×</button>
              </div>
              <div className="modal-body">
                <p>
                  取消后不再作为推荐案例展示，但内容仍保持全员可见。如需改回私有，请另行修改可见范围。
                </p>
              </div>
              <div className="modal-actions">
                <button
                  disabled={featureBusy}
                  onClick={() => setFeatureModal(null)}
                >
                  返回
                </button>
                <button
                  disabled={featureBusy}
                  className="primary-button"
                  onClick={() => void submitFeature()}
                >
                  {featureBusy ? "处理中" : "确认取消"}
                </button>
              </div>
            </div>
          </div>
        )}
      </CenterDialog>
    );
  };

  return (
    <>
      {false && superFilterOpen && (
        <div
          className="settings-drawer-backdrop"
          onClick={() => setSuperFilterOpen(false)}
        >
          <aside
            className="settings-drawer super-filter-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drawer-head">
              <div>
                <small>内容池</small>
                <h3>超级筛选器</h3>
                <p>组合当前筛选条件，保存后可以一键恢复。</p>
              </div>
              <button onClick={() => setSuperFilterOpen(false)}>×</button>
            </div>
            <div className="super-filter-body">
              <label>
                关键词
                <input
                  value={filterQuery}
                  onChange={(event) => setFilterQuery(event.target.value)}
                />
              </label>
              <label>
                内容类型
                <select
                  value={filterKind}
                  onChange={(event) => setFilterKind(event.target.value)}
                >
                  <option>全部类型</option>
                  <option>视频</option>
                  <option>图文</option>
                </select>
              </label>
              <label>
                审核状态
                <select
                  value={filterStatus}
                  onChange={(event) => setFilterStatus(event.target.value)}
                >
                  {[
                    "全部状态",
                    "草稿",
                    "待审核",
                    "审核中",
                    "已通过",
                    "已驳回",
                  ].map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label>
                上传员工
                <select
                  value={filterOwner}
                  onChange={(event) => setFilterOwner(event.target.value)}
                >
                  <option>全部员工</option>
                  {ownerOptions.map((owner) => (
                    <option key={owner}>{owner}</option>
                  ))}
                </select>
              </label>
              <div className="super-filter-date">
                <strong>上传时间</strong>
                <div className="date-preset-row">
                  {["全部时间","今天","近7天","近30天","自定义"].map((preset)=><button key={preset} className={uploadTimePreset===preset?"active":""} onClick={()=>applyUploadTimePreset(preset)}>{preset}</button>)}
                </div>
                {uploadTimePreset==="自定义"?<div className="custom-date-range"><label>开始日期<input type="date" value={createdFrom} onChange={(event)=>setCreatedFrom(event.target.value)}/></label><span>至</span><label>结束日期<input type="date" value={createdTo} onChange={(event)=>setCreatedTo(event.target.value)}/></label></div>:null}
              </div>
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={featuredOnly}
                  onChange={(event) => setFeaturedOnly(event.target.checked)}
                />
                只看推荐案例
              </label>
              <div className="saved-filter-list">
                <strong>已保存方案</strong>
                {savedFilters.length ? (
                  savedFilters.map((scheme) => (
                    <button
                      key={scheme.id}
                      onClick={() => applySavedFilter(scheme.conditions)}
                    >
                      {scheme.name}
                    </button>
                  ))
                ) : (
                  <small>还没有已保存的筛选方案</small>
                )}
              </div>
              <div className="save-filter-row">
                <input
                  value={filterSchemeName}
                  onChange={(event) => setFilterSchemeName(event.target.value)}
                  placeholder="为当前条件命名"
                />
                <button
                  className="primary-button"
                  onClick={() => void saveFilterScheme()}
                >
                  保存方案
                </button>
              </div>
            </div>
            <div className="drawer-actions">
              <button
                onClick={() => {
                  setFilterQuery("");
                  setFilterKind("全部类型");
                  setFilterStatus("全部状态");
                  setFilterOwner("全部员工");
                  setFeaturedOnly(false);
                  setUploadTimePreset("全部时间");
                  setCreatedFrom("");
                  setCreatedTo("");
                }}
              >
                清空条件
              </button>
              <button
                className="primary-button"
                onClick={() => setSuperFilterOpen(false)}
              >
                应用筛选
              </button>
            </div>
          </aside>
        </div>
      )}
      <div className="content-pool-heading">
        <ModuleHeader title={archivedView?"归档内容":"内容池"} description="" action={boardCan("content.upload")?"上传新内容":""} onAction={()=>setUploadOpen(true)}/>
        <div className="board-entries"><button onClick={()=>setArchivedView(!archivedView)}>{archivedView?"← 返回内容池":"归档内容"}</button>
        {boardCan("content.delete")?<button onClick={()=>setTrashOpen(true)}>回收站</button>:null}</div>
      </div>
      <section className="panel content-board-panel">
        <div className="group-scope-strip"><button className={groupScope==="mine"?"selected":""} onClick={()=>setGroupScope("mine")}><strong>我的内容</strong><small>仅本人上传</small></button>{contentGroups.filter(group=>group.canView).map(group=><button key={group.id} className={groupScope===String(group.id)?"selected":""} style={{borderColor:group.themeColor??"#64748b"}} onClick={()=>setGroupScope(String(group.id))}><span className="group-cover" style={{background:group.themeColor??"#64748b"}}>{group.name[0]}</span><strong>{group.name}</strong><small>{group.code}</small></button>)}</div>
        <RuleFilterBar moduleKey="contents" fields={contentFilterFields} rules={smartRules} onChange={setSmartRules} view={{sort:boardSort,group:"status"}} onViewChange={view=>setBoardSort(view.sort??"default")} />
        <div className="content-board content-board-grid">
          {["草稿","待审核","已驳回","已通过"].map((status,lane)=>{
            const laneRows=visibleRows.filter(row=>status==="待审核"?["待审核","审核中"].includes(row.status):row.status===status);
            const total=pagination.laneTotals?.[lane]??laneRows.length;
            const pageSize=lanePageSizes[lane],page=lanePages[lane],pageCount=Math.max(1,Math.ceil(total/pageSize));const pager=<div className="lane-pagination"><label>每页<select value={pageSize} onChange={event=>{const size=Number(event.target.value);setLanePageSizes(current=>current.map((n,i)=>i===lane?size:n));setLanePages(current=>current.map((n,i)=>i===lane?1:n));setSelectedIds([]);}}><option value="20">20</option><option value="50">50</option><option value="100">100</option></select></label><button disabled={page<=1} onClick={()=>{scrollPositions.current[lane]=0;setLanePages(current=>current.map((n,i)=>i===lane?n-1:n));setSelectedIds([]);}}>上一页</button><small>{page}/{pageCount} · {total}条</small><button disabled={page>=pageCount} onClick={()=>{scrollPositions.current[lane]=0;setLanePages(current=>current.map((n,i)=>i===lane?n+1:n));setSelectedIds([]);}}>下一页</button></div>;
            return <section className="content-board-lane" key={status}>
              <button className="lane-expand-heading" onClick={()=>{setSelectedIds([]);setExpandedLane(lane);}} aria-label={`展开${status}完整列表`}><h3>{status}</h3><span>{total}</span><small>展开 ↗</small></button>
              <div className="content-lane-scroll" ref={node=>{if(node&&scrollPositions.current[lane]!==undefined)node.scrollTop=scrollPositions.current[lane];}} onScroll={e=>{scrollPositions.current[lane]=e.currentTarget.scrollTop;}}>
                {laneRows.map(row=><article key={row.id} className="content-board-card compact-content-card cover-tile" style={{borderColor:employeeColor(row.uploaderUserId??row.owner,row.contentColor)+"cc"}}>{row.featured?<span className="cover-featured-badge" title="推荐内容">★</span>:null}
                  <ContentPreview code={row.id} versionId={row.versionId} title={row.title} kind={row.kind} comment={row.reviewComment??row.rejectionReason} summary={`${row.owner} · ${row.status} · ${row.version} · ${row.kind==="视频"?formatDuration(row.durationSeconds):`${row.imageCount??0}张`} · ${formatBytes(row.fileSize??0)}\n${row.time}`} onOpen={()=>openDetail(row.id,"view")}/>
                  <div className="content-product-chip" title={row.product==="未分配"?"无商品":row.product}><ProductImage url={row.productImageUrl} name={row.product}/><span>{row.product==="未分配"?"无商品":row.product}</span></div>
                </article>)}
                {!laneRows.length?<div className="empty-state">暂无{status}内容</div>:null}
              </div>
              {total>pageSize?pager:null}
              {expandedLane===lane?<CenterDialog title={`${status} · ${total}条`} onClose={()=>{setSelectedIds([]);setExpandedLane(null);}}>
                <RuleFilterBar moduleKey="contents" fields={contentFilterFields} rules={smartRules} onChange={setSmartRules} view={{sort:boardSort,group:"status"}} onViewChange={view=>setBoardSort(view.sort??"default")}/>
                <div className="expanded-content-list"><table><thead><tr><th><input type="checkbox" aria-label="选择当前页全部内容" checked={laneRows.length>0&&laneRows.every(row=>selectedIds.includes(row.id))} onChange={event=>setSelectedIds(event.target.checked?[...new Set([...selectedIds,...laneRows.map(row=>row.id)])]:selectedIds.filter(id=>!laneRows.some(row=>row.id===id)))}/></th><th>状态</th><th>内容</th><th>上传人</th><th>商品</th><th>版本</th><th>时长 / 张数</th><th>文件大小</th><th>上传时间</th><th>审核评语</th></tr></thead><tbody>{laneRows.map(row=><tr key={row.id} style={{backgroundColor:employeeColor(row.uploaderUserId??row.owner,row.contentColor)}}>
                  <td><input aria-label={`选择${row.title}`} type="checkbox" checked={selectedIds.includes(row.id)} onChange={e=>setSelectedIds(e.target.checked?[...selectedIds,row.id]:selectedIds.filter(id=>id!==row.id))}/></td><td>{row.status}</td>
                  <td><div className="expanded-content-title"><ContentPreview code={row.id} versionId={row.versionId} title={row.title} kind={row.kind} comment={row.reviewComment??row.rejectionReason} onOpen={()=>openDetail(row.id,"view")}/><button className="content-detail-link" onClick={()=>openDetail(row.id,"view")}>{row.title}</button>{row.categoryName?<small>{row.categoryName}</small>:null}</div></td><td>{row.owner}</td><td><span className="expanded-product-cell"><ProductImage url={row.productImageUrl} name={row.product}/><span>{row.product}</span></span></td><td>{row.version}</td><td>{row.kind==="视频"?formatDuration(row.durationSeconds):`${row.imageCount??0}张`}</td><td>{formatBytes(row.fileSize??0)}</td><td>{row.time}</td><td className="expanded-review">{row.reviewComment||row.rejectionReason||"—"}</td>
                </tr>)}</tbody></table>{!laneRows.length?<div className="empty-state">暂无符合条件的内容</div>:null}</div>{pager}
                {selectedIds.length?<footer><span>已选{selectedIds.length}条</span>{boardCan("content.update")&&selected.some(row=>row.status==="草稿")?<><button onClick={()=>{setBatchValue("");setBatchModal("rename");}}>批量改名称</button><button onClick={()=>{setBatchValue("");setBatchModal("remark");}}>批量写备注</button></>:null}{boardCan("content.submit")?<button onClick={submitDrafts}>提交草稿</button>:null}{boardCan("content.withdraw")?<button onClick={withdraw}>批量撤回审核</button>:null}{boardCan("content.archive")?<button onClick={()=>void archiveSelected()}>{archivedView?"恢复所选":"归档所选"}</button>:null}{boardCan("content.delete")?<button onClick={deleteSelected}>移入回收站</button>:null}<button onClick={()=>setSelectedIds([])}>取消选择</button></footer>:null}
              </CenterDialog>:null}
            </section>;
          })}
        </div>
      </section>
      {detail?renderDetail():null}
      {trashTarget?<CenterDialog title="移入回收站？" onClose={()=>{if(!detailActionBusy)setTrashTarget(null);}}><p>{trashTarget.title}，移入后可在回收站恢复。</p><footer><button disabled={detailActionBusy} onClick={()=>setTrashTarget(null)}>取消</button><button disabled={detailActionBusy} onClick={async()=>{if(detailActionBusy)return;setDetailActionBusy(true);try{const payload={action:"trash",codes:[trashTarget.id],confirmRecommendationCancellation:false};let response=await fetch("/api/contents/batch",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});let data=await response.json();if(!response.ok&&data.requiresRecommendationConfirmation&&window.confirm(`${data.error}，是否继续？`)){response=await fetch("/api/contents/batch",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...payload,confirmRecommendationCancellation:true})});data=await response.json();}if(!response.ok)throw new Error(data.error??"删除失败");setTrashTarget(null);setDetailId("");await reloadContents();notify("已移入回收站","success");}catch(e){notify((e as Error).message,"error");}finally{setDetailActionBusy(false);}}}>确认移入</button></footer></CenterDialog>:null}
      {archiveTarget?<div className="modal-backdrop confirm-layer"><section className="modal archive-confirm-dialog" role="dialog" aria-modal="true" aria-label="归档或恢复"><header className="modal-head"><div><h3>{archiveTarget.archivedAt?"恢复归档内容":"确认归档"}</h3><p>{archiveTarget.title}</p></div></header><div className="modal-body">
        {!archiveTarget.archivedAt?<label className="archive-reason-field"><span>归档原因</span><textarea autoFocus value={archiveReason} onChange={e=>setArchiveReason(e.target.value)} maxLength={1000} placeholder="请说明结束这条内容流程的原因"/></label>:<p className="archive-restore-note">若归档前处于待审核或审核中，恢复后会统一回到草稿。</p>}</div>
        <div className="modal-actions"><button disabled={archiveBusy} onClick={()=>setArchiveTarget(null)}>取消</button><button disabled={archiveBusy||!archiveTarget.archivedAt&&!archiveReason.trim()} onClick={()=>void archiveContent()}>确认</button></div>
      </section></div>:null}
      {draftPreview?<CenterDialog title="图片预览" onClose={()=>setDraftPreview("")}><div className="draft-image-preview"><img src={draftPreview} alt="草稿图片预览"/></div></CenterDialog>:null}
      {uploadOpen && (
        <div className="modal-backdrop">
          <div
            className="modal batch-upload-modal"
            role="dialog"
            aria-modal="true"
            aria-label="批量上传内容"
          >
            <div className="modal-head">
              <div>
                <h3>上传新内容</h3>
                <p>视频可批量上传；图文一次提交一套；图片和视频不能混传。</p>
              </div>
              <button disabled={uploading} onClick={requestUploadExit}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="upload-rule-note">
                <strong>上传规则</strong>
                <span>
                  视频：最多20条，每个文件生成一条独立内容，标题自动添加001/002/003。
                </span>
                <span>
                  图文：最多20张图片，本次选择的全部图片合并为一套，只生成一条内容。
                </span>
              </div>
              <div className="upload-settings">
                <label>
                  <span>
                    {contentType === "图文" ? "图文内容标题" : "批量内容标题"}{" "}
                    <b>*</b>
                  </span>
                  <input
                    value={titleBase}
                    onChange={(e) => {
                      setTitleBase(e.target.value);
                      renameUploadRows(e.target.value);
                    }}
                    placeholder="选择商品后自动生成，可直接修改"
                  />
                </label>
                <label>
                  <span>
                    内容类型 <b>*</b>
                  </span>
                  <select
                    value={contentType}
                    onChange={(e) => {
                      setContentType(e.target.value);
                      setUploadRows([]);
                    }}
                  >
                    <option value="">请选择</option>
                    <option>视频</option>
                    <option>图文</option>
                  </select>
                </label>
                <label className="upload-product-field">
                  <span>关联商品 <b>*</b></span>
                  <div className="report-product-picker">
                    <button type="button" className="report-product-picker-trigger" onClick={()=>setProductPickerOpen(value=>!value)} aria-expanded={productPickerOpen}>
                      {businessData.productMasters.find(item=>String(item.id)===product)?.imageUrl?<img loading="lazy" src={businessData.productMasters.find(item=>String(item.id)===product)?.imageUrl??""} alt=""/>:<span className="report-product-empty-image">◇</span>}
                      <span>{businessData.productMasters.find(item=>String(item.id)===product)?.name??"请选择商品（必选）"}</span><b>⌄</b>
                    </button>
                    {productPickerOpen?<div className="report-product-grid upload-product-grid">
                      {businessData.productMasters.filter(item=>item.status==="active").map(item=><article className={`report-product-card ${String(item.id)===product?"selected":""}`} key={item.id}>
                        <button type="button" onClick={()=>{setProductPickerOpen(false);void selectUploadProduct(String(item.id));}}><span className="report-product-image-button">{item.imageUrl?<img loading="lazy" src={item.imageUrl} alt={item.name}/>:<span className="report-product-empty-image">无图片</span>}</span><span title={item.name}>{item.name}</span><small>{item.code}</small></button>
                        {item.imageUrl?<button type="button" className="product-image-zoom" aria-label={`查看${item.name}大图`} onClick={(event)=>{event.stopPropagation();setDraftPreview(item.imageUrl??"");}}>放大</button>:null}
                      </article>)}
                      {!businessData.productMasters.some(item=>item.status==="active")?<p className="empty-state">暂无可选商品，请先在素材中心产品库启用商品</p>:null}
                    </div>:null}
                  </div>
                </label>
                <label>
                  <span>所属项目 *</span>
                  <select
                    value={account}
                    disabled
                    onChange={(e) => setAccount(e.target.value)}
                  >
                    <option value="">由内容小组决定</option>
                    {businessData.accounts
                      .filter((item) => item.status === "active")
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.platformName}｜{item.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label><span>业务分类</span><select value={uploadCategoryId} onChange={event=>setUploadCategoryId(event.target.value)}><option value="">未分类</option>{categories.filter(category=>category.status==="active").map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                <label><span>内容归属小组 *</span><select value={uploadGroupId} onChange={event=>{const group=contentGroups.find(item=>String(item.id)===event.target.value);setUploadGroupId(event.target.value);setAccount(String(group?.accountId??""));}}><option value="">请选择小组</option>{contentGroups.filter(item=>item.canUpload&&item.accountId).map(item=><option value={item.id} key={item.id}>{item.accountName}｜{item.name}</option>)}</select><small>账号由小组自动确定；创建后不可更换，后续版本沿用。</small></label>
                <label>
                  <span>可见范围</span>
                  <select
                    value={visibility}
                    onChange={(event) =>
                      setVisibility(event.target.value as "private" | "public")
                    }
                  >
                    <option value="private">仅本人和管理员可见</option>
                    <option value="public">全部可见</option>
                  </select>
                  <small>
                    没有“设置公开”权限时，服务端会自动保存为仅本人和管理员可见
                  </small>
                </label>
              </div>
              <label
                className={`file-picker ${!contentType ? "disabled" : ""}`}
              >
                <input
                  type="file"
                  multiple
                  disabled={!contentType || uploading}
                  accept={
                    contentType === "视频"
                      ? "video/*"
                      : contentType === "图文"
                        ? "image/*"
                        : undefined
                  }
                  onChange={(e) => chooseFiles(e.target.files)}
                />
                <span>↑</span>
                <strong>
                  {!contentType
                    ? "请先选择内容类型"
                    : contentType === "视频"
                      ? "选择视频文件，可批量"
                      : "选择本套图文的全部图片"}
                </strong>
                <small>
                  {contentType === "图文"
                    ? `本套已选择 ${uploadRows.length}/20 张图片`
                    : `已选择 ${uploadRows.length}/20 条视频`}
                </small>
              </label>
              {uploadRows.length > 0 && (
                <div className="upload-file-list">
                  <div>
                    <strong>
                      {contentType === "图文" ? "本套图文文件" : "批量标题预览"}
                    </strong>
                    <small>
                      {contentType === "图文"
                        ? "以下图片共同组成一条图文内容"
                        : "可以继续单独修改每条视频标题"}
                    </small>
                  </div>
                  {uploadRows.map((row, index) => (
                    <div
                      className="upload-file-row"
                      key={`${row.fileName}-${index}`}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <strong>{row.fileName}</strong>
                        {contentType === "视频" && (
                          <input
                            value={row.title}
                            onChange={(e) =>
                              setUploadRows(
                                uploadRows.map((item, i) =>
                                  i === index
                                    ? { ...item, title: e.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        )}
                      </div>
                      <Badge tone="slate">
                        {contentType === "图文" ? "套内图片" : "等待上传"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-actions upload-three-actions">
              <button disabled={uploading} onClick={requestUploadExit}>
                退出
              </button>
              <button
                disabled={uploading}
                onClick={() => void saveUploads("draft")}
              >
                {uploading ? "上传中" : "保存为草稿"}
              </button>
              <button
                className="primary-button"
                disabled={uploading}
                onClick={() => void saveUploads("submit")}
              >
                {uploading ? "上传并处理中" : "上传并提交"}
              </button>
            </div>
          </div>
        </div>
      )}
      {uploadExitConfirm && (
        <div className="modal-backdrop confirm-layer">
          <div className="modal confirm-modal">
            <div className="confirm-icon">!</div>
            <h3>确认退出本次上传？</h3>
            <p>
              退出后，本次选择的文件、已创建但尚未完成的内容和已上传片段都会删除，无法恢复。
            </p>
            <div className="confirm-actions">
              <button onClick={() => setUploadExitConfirm(false)}>
                继续编辑
              </button>
              <button
                className="danger-confirm"
                onClick={() => void confirmUploadExit()}
              >
                确认退出并删除
              </button>
            </div>
          </div>
        </div>
      )}
      {batchModal && (
        <div className="modal-backdrop">
          <div className="modal small-action-modal">
            <div className="modal-head">
              <div>
                <h3>
                  {batchModal === "rename" ? "批量修改名称" : "批量填写备注"}
                </h3>
                <p>只会应用到已选择的草稿内容</p>
              </div>
              <button onClick={() => setBatchModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <label>
                {batchModal === "rename" ? "统一标题" : "统一备注"}
                {batchModal === "remark" ? (
                  <textarea
                    value={batchValue}
                    onChange={(e) => setBatchValue(e.target.value)}
                  />
                ) : (
                  <input
                    value={batchValue}
                    onChange={(e) => setBatchValue(e.target.value)}
                    placeholder="系统将自动添加001/002/003"
                  />
                )}
              </label>
              {batchModal === "rename" && (
                <p className="rename-example">
                  示例：{batchValue || "内容标题"}001、
                  {batchValue || "内容标题"}002、{batchValue || "内容标题"}003
                </p>
              )}
            </div>
            <div className="modal-actions">
              <button onClick={() => setBatchModal(null)}>取消</button>
              <button
                className="primary-button"
                onClick={() => void applyBatchModal()}
              >
                确认应用
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ReviewCenter({
  notify,
  navigate,
}: Pick<Props, "notify" | "navigate">) {
  type DraftDecision = {
    decision: "通过" | "驳回";
    comment: string;
    recommended: boolean;
  };
  type PendingApiItem = {
    code: string;
    title: string;
    contentType: string;
    reviewStatus: string;
    uploaderName: string;
    uploaderUserId?:number;
    contentColor?:string|null;
    reviewSubmittedAt?:string;
    productName: string | null;
    productImageUrl?: string | null;
    versionNumber: number;
    versionId: number;
    fileName: string;
    fileSize: number;
    updatedAt: string;
    lockOwner?: string | null;
  };
  type QueueApiItem = {
    queueItemId: number;
    draftDecision: string | null;
    draftComment: string;
    draftRecommended: boolean;
    removedAt: string | null;
    code: string;
    title: string;
    contentType: string;
    uploaderName: string;
    uploaderUserId?:number;
    contentColor?:string|null;
    productName: string | null;
    productImageUrl?: string | null;
    versionNumber: number;
    versionId: number;
    fileName: string;
    fileSize: number;
  };
  const [mode, setMode] = useState<"list" | "session">("list");
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("全部员工");
  const [kind, setKind] = useState("全部类型");
  const [reviewStatus, setReviewStatus] = useState("待审核");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [currentId, setCurrentId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, DraftDecision>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [snapshotItems, setSnapshotItems] = useState<ReviewItem[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [canRecommend, setCanRecommend] = useState(false);
  const [canProcess,setCanProcess]=useState(false);
  const [reviewGroups,setReviewGroups]=useState<Array<{id:number;name:string;code:string;themeColor:string|null}>>([]);
  const [reviewGroup,setReviewGroup]=useState("all");
  const [recommendCurrent, setRecommendCurrent] = useState<
    Record<string, boolean>
  >({});
  const [smartRules, setSmartRules] = useState<SmartFilterRule[]>([]);
  const [uiSettings,setUiSettings]=useState<UiSettings>(emptyUiSettings);
  useEffect(()=>{void fetch("/api/system/settings",{cache:"no-store"}).then(async response=>response.ok?response.json():null).then(data=>{if(data?.settings)setUiSettings({...emptyUiSettings,...data.settings});});},[]);

  const formatTime = (value: string) =>
    new Date(
      value.replace(" ", "T") +
        (value.includes("Z") || value.includes("+") ? "" : "Z"),
    ).toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const formatDetail = (fileSize: number, _fileName: string) => formatBytes(fileSize);
  const mapPending = (item: PendingApiItem): ReviewItem => ({
    id: item.code,
    title: item.title,
    owner: item.uploaderName,
    product: item.productName ?? "未分配",
    productImageUrl:item.productImageUrl??null,
    version: `V${item.versionNumber}`,
    uploaderUserId:item.uploaderUserId,contentColor:item.contentColor,submittedAt:item.reviewSubmittedAt??item.updatedAt,
    time: formatTime(item.reviewSubmittedAt??item.updatedAt),
    kind: item.contentType === "video" ? "视频" : "图文",
    detail: formatDetail(item.fileSize, item.fileName),
    status: item.reviewStatus === "reviewing" ? "审核中" : "待审核",
    lockOwner: item.lockOwner ?? undefined,
    versionId: item.versionId,
  });
  const mapQueue = (item: QueueApiItem): ReviewItem => ({
    id: item.code,
    title: item.title,
    owner: item.uploaderName,
    product: item.productName ?? "未分配",
    productImageUrl:item.productImageUrl??null,
    version: `V${item.versionNumber}`,
    uploaderUserId:item.uploaderUserId,contentColor:item.contentColor,
    time: "本次队列",
    kind: item.contentType === "video" ? "视频" : "图文",
    detail: formatDetail(item.fileSize, item.fileName),
    status: "审核中",
    queueItemId: item.queueItemId,
    versionId: item.versionId,
  });
  const loadSnapshot = async (status = reviewStatus, showNotice = false) => {
    setLoading(true);
    try {
      const statusParam =
        status === "全部审核状态"
          ? "all"
          : status === "审核中"
            ? "reviewing"
            : "pending";
      const response = await fetch(
        `/api/reviews/pending?status=${statusParam}&group=${encodeURIComponent(reviewGroup)}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as {
        error?: string;
        snapshotAt?: string;
        contents?: PendingApiItem[];
        canProcess?:boolean;
      };
      if (!response.ok || !data.contents)
        throw new Error(data.error ?? "待审核列表读取失败");
      setSnapshotItems(data.contents.map(mapPending));
      setCanProcess(Boolean(data.canProcess));
      setSelectedIds([]);
      setRefreshedAt(data.snapshotAt ? new Date(data.snapshotAt) : new Date());
      if (showNotice) notify("待审核列表已刷新");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "待审核列表读取失败");
    } finally {
      setLoading(false);
    }
  };
  const loadSession = async (id: number) => {
    const response = await fetch(`/api/review-sessions/${id}`, {
      cache: "no-store",
    });
    const data = (await response.json()) as {
      error?: string;
      items?: QueueApiItem[];
      canRecommend?: boolean;
      canProcess?:boolean;
    };
    if (!response.ok || !data.items)
      throw new Error(data.error ?? "审核队列读取失败");
    const activeItems = data.items.filter((item) => !item.removedAt);
    const mapped = activeItems.map(mapQueue);
    const recoveredDrafts: Record<string, DraftDecision> = {};
    const recoveredComments: Record<string, string> = {};
    const recoveredRecommendations: Record<string, boolean> = {};
    activeItems.forEach((item) => {
      recoveredComments[item.code] = item.draftComment ?? "";
      recoveredRecommendations[item.code] = Boolean(item.draftRecommended);
      if (item.draftDecision)
        recoveredDrafts[item.code] = {
          decision: item.draftDecision === "approved" ? "通过" : "驳回",
          comment: item.draftComment ?? "",
          recommended: Boolean(item.draftRecommended),
        };
    });
    setCanRecommend(Boolean(data.canRecommend));
    setCanProcess(Boolean(data.canProcess));
    setRecommendCurrent(recoveredRecommendations);
    setSessionId(id);
    setQueue(mapped);
    setCurrentId(mapped[0]?.id ?? "");
    setDrafts(recoveredDrafts);
    setComments(recoveredComments);
    setMode("session");
  };

  useEffect(() => {
    void fetch("/api/groups?scope=review",{cache:"no-store"}).then(r=>r.ok?r.json():{groups:[]}).then(data=>setReviewGroups(data.groups??[]));
    let active = true;
    const initialize = async () => {
      try {
        const response = await fetch("/api/review-sessions", {
          cache: "no-store",
        });
        const data = (await response.json()) as {
          session?: { id: number } | null;
          canProcess?:boolean;
        };
        setCanProcess(Boolean(data.canProcess));
        if (active && response.ok && data.session&&data.canProcess) {
          await loadSession(data.session.id);
          notify("已恢复上次未提交的审核队列");
        } else if (active) await loadSnapshot("全部审核状态");
      } catch {
        if (active) await loadSnapshot("全部审核状态");
      }
    };
    void initialize();
    return () => {
      active = false;
    };
  }, []);
  useEffect(()=>{if(mode==="list")void loadSnapshot(reviewStatus);},[reviewGroup]);
  useEffect(() => {
    if (mode !== "list") return;
    const timer = window.setInterval(() => {
      void loadSnapshot("全部审核状态");
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [mode]);

  const ownerOptions = useMemo(
    () => [...new Set(snapshotItems.map((item) => item.owner))],
    [snapshotItems],
  );
  const reviewProductOptions = useMemo(
    () => [...new Set(snapshotItems.map((item) => item.product).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [snapshotItems],
  );
  const reviewFields = useMemo<SmartFilterField<ReviewItem>[]>(() => [
    { key: "query", label: "关键词", type: "text", getValue: (item) => [item.title, item.product, item.id, item.detail] },
    { key: "reviewStatus", label: "审核状态", type: "select", options: ["待审核", "审核中"].map((value) => ({ value, label: value })), getValue: (item) => item.status },
    { key: "contentType", label: "内容类型", type: "select", options: ["视频", "图文"].map((value) => ({ value, label: value })), getValue: (item) => item.kind },
    { key: "owner", label: "上传员工", type: "select", options: ownerOptions.map((value) => ({ value, label: value })), getValue: (item) => item.owner },
    { key: "product", label: "关联商品", type: "select", options: reviewProductOptions.map((value) => ({ value, label: value })), getValue: (item) => item.product },
    { key: "version", label: "版本", type: "text", getValue: (item) => item.version },
    { key: "time", label: "进入审核时间", type: "date", getValue: (item) => item.submittedAt??item.time },
    { key: "lockOwner", label: "当前领取人", type: "text", getValue: (item) => item.lockOwner },
  ], [ownerOptions, reviewProductOptions]);
  const [reviewView,setReviewView]=useState<FilterView>({sort:"default",group:"default"});
  const filtered = useMemo(() => {
    const matched=applySmartFilters(snapshotItems,smartRules,reviewFields);
    const time=(item:ReviewItem)=>parseServerDate(item.submittedAt??"")?.getTime()??0;
    const employee=(item:ReviewItem)=>String(item.uploaderUserId??item.owner);
    const oldest=new Map<string,number>();for(const item of matched)oldest.set(employee(item),Math.min(oldest.get(employee(item))??Infinity,time(item)));
    return [...matched].sort((a,b)=>{
      if(reviewView.group!=="none"&&employee(a)!==employee(b))return (oldest.get(employee(a))!-oldest.get(employee(b))!)||employee(a).localeCompare(employee(b));
      return (reviewView.sort==="newest"?time(b)-time(a):time(a)-time(b))||a.id.localeCompare(b.id);
    });
  }, [snapshotItems, smartRules, reviewFields,reviewView]);
  const current = queue.find((item) => item.id === currentId) ?? queue[0];
  const approvedCount = Object.values(drafts).filter(
    (item) => item.decision === "通过",
  ).length;
  const rejectedCount = Object.values(drafts).filter(
    (item) => item.decision === "驳回",
  ).length;

  const beginReview = async () => {
    const pending = filtered.filter((item) => item.status === "待审核");
    const snapshot = selectedIds.length
      ? pending.filter((item) => selectedIds.includes(item.id))
      : pending;
    if (!snapshot.length) {
      notify("当前筛选范围内没有待审核内容");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/review-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentCodes: snapshot.map((item) => item.id) }),
      });
      const data = (await response.json()) as {
        error?: string;
        sessionId?: number;
        count?: number;
      };
      if (data.sessionId && response.status === 409) {
        await loadSession(data.sessionId);
        notify("已恢复尚未提交的审核队列");
        return;
      }
      if (!response.ok || !data.sessionId)
        throw new Error(data.error ?? "审核队列创建失败");
      await loadSession(data.sessionId);
      notify(
        `已锁定 ${data.count ?? snapshot.length} 条内容，其他审核人员暂时无法重复领取`,
      );
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "审核队列创建失败");
      await loadSnapshot(reviewStatus);
    } finally {
      setBusy(false);
    }
  };
  const advance = (id: string) => {
    const index = queue.findIndex((item) => item.id === id);
    const next =
      queue[index + 1] ??
      queue.find((item) => item.id !== id && !drafts[item.id]);
    if (next) setCurrentId(next.id);
  };
  const markDecision = async (decision: "通过" | "驳回") => {
    if (!current || !sessionId || !current.queueItemId) return;
    const comment = comments[current.id]?.trim() ?? "";
    if (decision === "驳回" && !comment) {
      notify("驳回内容必须填写审核意见");
      return;
    }
    const recommended = Boolean(recommendCurrent[current.id]);
    if (recommended && !comment) {
      notify("推荐案例必须填写审核评语，用于说明值得学习或需要避免的原因");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/review-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          queueItemId: current.queueItemId,
          decision: decision === "通过" ? "approved" : "rejected",
          comment,
          recommended,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "审核结果暂存失败");
      setDrafts({
        ...drafts,
        [current.id]: { decision, comment, recommended },
      });
      advance(current.id);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "审核结果暂存失败");
    } finally {
      setBusy(false);
    }
  };
  const removeCurrent = async () => {
    if (!current || !sessionId || !current.queueItemId) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/review-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          queueItemId: current.queueItemId,
          removed: true,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "移出队列失败");
      const remaining = queue.filter((item) => item.id !== current.id);
      const nextDrafts = { ...drafts };
      delete nextDrafts[current.id];
      const nextRecommendations = { ...recommendCurrent };
      delete nextRecommendations[current.id];
      setRecommendCurrent(nextRecommendations);
      setQueue(remaining);
      setDrafts(nextDrafts);
      if (remaining.length) setCurrentId(remaining[0].id);
      else setCurrentId("");
      notify("已移出本次队列，内容仍保留在待审核列表");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "移出队列失败");
    } finally {
      setBusy(false);
    }
  };
  const cancelSession = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/review-sessions/${sessionId}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "取消审核失败");
      setMode("list");
      setSessionId(null);
      setQueue([]);
      setDrafts({});
      setComments({});
      setRecommendCurrent({});
      setSelectedIds([]);
      await loadSnapshot(reviewStatus);
      notify("已取消本次审核，暂存结果已撤销并释放占用");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "取消审核失败");
    } finally {
      setBusy(false);
    }
  };
  const submit = async (exitAfter: boolean) => {
    if (!sessionId) return;
    if (approvedCount + rejectedCount !== queue.length) {
      notify("请先审核或移出队列中的全部内容");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/review-sessions/${sessionId}`, {
        method: "POST",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "审核结果提交失败");
      setConfirmOpen(false);
      setSessionId(null);
      setQueue([]);
      setDrafts({});
      setComments({});
      setRecommendCurrent({});
      setSelectedIds([]);
      setMode("list");
      await loadSnapshot(reviewStatus);
      notify(
        exitAfter
          ? `已提交并返回审核列表：通过 ${approvedCount} 条，驳回 ${rejectedCount} 条`
          : `已提交：通过 ${approvedCount} 条，驳回 ${rejectedCount} 条`,
      );
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "审核结果提交失败");
    } finally {
      setBusy(false);
    }
  };

  if (mode === "list")
    return (
      <>
        <ModuleHeader
          title="审核中心"
          description="列表展示最近一次刷新截止时的待审核内容；每60秒自动更新，也可手动刷新。"
        />
        <div className="review-snapshot-bar">
          <div>
            <span className="live-dot" />
            <strong>待审核快照</strong>
            <small>
              刷新于{" "}
              {refreshedAt.toLocaleTimeString("zh-CN", { hour12: false })} ·
              当前筛选 {filtered.length} 条
            </small>
          </div>
          <div>
            <button
              className="secondary-button"
              disabled={loading || busy}
              onClick={() => void loadSnapshot(reviewStatus, true)}
            >
              ↻ {loading ? "刷新中" : "刷新"}
            </button>
            {canProcess?<button
              className="primary-button"
              disabled={loading || busy}
              onClick={() => void beginReview()}
            >
              审核当前内容
              {selectedIds.length ? `（${selectedIds.length}）` : ""}
            </button>:null}
          </div>
        </div>
        <section className="panel module-panel">
          {reviewGroups.length>1?<div className="group-scope-strip"><button className={reviewGroup==="all"?"selected":""} onClick={()=>setReviewGroup("all")}><strong>全部审核范围</strong><small>跨组汇总</small></button>{reviewGroups.map(group=><button key={group.id} className={reviewGroup===String(group.id)?"selected":""} style={{borderColor:group.themeColor??"#64748b"}} onClick={()=>setReviewGroup(String(group.id))}><span className="group-cover" style={{background:group.themeColor??"#64748b"}}>{group.name[0]}</span><strong>{group.name}</strong><small>{group.code}</small></button>)}</div>:null}
          <div className="review-filters legacy-list-filter" aria-hidden="true">
            <label>
              <span>⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索内容编号、标题或商品"
              />
            </label>
            <select value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option>全部员工</option>
              {ownerOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option>全部类型</option>
              <option>视频</option>
              <option>图文</option>
            </select>
            <div
              className="review-status-tabs"
              role="group"
              aria-label="审核状态筛选"
            >
              {[
                { label: "待审核", value: "待审核" },
                { label: "审核中", value: "审核中" },
                { label: "全部", value: "全部审核状态" },
              ].map((status) => (
                <button
                  key={status.value}
                  className={reviewStatus === status.value ? "active" : ""}
                  aria-pressed={reviewStatus === status.value}
                  onClick={() => {
                    setReviewStatus(status.value);
                    setSelectedIds([]);
                    void loadSnapshot(status.value);
                  }}
                >
                  {status.label}
                </button>
              ))}
            </div>
          </div>
          <RuleFilterBar moduleKey="reviews" fields={reviewFields} rules={smartRules} onChange={setSmartRules} view={reviewView} onViewChange={setReviewView} />
          <div className="review-filter-note">
            审核状态由提交、领取和审核结果自动流转；此处只用于筛选，不能人工改写。
          </div>
          <div className="table-wrap">
            <table className="module-table review-table">
              <thead>
                <tr>
                  <th>
                    {canProcess?<input
                      type="checkbox"
                      aria-label="选择当前筛选全部待审核内容"
                      checked={
                        filtered.some((item) => item.status === "待审核") &&
                        filtered
                          .filter((item) => item.status === "待审核")
                          .every((item) => selectedIds.includes(item.id))
                      }
                      onChange={(e) =>
                        setSelectedIds(
                          e.target.checked
                            ? filtered
                                .filter((item) => item.status === "待审核")
                                .map((item) => item.id)
                            : [],
                        )
                      }
                    />:null}
                  </th>
                  <th>状态</th><th>内容</th><th>类型</th><th>上传员工</th><th>关联商品</th><th>提交时间</th><th>文件大小</th><th>文件版本</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} style={{backgroundColor:employeeColor(item.uploaderUserId??item.owner,item.contentColor)}}>
                    <td>{canProcess?<input type="checkbox" aria-label={`选择${item.title}`} disabled={item.status==="审核中"} checked={selectedIds.includes(item.id)} onChange={e=>setSelectedIds(e.target.checked?[...selectedIds,item.id]:selectedIds.filter(id=>id!==item.id))}/>:null}</td>
                    <td><Badge tone={item.status==="审核中"?"blue":"slate"}>{item.status}</Badge>{item.lockOwner?<small className="locked-by">{item.lockOwner}占用</small>:null}</td>
                    <td><ContentPreview hoverEnabled={false} code={item.id} versionId={item.versionId} title={item.title} kind={item.kind}/><div className="content-cell"><strong>{item.title}</strong></div></td><td>{item.kind}</td>
                    <td>{item.owner}</td><td><span className="expanded-product-cell"><ProductImage url={item.productImageUrl} name={item.product}/><span>{item.product}</span></span></td><td>{item.time}</td><td>{item.detail}</td><td>{item.version}</td>
                  </tr>
                ))}              </tbody>
            </table>
            {!loading && !filtered.length && (
              <div className="empty-state">当前筛选范围内没有内容</div>
            )}
          </div>
        </section>
      </>
    );

  return (
    <>
      <div className="review-session-header">
        <div>
          <button disabled={busy} onClick={() => void cancelSession()}>
            ← 返回列表
          </button>
          <div>
            <h2>审核工作台</h2>
            <p>本次队列创建后保持固定；新上传内容不会自动插入。</p>
          </div>
        </div>
        <div className="review-lock">
          <span>♙</span>
          <div>
            <strong>当前队列已占用</strong>
            <small>审核结果暂存在本次队列，提交后才正式生效</small>
          </div>
        </div>
      </div>
      <div className="review-workbench">
        <aside className="panel queue-sidebar">
          <div className="queue-summary">
            <div>
              <strong>本次审核队列</strong>
              <small>{queue.length} 条内容</small>
            </div>
            <span>
              {approvedCount + rejectedCount}/{queue.length}
            </span>
          </div>
          <div className="queue-progress">
            <i
              style={{
                width: `${queue.length ? ((approvedCount + rejectedCount) / queue.length) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="queue-items">
            {queue.map((item, index) => {
              const draft = drafts[item.id];
              return (
                <button
                  key={item.id}
                  style={{backgroundColor:employeeColor(item.uploaderUserId??item.owner,item.contentColor)}}
                  className={
                    current?.id === item.id ? "queue-item active" : "queue-item"
                  }
                  onClick={() => setCurrentId(item.id)}
                >
                  <span className="queue-order">{index + 1}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>
                      {item.owner} · {item.version}
                    </small>
                  </div>
                  {draft ? (
                    <Badge tone={draft.decision === "通过" ? "green" : "red"}>
                      {draft.recommended ? "★ " : ""}
                      {draft.decision}
                    </Badge>
                  ) : (
                    <Badge tone="slate">未审核</Badge>
                  )}
                </button>
              );
            })}
          </div>
          <div className="queue-actions">
            <button disabled={busy} onClick={() => void cancelSession()}>
              取消
            </button>
            <button
              disabled={
                busy ||
                !queue.length ||
                approvedCount + rejectedCount !== queue.length
              }
              onClick={() => setConfirmOpen(true)}
            >
              提交审核结果
            </button>
          </div>
        </aside>
        {current ? (
          <ContentDetailPanel
            item={{
              id: current.id,
              title: current.title,
              kind: current.kind,
              product: current.product,
              account: "未分配",
              owner: current.owner,
              version: current.version,
              status: "审核中",
              visibility: "仅本人和管理员",
              remark: "",
              time: current.time,
              detail: current.detail,
              locked: true,
              lockOwner: "当前审核人",
            }}
            navigate={navigate}
            footer={
              <div className="review-form session-form">
                <label>
                  审核批注
                  <textarea
                    value={comments[current.id] ?? ""}
                    onChange={(e) =>
                      setComments({ ...comments, [current.id]: e.target.value })
                    }
                    placeholder={recommendCurrent[current.id]?uiSettings.reviewRecommendationPlaceholder:uiSettings.reviewRejectPlaceholder}
                  />
                </label>
                {canRecommend && (
                  <label
                    className={
                      recommendCurrent[current.id]
                        ? "recommend-toggle active"
                        : "recommend-toggle"
                    }
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(recommendCurrent[current.id])}
                      onChange={(event) =>
                        setRecommendCurrent({
                          ...recommendCurrent,
                          [current.id]: event.target.checked,
                        })
                      }
                    />
                    <span>
                      <strong>★ 推荐案例</strong>
                      <small>
                        通过或驳回都可以推荐；提交后自动设为公司内部公开，含义由审核评语说明。
                      </small>
                    </span>
                  </label>
                )}
                <div>
                  <button
                    disabled={busy}
                    className="remove-button"
                    onClick={() => void removeCurrent()}
                  >
                    移出队列
                  </button>
                  <button
                    disabled={busy}
                    className="reject-button"
                    onClick={() => void markDecision("驳回")}
                  >
                    驳回
                  </button>
                  <button
                    disabled={busy}
                    className="approve-button"
                    onClick={() => void markDecision("通过")}
                  >
                    ✓ 通过
                  </button>
                </div>
              </div>
            }
          />
        ) : (
          <section className="panel queue-empty">
            <strong>当前队列已空</strong>
            <p>点击取消可结束本次队列，已移出的内容会回到待审核列表。</p>
          </section>
        )}
      </div>
      {confirmOpen && (
        <div className="modal-backdrop">
          <div
            className="modal confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="确认提交审核结果"
          >
            <div className="confirm-icon">✓</div>
            <h3>确认提交审核结果？</h3>
            <p>提交后审核结果正式生效；推荐案例将自动设为公司内部公开。</p>
            <div className="confirm-counts">
              <div>
                <strong>{approvedCount}</strong>
                <small>通过</small>
              </div>
              <div>
                <strong>{rejectedCount}</strong>
                <small>驳回</small>
              </div>
              <div>
                <strong>
                  {
                    Object.values(drafts).filter((item) => item.recommended)
                      .length
                  }
                </strong>
                <small>推荐案例</small>
              </div>
            </div>
            <div className="confirm-actions">
              <button disabled={busy} onClick={() => void submit(false)}>
                确认
              </button>
              <button
                disabled={busy}
                className="primary-button"
                onClick={() => void submit(true)}
              >
                确认并退出
              </button>
            </div>
            <button
              className="confirm-close"
              onClick={() => setConfirmOpen(false)}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function LegacyPublisher({
  notify,
  navigate,
  platformIcons,
  platforms,
}: Pick<Props, "notify" | "navigate" | "platformIcons"> & {
  platforms: ManagedPlatform[];
}) {
  type PublishRow = {
    id: string;
    content: string;
    product: string;
    productImageUrl?: string | null;
    kind: string;
    version: string;
    account: string;
    time: string;
    owner: string;
    detail: string;
    coverUrl?: string | null;
  };
  type CopyDraft = { title: string; body: string; topics: string };
  const platformAccounts: Record<PlatformKey, string[]> = {
    dy: ["抖音｜轻奢饰界", "抖音｜饰品研究所"],
    ks: ["快手｜每日新饰", "快手｜珠宝优选"],
    xhs: ["小红书｜首饰灵感簿", "小红书｜礼物研究所"],
  };
  const filters = [
    "全部账号",
    "未发布",
    ...Object.values(platformAccounts).flat(),
  ];
  const configuredPlatforms = platforms.filter(
    (platform) => platform.status === "启用",
  );
  const [rows, setRows] = useState<PublishRow[]>([
    {
      id: "PUB-219",
      content: "项链通勤搭配",
      product: "锁骨链 NK-008",
      kind: "视频",
      version: "V3",
      account: "抖音｜轻奢饰界",
      time: "今天 11:40",
      owner: "周莉",
      detail: "00:41 · 102.3 MB",
    },
    {
      id: "PUB-216",
      content: "珍珠耳环日常搭配",
      product: "珍珠耳环 PE-014",
      kind: "视频",
      version: "V2",
      account: "小红书｜首饰灵感簿",
      time: "今天 10:28",
      owner: "林晓",
      detail: "00:28 · 86.4 MB",
    },
    {
      id: "PUB-208",
      content: "戒指细节展示",
      product: "星芒戒指 RG-031",
      kind: "图文",
      version: "V1",
      account: "快手｜每日新饰",
      time: "昨天 16:15",
      owner: "陈瑜",
      detail: "8 张图片 · 24.8 MB",
    },
    {
      id: "PUB-203",
      content: "礼盒开箱展示",
      product: "礼盒套装 BX-002",
      kind: "视频",
      version: "V3",
      account: "抖音｜轻奢饰界",
      time: "昨天 14:06",
      owner: "林晓",
      detail: "00:35 · 91.6 MB",
    },
  ]);
  const [activeFilter, setActiveFilter] = useState("全部账号");
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState("");
  const [litPlatforms, setLitPlatforms] = useState<Record<string, string[]>>({
    "PUB-219": ["dy"],
    "PUB-216": ["dy", "xhs"],
    "PUB-208": ["ks"],
    "PUB-203": [],
  });
  const [assignedPlatforms, setAssignedPlatforms] = useState<
    Record<string, PlatformKey[]>
  >({
    "PUB-219": ["dy", "xhs"],
    "PUB-216": ["dy", "xhs"],
    "PUB-208": ["ks"],
    "PUB-203": ["dy", "ks"],
  });
  const [selectedAccounts, setSelectedAccounts] = useState<
    Record<string, Partial<Record<PlatformKey, string>>>
  >({
    "PUB-219": { dy: "抖音｜轻奢饰界" },
    "PUB-216": { xhs: "小红书｜首饰灵感簿" },
    "PUB-208": { ks: "快手｜每日新饰" },
    "PUB-203": {},
  });
  const [confirmToggle, setConfirmToggle] = useState<{
    contentId: string;
    platformKey: PlatformKey;
    platformLabel: string;
    nextLit: boolean;
  } | null>(null);
  const [copyPlatform, setCopyPlatform] = useState<PlatformKey>("dy");
  const [copyDrafts, setCopyDrafts] = useState<Record<string, CopyDraft>>({});
  const detail = rows.find((row) => row.id === detailId);
  const isUnpublished = (rowId: string) =>
    (assignedPlatforms[rowId] ?? []).some(
      (key) => !(litPlatforms[rowId] ?? []).includes(key),
    );
  const visibleRows = rows.filter(
    (row) =>
      (activeFilter === "全部账号" || activeFilter === "未发布"
        ? activeFilter !== "未发布" || isUnpublished(row.id)
        : Object.values(selectedAccounts[row.id] ?? {}).includes(
            activeFilter,
          )) &&
      (!query.trim() ||
        `${row.content}${row.product}${row.id}`.includes(query.trim())),
  );
  const requestToggle = (
    contentId: string,
    platformKey: PlatformKey,
    platformLabel: string,
  ) =>
    setConfirmToggle({
      contentId,
      platformKey,
      platformLabel,
      nextLit: !(litPlatforms[contentId] ?? []).includes(platformKey),
    });
  const applyToggle = () => {
    if (!confirmToggle) return;
    const current = litPlatforms[confirmToggle.contentId] ?? [];
    setLitPlatforms({
      ...litPlatforms,
      [confirmToggle.contentId]: confirmToggle.nextLit
        ? [...current, confirmToggle.platformKey]
        : current.filter((key) => key !== confirmToggle.platformKey),
    });
    notify(
      `${confirmToggle.platformLabel}已确认标记为${confirmToggle.nextLit ? "已发布" : "未发布"}`,
    );
    setConfirmToggle(null);
  };
  const changeAssignment = (
    rowId: string,
    key: PlatformKey,
    checked: boolean,
  ) => {
    const current = assignedPlatforms[rowId] ?? [];
    if (!checked && (litPlatforms[rowId] ?? []).includes(key)) {
      notify("请先关闭该平台的已发布灯，再取消平台分配");
      return;
    }
    if (!checked && current.length === 1) {
      notify("至少保留一个目标发布平台");
      return;
    }
    const next = checked
      ? [...current, key]
      : current.filter((item) => item !== key);
    setAssignedPlatforms({ ...assignedPlatforms, [rowId]: next });
    if (!checked)
      setSelectedAccounts({
        ...selectedAccounts,
        [rowId]: { ...(selectedAccounts[rowId] ?? {}), [key]: undefined },
      });
    if (!checked && copyPlatform === key) setCopyPlatform(next[0] ?? "dy");
    if (checked) setCopyPlatform(key);
  };
  const copyKey = detail ? `${detail.id}:${copyPlatform}` : "";
  const currentCopy: CopyDraft = copyDrafts[copyKey] ?? {
    title: "",
    body: "",
    topics: "",
  };
  const accountSummary = detail
    ? (assignedPlatforms[detail.id] ?? [])
        .map((key) => selectedAccounts[detail.id]?.[key])
        .filter(Boolean)
        .join(" / ") || "未分配"
    : "未分配";
  const updateCopy = (change: Partial<CopyDraft>) =>
    setCopyDrafts({ ...copyDrafts, [copyKey]: { ...currentCopy, ...change } });
  const importCopy = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateCopy({ body: String(reader.result ?? "") });
    reader.readAsText(file);
  };
  const renderLights = (rowId: string) => (
    <div className="platform-lights">
      {configuredPlatforms
        .filter((platform) =>
          (assignedPlatforms[rowId] ?? []).includes(platform.key),
        )
        .map((platform) => {
          const lit = (litPlatforms[rowId] ?? []).includes(platform.key);
          return (
            <button
              key={platform.key}
              className={`platform-light ${platform.key} ${lit ? "lit" : ""}`}
              aria-label={`${platform.name}：${lit ? "已发布" : "未发布"}`}
              aria-pressed={lit}
              onClick={() => requestToggle(rowId, platform.key, platform.name)}
              title={`${platform.name}：${lit ? "已发布" : "未发布"}`}
            >
              <span>
                {platformIcons[platform.key] ? (
                  <img src={platformIcons[platform.key]} alt="" />
                ) : (
                  platform.mark
                )}
              </span>
            </button>
          );
        })}
    </div>
  );

  if (detail)
    return (
      <>
        <ContentDetailPanel
          item={{
            id: detail.id,
            title: detail.content,
            kind: detail.kind,
            product: detail.product,
            account: accountSummary,
            owner: detail.owner,
            version: detail.version,
            status: isUnpublished(detail.id) ? "待发布" : "发布完成",
            visibility: "全部可见",
            remark: "审核通过后进入发布池",
            time: detail.time,
            detail: detail.detail,
          }}
          navigate={navigate}
          onBack={() => setDetailId("")}
          productControl={
            <select
              className="detail-inline-select"
              value={detail.product}
              onChange={(e) =>
                setRows(
                  rows.map((row) =>
                    row.id === detail.id
                      ? { ...row, product: e.target.value }
                      : row,
                  ),
                )
              }
            >
              <option>未分配</option>
              <option>锁骨链 NK-008</option>
              <option>珍珠耳环 PE-014</option>
              <option>星芒戒指 RG-031</option>
              <option>礼盒套装 BX-002</option>
            </select>
          }
          extraFields={
            <>
              <section className="publish-detail-section">
                <div>
                  <h3>目标发布平台</h3>
                  <small>勾选平台后，为每个平台分别选择一个发布账号。</small>
                </div>
                <div className="platform-assignment">
                  {configuredPlatforms.map((platform) => (
                    <label key={platform.key}>
                      <input
                        type="checkbox"
                        checked={(assignedPlatforms[detail.id] ?? []).includes(
                          platform.key,
                        )}
                        onChange={(e) =>
                          changeAssignment(
                            detail.id,
                            platform.key,
                            e.target.checked,
                          )
                        }
                      />
                      <span>
                        {platformIcons[platform.key] ? (
                          <img src={platformIcons[platform.key]} alt="" />
                        ) : (
                          platform.mark
                        )}
                      </span>
                      {platform.name}
                    </label>
                  ))}
                </div>
                <div className="platform-account-groups">
                  {configuredPlatforms
                    .filter((platform) =>
                      (assignedPlatforms[detail.id] ?? []).includes(
                        platform.key,
                      ),
                    )
                    .map((platform) => (
                      <div
                        className="platform-account-group"
                        key={platform.key}
                      >
                        <div>
                          <span className={`account-logo ${platform.key}`}>
                            {platformIcons[platform.key] ? (
                              <img src={platformIcons[platform.key]} alt="" />
                            ) : (
                              platform.mark
                            )}
                          </span>
                          <div>
                            <strong>{platform.name}账号</strong>
                            <small>同一内容在同一平台选择一个账号</small>
                          </div>
                        </div>
                        <div>
                          {(platformAccounts[platform.key] ?? []).map(
                            (account) => (
                              <label
                                key={account}
                                className={
                                  selectedAccounts[detail.id]?.[
                                    platform.key
                                  ] === account
                                    ? "selected"
                                    : ""
                                }
                              >
                                <input
                                  type="radio"
                                  name={`${detail.id}-${platform.key}-account`}
                                  checked={
                                    selectedAccounts[detail.id]?.[
                                      platform.key
                                    ] === account
                                  }
                                  onChange={() =>
                                    setSelectedAccounts({
                                      ...selectedAccounts,
                                      [detail.id]: {
                                        ...(selectedAccounts[detail.id] ?? {}),
                                        [platform.key]: account,
                                      },
                                    })
                                  }
                                />
                                <span className="mini-avatar">
                                  {account.split("｜")[1]?.[0] ?? platform.mark}
                                </span>
                                {account.split("｜")[1]}
                              </label>
                            ),
                          )}
                          <button
                            className={
                              !selectedAccounts[detail.id]?.[platform.key]
                                ? "selected"
                                : ""
                            }
                            onClick={() =>
                              setSelectedAccounts({
                                ...selectedAccounts,
                                [detail.id]: {
                                  ...(selectedAccounts[detail.id] ?? {}),
                                  [platform.key]: undefined,
                                },
                              })
                            }
                          >
                            暂不分配
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
                <div className="detail-platform-lights">
                  <strong>发布状态</strong>
                  {renderLights(detail.id)}
                </div>
              </section>
              <section className="publish-copy-section">
                <div className="publish-copy-head">
                  <div>
                    <h3>发布标题、文案与话题</h3>
                    <small>
                      每个平台单独保存；当前局域网版本以手工填写或导入为主。
                    </small>
                  </div>
                  <button disabled title="配置AI服务后启用">
                    AI生成（未配置）
                  </button>
                </div>
                <div className="copy-platform-tabs">
                  {configuredPlatforms
                    .filter((platform) =>
                      (assignedPlatforms[detail.id] ?? []).includes(
                        platform.key,
                      ),
                    )
                    .map((platform) => (
                      <button
                        key={platform.key}
                        className={
                          copyPlatform === platform.key ? "active" : ""
                        }
                        onClick={() => setCopyPlatform(platform.key)}
                      >
                        {platform.name}
                      </button>
                    ))}
                </div>
                <label>
                  发布标题
                  <input
                    value={currentCopy.title}
                    onChange={(e) => updateCopy({ title: e.target.value })}
                    placeholder="填写该平台的发布标题"
                  />
                </label>
                <label>
                  发布文案
                  <textarea
                    value={currentCopy.body}
                    onChange={(e) => updateCopy({ body: e.target.value })}
                    placeholder="填写正文，或从TXT文件导入"
                  />
                </label>
                <label>
                  话题
                  <input
                    value={currentCopy.topics}
                    onChange={(e) => updateCopy({ topics: e.target.value })}
                    placeholder="#通勤饰品 #项链搭配"
                  />
                </label>
                <label className="copy-import">
                  <input
                    type="file"
                    accept=".txt,text/plain"
                    onChange={(e) => importCopy(e.target.files?.[0])}
                  />
                  导入文案 TXT
                </label>
              </section>
            </>
          }
          footer={
            <div className="detail-page-actions">
              <span>
                发布资料按平台分别保存；点亮或关闭发布灯均需二次确认。
              </span>
              <button
                className="primary-button"
                onClick={() => notify("发布详情已保存")}
              >
                保存发布资料
              </button>
            </div>
          }
        />
        {confirmToggle && (
          <div className="modal-backdrop">
            <div className="modal confirm-modal">
              <div className="confirm-icon">!</div>
              <h3>
                确认{confirmToggle.nextLit ? "点亮" : "关闭"}
                {confirmToggle.platformLabel}发布灯？
              </h3>
              <p>
                {confirmToggle.nextLit
                  ? "确认后表示该内容已在此平台完成发布。"
                  : "关闭后表示该平台当前未发布，请确认没有误操作。"}
              </p>
              <div className="confirm-actions publish-confirm-actions">
                <button onClick={() => setConfirmToggle(null)}>取消</button>
                <button className="primary-button" onClick={applyToggle}>
                  确认{confirmToggle.nextLit ? "点亮" : "关闭"}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );

  return (
    <>
      <ModuleHeader
        title="发布管理"
        description="审核通过内容按账号集中处理；点击平台灯即可记录该平台是否已经发布。"
      />
      <section className="panel account-quick-filter">
        <div className="account-filter-head">
          <div>
            <strong>按账号快捷筛选</strong>
            <small>“未发布”显示仍有目标平台未点亮的内容。</small>
          </div>
          <label>
            <span>⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索内容或商品"
            />
          </label>
        </div>
        <div className="account-filter-tabs">
          {filters.map((filter) => (
            <button
              key={filter}
              className={activeFilter === filter ? "active" : ""}
              onClick={() => setActiveFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
      </section>
      <div className="platform-light-legend">
        <span>
          <i /> 未发布
        </span>
        <span>
          <i className="lit" /> 已发布
        </span>
        <small>平台灯及顺序来自“平台与店铺”设置。</small>
      </div>
      <section className="panel module-panel">
        <div className="table-wrap">
          <table className="module-table publish-light-table">
            <thead>
              <tr>
                <th>内容</th>
                <th>发布平台</th>
                <th>关联商品</th>
                <th>类型/版本</th>
                <th>进入发布池时间</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, i) => (
                <tr key={row.id}>
                  <td>
                    <ContentCoverThumb url={row.coverUrl} kind={row.kind}/>
                    <div className="content-cell">
                      <button
                        className="content-detail-link"
                        onClick={() => {
                          setDetailId(row.id);
                          setCopyPlatform(
                            (assignedPlatforms[row.id] ?? ["dy"])[0],
                          );
                        }}
                      >
                        {row.content}
                      </button>
                      <small>{row.id} · 点击名称查看详情</small>
                    </div>
                  </td>
                  <td>{renderLights(row.id)}</td>
                  <td><span className="publish-product-cell"><ProductImage url={row.productImageUrl} name={row.product}/><span>{row.product}</span></span></td>
                  <td>
                    {row.kind} · {row.version}
                  </td>
                  <td>{row.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {confirmToggle && (
        <div className="modal-backdrop">
          <div className="modal confirm-modal">
            <div className="confirm-icon">!</div>
            <h3>
              确认{confirmToggle.nextLit ? "点亮" : "关闭"}
              {confirmToggle.platformLabel}发布灯？
            </h3>
            <p>
              {confirmToggle.nextLit
                ? "确认后表示该内容已在此平台完成发布。"
                : "关闭后表示该平台当前未发布，请确认没有误操作。"}
            </p>
            <div className="confirm-actions publish-confirm-actions">
              <button onClick={() => setConfirmToggle(null)}>取消</button>
              <button className="primary-button" onClick={applyToggle}>
                确认{confirmToggle.nextLit ? "点亮" : "关闭"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PublishManagement({
  notify,
  navigate,
  platformIcons,
  platforms,
}: Pick<Props, "notify" | "navigate" | "platformIcons"> & {
  platforms: ManagedPlatform[];
}) {
  type CopyDraft = { title: string; body: string; topics: string };
  type PublishAssignment = {
    id: number;
    platformId: number;
    platformCode: string;
    platformName: string;
    accountId: number | null;
    accountName: string | null;
    productMasterId: number | null;
    publishStatus: string;
    publishedAt: string | null;
    handlerUserId:number|null;
    handlingStartedAt:string|null;
    rowVersion:number;
    copy: { title: string; body: string; topics: string[] };
  };
  type PublishRow = {
    uploaderUserId?:number;
    contentColor?:string|null;
    contentId: number;
    id: string;
    content: string;
    productMasterId: number | null;
    product: string;
    productImageUrl?: string | null;
    kind: string;
    version: string;
    time: string;
    approvedAt: string;
    fileSize: number;
    owner: string;
    detail: string;
    coverUrl?: string | null;
    assignments: PublishAssignment[];
  };
  type PlatformOption = {
    id: number;
    code: string;
    name: string;
    status: string;
    sortOrder: number;
    iconStoragePath: string | null;
  };
  type AccountOption = {
    id: number;
    platformId: number;
    code: string;
    name: string;
    status: string;
  };
  type ProductOption = {
    id: number;
    name: string;
    status: string;
    imageUrl?: string | null;
  };
  type PublishingApi = {
    currentUserId:number;
    emptyReason?:string;
    emptyMessage?:string;
    contents: Array<{
      id: number;
      code: string;
      title: string;
      contentType: string;
      productMasterId: number | null;
      productName: string | null;
      productCode: string | null;
      productImageUrl?: string | null;
      coverUrl?: string | null;
      versionId?: number;
      uploaderName: string;
      uploaderUserId?:number;
      contentColor?:string|null;
      versionNumber: number;
      fileName: string;
      fileSize: number;
      approvedAt: string;
      assignments: PublishAssignment[];
    }>;
    options: {
      platforms: PlatformOption[];
      accounts: AccountOption[];
      products: ProductOption[];
    };
  };
  const [rows, setRows] = useState<PublishRow[]>([]);
  const [publishingEmptyMessage,setPublishingEmptyMessage]=useState("");
  const [publishingUserId,setPublishingUserId]=useState(0);
  const [platformOptions, setPlatformOptions] = useState<PlatformOption[]>([]);
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [activeFilter, setActiveFilter] = useState("全部账号");
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState("");
  const [litPlatforms, setLitPlatforms] = useState<Record<string, string[]>>(
    {},
  );
  const [assignedPlatforms, setAssignedPlatforms] = useState<
    Record<string, PlatformKey[]>
  >({});
  const [selectedAccounts, setSelectedAccounts] = useState<
    Record<string, Partial<Record<PlatformKey, number>>>
  >({});
  const [selectedProducts, setSelectedProducts] = useState<
    Record<string, Partial<Record<PlatformKey, number>>>
  >({});
  const [confirmToggle, setConfirmToggle] = useState<{
    contentId: string;
    platformKey: PlatformKey;
    platformLabel: string;
    nextLit: boolean;
  } | null>(null);
  const [copyPlatform, setCopyPlatform] = useState<PlatformKey>("dy");
  const [copyDrafts, setCopyDrafts] = useState<Record<string, CopyDraft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [smartRules, setSmartRules] = useState<SmartFilterRule[]>([]);
  const [selectedPublishIds,setSelectedPublishIds]=useState<string[]>([]);
  const configuredPlatforms = platformOptions
    .filter((platform) => platform.status === "active")
    .map((platform) => ({
      key: platform.code,
      name: platform.name,
      mark:
        platforms.find((item) => item.key === platform.code)?.mark ??
        platform.name[0],
      status: "启用" as const,
      accounts: accountOptions.filter(
        (account) => account.platformId === platform.id,
      ).length,
      id: platform.id,
    }));
  const accountLabel = (accountId: number | undefined) => {
    const account = accountOptions.find((item) => item.id === accountId);
    if (!account) return "";
    const platform = platformOptions.find(
      (item) => item.id === account.platformId,
    );
    return `${platform?.name ?? "平台"}｜${account.name}`;
  };
  const filters = [
    "全部账号",
    "未发布",
    ...accountOptions.map((account) => accountLabel(account.id)),
  ];

  const loadPublishing = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/publishing", { cache: "no-store" });
      const data = (await response.json()) as PublishingApi & {
        error?: string;
      };
      if (!response.ok || !data.contents)
        throw new Error(data.error ?? "发布池读取失败");
      const mapped = data.contents.map(
        (item): PublishRow => {
          const assignmentProduct = item.assignments
            .map((assignment) => data.options.products.find((candidate) => candidate.id === assignment.productMasterId))
            .find(Boolean);
          return {
          contentId: item.id,
          id: item.code,
          content: item.title,
          productMasterId: item.productMasterId,
          product: item.productName
            ? `${item.productName} ${item.productCode ?? ""}`.trim()
            : assignmentProduct
              ? assignmentProduct.name
              : "未分配",
          productImageUrl: item.productImageUrl ?? assignmentProduct?.imageUrl ?? null,
          kind: item.contentType === "video" ? "视频" : "图文",
          version: `V${item.versionNumber}`,
          time: new Date(
            item.approvedAt.replace(" ", "T") +
              (item.approvedAt.includes("Z") || item.approvedAt.includes("+")
                ? ""
                : "Z"),
          ).toLocaleString("zh-CN", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          approvedAt: item.approvedAt,
          fileSize: item.fileSize,
          owner: item.uploaderName,
          detail: `${(item.fileSize / 1024 / 1024).toFixed(item.fileSize > 10 * 1024 * 1024 ? 1 : 2)} MB · ${item.fileName}`,
          coverUrl: item.coverUrl ?? (item.versionId ? `/api/content-versions/${item.versionId}/cover` : null),
          uploaderUserId:item.uploaderUserId,contentColor:item.contentColor,
          assignments: item.assignments,
          };
        },
      );
      const nextAssigned: Record<string, string[]> = {};
      const nextLit: Record<string, string[]> = {};
      const nextAccounts: Record<string, Partial<Record<string, number>>> = {};
      const nextProducts: Record<string, Partial<Record<string, number>>> = {};
      const nextCopies: Record<string, CopyDraft> = {};
      mapped.forEach((row) => {
        nextAssigned[row.id] = row.assignments.map((item) => item.platformCode);
        nextLit[row.id] = row.assignments
          .filter((item) => item.publishStatus === "published")
          .map((item) => item.platformCode);
        nextAccounts[row.id] = {};
        nextProducts[row.id] = {};
        row.assignments.forEach((item) => {
          if (item.accountId)
            nextAccounts[row.id][item.platformCode] = item.accountId;
          nextProducts[row.id][item.platformCode] = item.productMasterId ?? undefined;
          nextCopies[`${row.id}:${item.platformCode}`] = {
            title: item.copy.title,
            body: item.copy.body,
            topics: item.copy.topics.join(" "),
          };
        });
      });
      setRows(mapped);
      setPublishingEmptyMessage(data.emptyMessage??"");
      setPublishingUserId(data.currentUserId??0);
      setPlatformOptions(data.options.platforms);
      setAccountOptions(data.options.accounts);
      setProductOptions(data.options.products);
      setAssignedPlatforms(nextAssigned);
      setLitPlatforms(nextLit);
      setSelectedAccounts(nextAccounts);
      setSelectedProducts(nextProducts);
      setCopyDrafts(nextCopies);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "发布池读取失败");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPublishing();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const detail = rows.find((row) => row.id === detailId);
  const isUnpublished = (rowId: string) =>
    !assignedPlatforms[rowId]?.length ||
    (assignedPlatforms[rowId] ?? []).some(
      (key) => !(litPlatforms[rowId] ?? []).includes(key),
    );
  const publishStatusLabel = (rowId: string) => {
    const assigned = assignedPlatforms[rowId] ?? [];
    if (!assigned.length) return "未选择平台";
    return assigned.every((key) => (litPlatforms[rowId] ?? []).includes(key))
      ? "已发布"
      : "待发布";
  };
  const productLabel = (row: PublishRow) => {
    const labels = (assignedPlatforms[row.id] ?? [])
      .map((key) => {
        const product = productOptions.find(
          (item) => item.id === selectedProducts[row.id]?.[key],
        );
        return product ? product.name : "";
      })
      .filter(Boolean);
    return labels.length ? [...new Set(labels)].join(" / ") : "未关联商品";
  };
  const publishingFields = useMemo<SmartFilterField<PublishRow>[]>(() => [
    { key: "query", label: "内容/编号", type: "text", getValue: (row) => [row.content, row.id] },
    { key: "product", label: "关联商品", type: "select", options: [...new Set(rows.map(productLabel))].map((value) => ({ value, label: value })), getValue: productLabel },
    { key: "contentType", label: "内容类型", type: "select", options: ["视频", "图文"].map((value) => ({ value, label: value })), getValue: (row) => row.kind },
    { key: "version", label: "版本", type: "text", getValue: (row) => row.version },
    { key: "owner", label: "上传员工", type: "select", options: [...new Set(rows.map((row) => row.owner))].map((value) => ({ value, label: value })), getValue: (row) => row.owner },
    { key: "platform", label: "发布平台", type: "select", options: configuredPlatforms.map((item) => ({ value: item.name, label: item.name })), getValue: (row) => (assignedPlatforms[row.id] ?? []).map((code) => configuredPlatforms.find((item) => item.key === code)?.name ?? code) },
    { key: "account", label: "发布账号", type: "select", options: accountOptions.map((item) => ({ value: accountLabel(item.id), label: accountLabel(item.id) })), getValue: (row) => Object.values(selectedAccounts[row.id] ?? {}).map((id) => accountLabel(id)) },
    { key: "publishStatus", label: "发布状态", type: "select", options: ["未选择平台", "待发布", "已发布"].map((value) => ({ value, label: value })), getValue: (row) => publishStatusLabel(row.id) },
    { key: "approvedAt", label: "进入发布池时间", type: "date", getValue: (row) => row.approvedAt },
    { key: "fileSize", label: "文件大小", type: "number", getValue: (row) => row.fileSize },
  ], [rows, configuredPlatforms, accountOptions, productOptions, assignedPlatforms, litPlatforms, selectedAccounts, selectedProducts]);
  const visibleRows = useMemo(() => applySmartFilters(rows, smartRules, publishingFields), [rows, smartRules, publishingFields]);
  const downloadSelected=async()=>{if(!selectedPublishIds.length)return;setSaving(true);try{const response=await fetch("/api/publishing/download",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({codes:selectedPublishIds})});if(!response.ok){const data=await response.json();throw new Error(data.error??"批量下载失败");}const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`发布文件-${new Date().toISOString().slice(0,10)}.zip`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),30000);notify(`已生成 ${selectedPublishIds.length} 条内容的下载包`);}catch(error){notify(error instanceof Error?error.message:"批量下载失败");}finally{setSaving(false);}};
  const requestToggle = (
    contentId: string,
    platformKey: PlatformKey,
    platformLabel: string,
  ) => {
    const row = rows.find((item) => item.id === contentId);
    const assignment=row?.assignments.find((item) => item.platformCode === platformKey);
    if (!assignment) {
      notify("请先保存发布详情，再操作该平台发布灯");
      return;
    }
    if(assignment.handlerUserId!==publishingUserId){notify(assignment.handlerUserId?"该任务已由其他发布人员领取":"请先点击“开始发布”领取任务");return;}
    setConfirmToggle({
      contentId,
      platformKey,
      platformLabel,
      nextLit: !(litPlatforms[contentId] ?? []).includes(platformKey),
    });
  };
  const applyToggle = async () => {
    if (!confirmToggle) return;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/publishing/${encodeURIComponent(confirmToggle.contentId)}/platforms/${encodeURIComponent(confirmToggle.platformKey)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ published: confirmToggle.nextLit, expectedVersion: rows.find(row => row.id === confirmToggle.contentId)?.assignments.find(item => item.platformCode === confirmToggle.platformKey)?.rowVersion }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "发布状态保存失败");
      notify(
        `${confirmToggle.platformLabel}已确认标记为${confirmToggle.nextLit ? "已发布" : "未发布"}`,
      );
      setConfirmToggle(null);
      await loadPublishing();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "发布状态保存失败");
    } finally {
      setSaving(false);
    }
  };
  const changeAssignment = (
    rowId: string,
    key: PlatformKey,
    checked: boolean,
  ) => {
    const current = assignedPlatforms[rowId] ?? [];
    if (!checked && (litPlatforms[rowId] ?? []).includes(key)) {
      notify("请先关闭该平台的已发布灯，再取消平台分配");
      return;
    }
    if (!checked && current.length === 1) {
      notify("至少保留一个目标发布平台");
      return;
    }
    const next = checked
      ? [...current, key]
      : current.filter((item) => item !== key);
    setAssignedPlatforms({ ...assignedPlatforms, [rowId]: next });
    if (checked && !Object.prototype.hasOwnProperty.call(selectedProducts[rowId] ?? {}, key)) {
      const sourceProductId = rows.find(row => row.id === rowId)?.productMasterId;
      const sourceProduct = productOptions.find(product => product.id === sourceProductId && product.status === "active");
      setSelectedProducts(current => ({...current, [rowId]: {...current[rowId], [key]: sourceProduct?.id}}));
    }
    if (!checked)
      setSelectedAccounts({
        ...selectedAccounts,
        [rowId]: { ...(selectedAccounts[rowId] ?? {}), [key]: undefined },
      });
    if (!checked && copyPlatform === key) setCopyPlatform(next[0] ?? "dy");
    if (checked) setCopyPlatform(key);
  };
  const copyKey = detail ? `${detail.id}:${copyPlatform}` : "";
  const currentCopy: CopyDraft = copyDrafts[copyKey] ?? {
    title: "",
    body: "",
    topics: "",
  };
  const accountSummary = detail
    ? (assignedPlatforms[detail.id] ?? [])
        .map((key) => accountLabel(selectedAccounts[detail.id]?.[key]))
        .filter(Boolean)
        .join(" / ") || "未分配"
    : "未分配";
  const productSummary = (row: PublishRow) => {
    const label = productLabel(row);
    const assignedProduct = (assignedPlatforms[row.id] ?? [])
      .map((key) => productOptions.find((item) => item.id === selectedProducts[row.id]?.[key]))
      .find(Boolean);
    const imageUrl = assignedProduct?.imageUrl ?? null;
    return <span className="publish-product-cell"><ProductImage url={imageUrl} name={label}/><span>{label}</span></span>;
  };
  const openPublishingDetail = (
    rowId: string,
    preferredPlatform?: PlatformKey,
  ) => {
    setDetailId(rowId);
    setCopyPlatform(
      preferredPlatform ??
        (assignedPlatforms[rowId] ?? [configuredPlatforms[0]?.key ?? "dy"])[0],
    );
  };
  const updateCopy = (change: Partial<CopyDraft>) =>
    setCopyDrafts({ ...copyDrafts, [copyKey]: { ...currentCopy, ...change } });
  const importCopy = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateCopy({ body: String(reader.result ?? "") });
    reader.readAsText(file);
  };
  const saveDetails = async () => {
    if (!detail) return;
    if(detail.assignments.length&&detail.assignments.some(item=>item.handlerUserId!==publishingUserId)){notify(detail.assignments.some(item=>item.handlerUserId)?"该发布任务已由其他人员领取":"请先点击“开始发布”领取任务");return;}
    setSaving(true);
    try {
      const assignments = (assignedPlatforms[detail.id] ?? [])
        .map((key) => {
          const platform = platformOptions.find((item) => item.code === key);
          const copy = copyDrafts[`${detail.id}:${key}`] ?? {
            title: "",
            body: "",
            topics: "",
          };
          return {
            platformId: platform?.id,
            accountId: selectedAccounts[detail.id]?.[key] ?? null,
            productMasterId: selectedProducts[detail.id]?.[key] ?? null,
            copy: {
              title: copy.title,
              body: copy.body,
              topics: copy.topics.split(/\s+/).filter(Boolean),
            },
          };
        })
        .filter(
          (
            item,
          ): item is {
            platformId: number;
            accountId: number | null;
            productMasterId: number | null;
            copy: { title: string; body: string; topics: string[] };
          } => typeof item.platformId === "number",
        );
      const response = await fetch(
        `/api/publishing/${encodeURIComponent(detail.id)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ assignments, expectedAssignments: detail.assignments.map(item => ({id:item.id,rowVersion:item.rowVersion})) }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "发布详情保存失败");
      notify("发布详情已保存");
      await loadPublishing();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "发布详情保存失败");
    } finally {
      setSaving(false);
    }
  };
  const handlingAssignment=detail?.assignments.find(item=>item.platformCode===copyPlatform)??detail?.assignments[0];
  const changeHandling=async(action:"start"|"release")=>{if(!detail||!handlingAssignment||saving)return;setSaving(true);try{const response=await fetch(`/api/publishing/${encodeURIComponent(detail.id)}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action,assignmentId:handlingAssignment.id,expectedVersion:handlingAssignment.rowVersion})});const result=await response.json();if(!response.ok)throw new Error(result.error??"发布任务状态更新失败");notify(action==="start"?"已领取发布任务":"已释放发布任务");await loadPublishing();}catch(error){notify(error instanceof Error?error.message:"操作失败");}finally{setSaving(false);}};
  const renderLights = (rowId: string, showConfigure = false) => {
    const assigned = assignedPlatforms[rowId] ?? [];
    const lights = assigned.length ? (
      <div className="platform-lights">
        {configuredPlatforms
          .filter((platform) => assigned.includes(platform.key))
          .map((platform) => {
            const lit = (litPlatforms[rowId] ?? []).includes(platform.key);
            return (
              <button
                key={platform.key}
                className={`platform-light ${platform.key} ${lit ? "lit" : ""}`}
                aria-label={`${platform.name}：${lit ? "已发布" : "未发布"}`}
                aria-pressed={lit}
                onClick={() =>
                  requestToggle(rowId, platform.key, platform.name)
                }
                title={`${platform.name}：${lit ? "已发布" : "未发布"}`}
              >
                <span>
                  {platformIcons[platform.key] ? (
                    <img src={platformIcons[platform.key]} alt="" />
                  ) : (
                    platform.mark
                  )}
                </span>
              </button>
            );
          })}
      </div>
    ) : (
      <small>尚未选择目标平台</small>
    );
    return showConfigure ? (
      <div className="platform-list-control">
        {lights}
        <button
          className="platform-configure-link"
          onClick={() => openPublishingDetail(rowId)}
        >
          {assigned.length ? "编辑平台" : "＋ 选择发布平台"}
        </button>
      </div>
    ) : (
      lights
    );
  };
  const renderListLights = (rowId: string) => (
    <div className="platform-lights list-platform-lights">
      {configuredPlatforms.map((platform) => {
        const assigned = (assignedPlatforms[rowId] ?? []).includes(
          platform.key,
        );
        const lit = (litPlatforms[rowId] ?? []).includes(platform.key);
        return (
          <button
            key={platform.key}
            className={`platform-light ${platform.key} ${lit ? "lit" : ""}`}
            aria-label={`${platform.name}：${lit ? "已发布" : assigned ? "待发布" : "未选择"}，进入详情设置`}
            aria-pressed={lit}
            onClick={() => openPublishingDetail(rowId, platform.key)}
            title={`${platform.name}：${lit ? "已发布" : assigned ? "待发布" : "未选择"} · 点击进入详情`}
          >
            <span>
              {platformIcons[platform.key] ? (
                <img src={platformIcons[platform.key]} alt="" />
              ) : (
                platform.mark
              )}
            </span>
          </button>
        );
      })}
    </div>
  );

  if (detail)
    return (
      <>
        <ContentDetailPanel
          item={{
            id: detail.id,
            title: detail.content,
            kind: detail.kind,
            product: detail.product,
            account: accountSummary,
            owner: detail.owner,
            version: detail.version,
            status: isUnpublished(detail.id) ? "待发布" : "发布完成",
            visibility: "全部可见",
            remark: "审核通过后进入发布池",
            time: detail.time,
            detail: detail.detail,
          }}
          navigate={navigate}
          onBack={() => setDetailId("")}
          productControl={productSummary(detail)}
          extraFields={
            <>
              <section className="publish-detail-section">
                <div>
                  <h3>目标发布平台</h3>
                  <small>勾选平台后，为每个平台分别选择一个发布账号。</small>
                </div>
                <div className="platform-assignment">
                  {configuredPlatforms.map((platform) => (
                    <label key={platform.key}>
                      <input
                        type="checkbox"
                        checked={(assignedPlatforms[detail.id] ?? []).includes(
                          platform.key,
                        )}
                        onChange={(event) =>
                          changeAssignment(
                            detail.id,
                            platform.key,
                            event.target.checked,
                          )
                        }
                      />
                      <span>
                        {platformIcons[platform.key] ? (
                          <img src={platformIcons[platform.key]} alt="" />
                        ) : (
                          platform.mark
                        )}
                      </span>
                      {platform.name}
                    </label>
                  ))}
                </div>
                <div className="platform-account-groups">
                  {configuredPlatforms
                    .filter((platform) =>
                      (assignedPlatforms[detail.id] ?? []).includes(
                        platform.key,
                      ),
                    )
                    .map((platform) => {
                      const accounts = accountOptions.filter(
                        (account) => account.platformId === platform.id,
                      );
                      const products = productOptions.filter(
                        (product) => product.status === "active" || product.id === selectedProducts[detail.id]?.[platform.key],
                      );
                      return (
                        <div
                          className="platform-account-group"
                          key={platform.key}
                        >
                          <div>
                            <span className={`account-logo ${platform.key}`}>
                              {platformIcons[platform.key] ? (
                                <img src={platformIcons[platform.key]} alt="" />
                              ) : (
                                platform.mark
                              )}
                            </span>
                            <div>
                              <strong>{platform.name}账号</strong>
                              <small>同一内容在同一平台选择一个账号</small>
                            </div>
                          </div>
                          <label className="platform-product-select">
                            <span>{platform.name}关联商品（选填，可更换或取消）</span>
                            <select
                              value={
                                selectedProducts[detail.id]?.[platform.key] ??
                                ""
                              }
                              onChange={(event) =>
                                setSelectedProducts({
                                  ...selectedProducts,
                                  [detail.id]: {
                                    ...(selectedProducts[detail.id] ?? {}),
                                    [platform.key]: event.target.value
                                      ? Number(event.target.value)
                                      : undefined,
                                  },
                                })
                              }
                            >
                              <option value="">不关联商品</option>
                              {products.map((product) => (
                                <option key={product.id} value={product.id} disabled={product.status !== "active"}>
                                  {product.name}{product.status !== "active" ? "（已停用）" : ""}
                                </option>
                              ))}
                            </select>
                            {!products.length && (
                              <small>产品库暂无可用商品，不影响发布</small>
                            )}
                          </label>
                          <div>
                            {accounts.map((account) => (
                              <label
                                key={account.id}
                                className={
                                  selectedAccounts[detail.id]?.[
                                    platform.key
                                  ] === account.id
                                    ? "selected"
                                    : ""
                                }
                              >
                                <input
                                  type="radio"
                                  name={`${detail.id}-${platform.key}-account`}
                                  checked={
                                    selectedAccounts[detail.id]?.[
                                      platform.key
                                    ] === account.id
                                  }
                                  onChange={() =>
                                    setSelectedAccounts({
                                      ...selectedAccounts,
                                      [detail.id]: {
                                        ...(selectedAccounts[detail.id] ?? {}),
                                        [platform.key]: account.id,
                                      },
                                    })
                                  }
                                />
                                <span className="mini-avatar">
                                  {account.name[0]}
                                </span>
                                {account.name}
                              </label>
                            ))}
                            {!accounts.length && (
                              <small>
                                该平台暂无可用账号，请先到项目管理中创建。
                              </small>
                            )}
                            <button
                              className={
                                !selectedAccounts[detail.id]?.[platform.key]
                                  ? "selected"
                                  : ""
                              }
                              onClick={() =>
                                setSelectedAccounts({
                                  ...selectedAccounts,
                                  [detail.id]: {
                                    ...(selectedAccounts[detail.id] ?? {}),
                                    [platform.key]: undefined,
                                  },
                                })
                              }
                            >
                              暂不分配
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
                <div className="detail-platform-lights">
                  <strong>发布状态</strong>
                  {renderLights(detail.id)}
                </div>
              </section>
              <section className="publish-copy-section">
                <div className="publish-copy-head">
                  <div>
                    <h3>发布标题、文案与话题</h3>
                    <small>
                      每个平台单独保存；当前局域网版本以手工填写或导入为主。
                    </small>
                  </div>
                  <button disabled title="配置AI服务后启用">
                    AI生成（未配置）
                  </button>
                </div>
                <div className="copy-platform-tabs">
                  {configuredPlatforms
                    .filter((platform) =>
                      (assignedPlatforms[detail.id] ?? []).includes(
                        platform.key,
                      ),
                    )
                    .map((platform) => (
                      <button
                        key={platform.key}
                        className={
                          copyPlatform === platform.key ? "active" : ""
                        }
                        onClick={() => setCopyPlatform(platform.key)}
                      >
                        {platform.name}
                      </button>
                    ))}
                </div>
                {(assignedPlatforms[detail.id] ?? []).length ? (
                  <>
                    <label>
                      发布标题
                      <input
                        value={currentCopy.title}
                        onChange={(event) =>
                          updateCopy({ title: event.target.value })
                        }
                        placeholder="填写该平台的发布标题"
                      />
                    </label>
                    <label>
                      发布文案
                      <textarea
                        value={currentCopy.body}
                        onChange={(event) =>
                          updateCopy({ body: event.target.value })
                        }
                        placeholder="填写正文，或从TXT文件导入"
                      />
                    </label>
                    <label>
                      话题
                      <input
                        value={currentCopy.topics}
                        onChange={(event) =>
                          updateCopy({ topics: event.target.value })
                        }
                        placeholder="#通勤饰品 #项链搭配"
                      />
                    </label>
                    <label className="copy-import">
                      <input
                        type="file"
                        accept=".txt,text/plain"
                        onChange={(event) =>
                          importCopy(event.target.files?.[0])
                        }
                      />
                      导入文案 TXT
                    </label>
                  </>
                ) : (
                  <div className="empty-state">请先选择目标发布平台</div>
                )}
              </section>
            </>
          }
          footer={
            <div className="detail-page-actions">
              <span>
                {handlingAssignment?.handlerUserId===publishingUserId?"任务由你处理中；发布资料按平台分别保存。":handlingAssignment?.handlerUserId?"任务已由其他发布人员领取，你可以查看但不能修改。":"开始发布后任务才会锁定给你，单纯查看不会占用。"}
              </span>
              {handlingAssignment&&!handlingAssignment.handlerUserId?<button disabled={saving} onClick={()=>void changeHandling("start")}>开始发布</button>:null}
              {handlingAssignment?.handlerUserId===publishingUserId?<button disabled={saving} onClick={()=>void changeHandling("release")}>释放任务</button>:null}
              <button
                disabled={saving||Boolean(handlingAssignment&&handlingAssignment.handlerUserId!==publishingUserId)}
                className="primary-button"
                onClick={() => void saveDetails()}
              >
                {saving ? "保存中" : "保存发布资料"}
              </button>
            </div>
          }
        />
        {confirmToggle && (
          <div className="modal-backdrop">
            <div className="modal confirm-modal">
              <div className="confirm-icon">!</div>
              <h3>
                确认{confirmToggle.nextLit ? "点亮" : "关闭"}
                {confirmToggle.platformLabel}发布灯？
              </h3>
              <p>
                {confirmToggle.nextLit
                  ? "确认后表示该内容已在此平台完成发布。"
                  : "关闭后表示该平台当前未发布，请确认没有误操作。"}
              </p>
              <div className="confirm-actions publish-confirm-actions">
                <button
                  disabled={saving}
                  onClick={() => setConfirmToggle(null)}
                >
                  取消
                </button>
                <button
                  disabled={saving}
                  className="primary-button"
                  onClick={() => void applyToggle()}
                >
                  确认{confirmToggle.nextLit ? "点亮" : "关闭"}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );

  return (
    <>
      <ModuleHeader
        title="发布管理"
        description="审核通过内容按账号集中处理；列表展示全部启用平台，点击任一平台图标进入详情设置。"
      />
      <section className="panel account-quick-filter legacy-list-filter" aria-hidden="true">
        <div className="account-filter-head">
          <div>
            <strong>按账号快捷筛选</strong>
            <small>“未发布”显示未选择平台，或仍有目标平台未点亮的内容。</small>
          </div>
          <label>
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索内容或商品"
            />
          </label>
        </div>
        <div className="account-filter-tabs">
          {filters.map((filter) => (
            <button
              key={filter}
              className={activeFilter === filter ? "active" : ""}
              onClick={() => setActiveFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
      </section>
      <div className="platform-light-legend">
        <span>
          <i /> 未发布或未选择
        </span>
        <span>
          <i className="lit" /> 已发布
        </span>
        <small>
          始终按“平台与店铺”的顺序展示全部启用平台；点击图标进入详情操作。
        </small>
      </div>
      <section className="panel module-panel">
        <RuleFilterBar moduleKey="publishing" fields={publishingFields} rules={smartRules} onChange={setSmartRules} />
        <div className="publishing-batch-bar"><span>已选择 {selectedPublishIds.length} 条（当前筛选结果）</span><button className="primary-button" disabled={!selectedPublishIds.length||saving} onClick={()=>void downloadSelected()}>{saving?"正在生成…":"批量下载"}</button></div>
        <div className="table-wrap">
          <table className="module-table publish-light-table">
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="选择当前页全部发布内容" checked={visibleRows.length>0&&visibleRows.every(row=>selectedPublishIds.includes(row.id))} onChange={event=>setSelectedPublishIds(event.target.checked?[...new Set([...selectedPublishIds,...visibleRows.map(row=>row.id)])]:selectedPublishIds.filter(id=>!visibleRows.some(row=>row.id===id)))}/></th>
                <th>内容</th>
                <th>发布平台</th>
                <th>关联商品</th>
                <th>类型/版本</th>
                <th>进入发布池时间</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={row.id} style={{backgroundColor:employeeColor(row.uploaderUserId??row.owner,row.contentColor)}}>
                  <td><input type="checkbox" aria-label={`选择${row.content}`} checked={selectedPublishIds.includes(row.id)} onChange={event=>setSelectedPublishIds(event.target.checked?[...selectedPublishIds,row.id]:selectedPublishIds.filter(id=>id!==row.id))}/></td>
                  <td>
                    <div className={`thumb thumb-${(index % 4) + 1}`}>
                      <span>{row.kind === "视频" ? "▶" : "▤"}</span>
                    </div>
                    <div className="content-cell">
                      <button
                        className="content-detail-link"
                        onClick={() => openPublishingDetail(row.id)}
                      >
                        {row.content}
                      </button>
                      <small>{row.id} · 点击名称查看详情</small>
                    </div>
                  </td>
                  <td>{renderListLights(row.id)}</td>
                  <td>{productSummary(row)}</td>
                  <td>
                    {row.kind} · {row.version}
                  </td>
                  <td>{row.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !visibleRows.length && (
            <div className="empty-state">{publishingEmptyMessage||"当前筛选范围内没有审核通过的内容"}</div>
          )}
        </div>
      </section>
      {confirmToggle && (
        <div className="modal-backdrop">
          <div className="modal confirm-modal">
            <div className="confirm-icon">!</div>
            <h3>
              确认{confirmToggle.nextLit ? "点亮" : "关闭"}
              {confirmToggle.platformLabel}发布灯？
            </h3>
            <p>
              {confirmToggle.nextLit
                ? "确认后表示该内容已在此平台完成发布。"
                : "关闭后表示该平台当前未发布，请确认没有误操作。"}
            </p>
            <div className="confirm-actions publish-confirm-actions">
              <button disabled={saving} onClick={() => setConfirmToggle(null)}>
                取消
              </button>
              <button
                disabled={saving}
                className="primary-button"
                onClick={() => void applyToggle()}
              >
                确认{confirmToggle.nextLit ? "点亮" : "关闭"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function VersionCenter({
  notify,
  navigate,
  initialTarget,
  groups,
  setGroups,
}: Pick<Props, "notify" | "navigate"> & {
  initialTarget: string;
  groups: VersionGroup[];
  setGroups: React.Dispatch<React.SetStateAction<VersionGroup[]>>;
}) {
  const [detailId, setDetailId] = useState(initialTarget);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("全部类型");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteRequest, setDeleteRequest] = useState<{
    mode: "batch" | "single";
    groupId?: string;
    version?: string;
  } | null>(null);
  useEffect(() => setDetailId(initialTarget), [initialTarget]);
  const detail = groups.find((group) => group.id === detailId);
  const filtered = groups.filter(
    (group) =>
      (kind === "全部类型" || group.kind === kind) &&
      (!query.trim() ||
        `${group.title}${group.id}${group.product}`.includes(query.trim())),
  );
  const selectedHistoricalCount = groups
    .filter((group) => selectedIds.includes(group.id))
    .reduce(
      (sum, group) =>
        sum + group.versions.filter((item) => !item.current).length,
      0,
    );
  const confirmDelete = () => {
    if (!deleteRequest) return;
    if (deleteRequest.mode === "batch") {
      setGroups(
        groups.map((group) =>
          selectedIds.includes(group.id)
            ? {
                ...group,
                versions: group.versions.filter((item) => item.current),
              }
            : group,
        ),
      );
      notify(
        `已删除 ${selectedHistoricalCount} 个历史版本；所有最新版本均已保留`,
      );
      setSelectedIds([]);
    } else if (deleteRequest.groupId && deleteRequest.version) {
      setGroups(
        groups.map((group) =>
          group.id === deleteRequest.groupId
            ? {
                ...group,
                versions: group.versions.filter(
                  (item) => item.current || item.v !== deleteRequest.version,
                ),
              }
            : group,
        ),
      );
      notify(`历史版本 ${deleteRequest.version} 已删除，操作日志已保留`);
    }
    setDeleteRequest(null);
  };
  if (detail)
    return (
      <>
        <ContentDetailPanel
          item={{
            id: detail.id,
            title: detail.title,
            kind: detail.kind,
            product: detail.product,
            account: "未分配",
            owner: detail.owner,
            version: detail.current,
            status: "最新版本",
            visibility: "按内容权限",
            remark: `共 ${detail.versions.length} 个文件版本`,
            time: detail.time,
            detail: detail.detail,
          }}
          navigate={navigate}
          showHistory={false}
          onBack={() => navigate("版本管理")}
          footer={
            <section className="version-detail-history">
              <div className="version-detail-head">
                <div>
                  <h3>文件版本记录</h3>
                  <p>
                    这里只能查看或删除历史版本；最新版本不可删除，上传新版本请回到内容池。
                  </p>
                </div>
              </div>
              <div>
                {detail.versions.map((item, index) => (
                  <div
                    className={`version-row ${item.current ? "current" : ""}`}
                    key={item.v}
                  >
                    <div className="version-node">
                      <span>{item.v}</span>
                      {index < detail.versions.length - 1 && <i />}
                    </div>
                    <div className="version-file">
                      <strong>{item.file}</strong>
                      <small>
                        {item.size} · {item.owner} · {item.time}
                      </small>
                    </div>
                    <button
                      className="version-preview"
                      onClick={() => notify(`正在预览 ${item.file}`)}
                    >
                      预览
                    </button>
                    <button
                      className="version-download"
                      onClick={() => notify(`正在下载 ${item.file}`)}
                    >
                      下载
                    </button>
                    {item.current ? (
                      <Badge tone="blue">最新版本</Badge>
                    ) : (
                      <>
                        <Badge tone="slate">历史版本</Badge>
                        <button
                          className="delete-old"
                          onClick={() =>
                            setDeleteRequest({
                              mode: "single",
                              groupId: detail.id,
                              version: item.v,
                            })
                          }
                        >
                          删除历史版本
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>
          }
        />
        {deleteRequest && (
          <div className="modal-backdrop confirm-layer">
            <div className="modal confirm-modal">
              <div className="confirm-icon">!</div>
              <h3>确认删除 {deleteRequest.version}？</h3>
              <p>
                该历史文件将被删除，操作日志继续保留。最新版本 {detail.current}{" "}
                不受影响。
              </p>
              <div className="confirm-actions">
                <button onClick={() => setDeleteRequest(null)}>取消</button>
                <button className="danger-confirm" onClick={confirmDelete}>
                  确认删除
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  return (
    <>
      <ModuleHeader
        title="版本管理"
        description="一条内容一行；点击进入详情后管理该内容的全部文件版本。"
      />
      <section className="panel module-panel">
        <div className="version-list-toolbar">
          <label>
            <span>⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索内容名称、编号或商品"
            />
          </label>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option>全部类型</option>
            <option>视频</option>
            <option>图文</option>
          </select>
          <div>
            <span>
              已选 {selectedIds.length} 条 · 可删除 {selectedHistoricalCount}{" "}
              个历史版本
            </span>
            <button
              className="danger"
              disabled={!selectedHistoricalCount}
              onClick={() => setDeleteRequest({ mode: "batch" })}
            >
              删除历史版本
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="module-table version-management-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="选择全部版本内容"
                    checked={
                      filtered.length > 0 &&
                      filtered.every((group) => selectedIds.includes(group.id))
                    }
                    onChange={(e) =>
                      setSelectedIds(
                        e.target.checked
                          ? filtered.map((group) => group.id)
                          : [],
                      )
                    }
                  />
                </th>
                <th>内容</th>
                <th>当前版本</th>
                <th>版本总数</th>
                <th>内容类型</th>
                <th>关联商品</th>
                <th>最后上传人</th>
                <th>最后更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((group, index) => {
                const historyCount = group.versions.filter(
                  (item) => !item.current,
                ).length;
                return (
                  <tr key={group.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`选择${group.title}`}
                        checked={selectedIds.includes(group.id)}
                        onChange={(e) =>
                          setSelectedIds(
                            e.target.checked
                              ? [...selectedIds, group.id]
                              : selectedIds.filter((id) => id !== group.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <div className="version-content-cell">
                        <div className={`thumb thumb-${(index % 4) + 1}`}>
                          <span>{group.kind === "视频" ? "▶" : "▤"}</span>
                        </div>
                        <div className="content-cell">
                          <button
                            className="content-detail-link"
                            onClick={() => setDetailId(group.id)}
                          >
                            {group.title}
                          </button>
                          <small>{group.id}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge tone="blue">{group.current}</Badge>
                    </td>
                    <td>
                      {group.versions.length} 个版本 · {historyCount} 个历史版本
                    </td>
                    <td>{group.kind}</td>
                    <td>{group.product}</td>
                    <td>
                      <span className="mini-avatar">{group.owner[0]}</span>
                      {group.owner}
                    </td>
                    <td>{group.time}</td>
                    <td>
                      <div className="version-row-actions">
                        <button onClick={() => setDetailId(group.id)}>
                          查看版本
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="empty-state">没有符合条件的内容</div>
        )}
      </section>
      {deleteRequest && (
        <div className="modal-backdrop confirm-layer">
          <div className="modal confirm-modal">
            <div className="confirm-icon">!</div>
            <h3>确认批量删除历史版本？</h3>
            <p>
              将删除已勾选内容的全部 {selectedHistoricalCount}{" "}
              个历史版本，最新版本始终保留。
            </p>
            <div className="confirm-actions">
              <button onClick={() => setDeleteRequest(null)}>取消</button>
              <button className="danger-confirm" onClick={confirmDelete}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

type LiveVersionData = {
  canDeleteHistory?:boolean;
  contents: Array<{
    id: number;
    code: string;
    title: string;
    contentType: string;
    productName: string | null;
    latestVersionNumber: number;
    uploaderUserId?:number;
    contentColor?:string|null;
    uploaderName: string;
    updatedAt: string;
    versions: Array<{
      id: number;
      versionNumber: number;
      fileName: string;
      fileSize: number;
      mimeType: string;
      uploadStatus: string;
      reviewStatus:string;
      reviewSubmittedAt:string|null;
      supersededAt:string|null;
      sourcePurgedAt:string|null;
      uploaderName: string;
      createdAt: string;
      current: boolean;
      fileUrl: string | null;
      files: Array<{
        id: number;
        position: number;
        fileName: string;
        fileSize: number;
        mimeType: string;
        uploadStatus: string;
        fileUrl: string | null;
      }>;
    }>;
  }>;
};
const versionReviewLabels:Record<string,string>={draft:"草稿",pending:"待审核",reviewing:"审核中",approved:"已通过",rejected:"已驳回"};
function VersionCenterLive({
  notify,
  navigate,
  initialTarget,
}: {
  notify: (message: string, tone?: "success" | "error") => void;
  navigate: (name: string, targetId?: string) => void;
  initialTarget: string;
}) {
  const [data, setData] = useState<LiveVersionData>({ contents: [] });
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("全部类型");
  const [smartRules, setSmartRules] = useState<SmartFilterRule[]>([]);
  const [detailCode, setDetailCode] = useState(initialTarget);
  const [selected, setSelected] = useState<string[]>([]);
  const [deleteRequest, setDeleteRequest] = useState<{
    versionIds?: number[];
    contentCodes?: string[];
    label: string;
  } | null>(null);
  const load = async () => {
    const response = await fetch("/api/versions", { cache: "no-store" });
    if (!response.ok) return;
    setData((await response.json()) as LiveVersionData);
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => setDetailCode(initialTarget), [initialTarget]);
  const versionProductOptions = useMemo(
    () => [...new Set(data.contents.map((item) => item.productName).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)),
    [data.contents],
  );
  const versionFields = useMemo<SmartFilterField<LiveVersionData["contents"][number]>[]>(() => [
    { key: "query", label: "关键词", type: "text", getValue: (item) => [item.title, item.code, item.productName] },
    { key: "contentType", label: "内容类型", type: "select", options: [{value:"video",label:"视频"},{value:"image_text",label:"图文"}], getValue: (item) => item.contentType },
    { key: "owner", label: "上传员工", type: "select", options: [...new Set(data.contents.map((item) => item.uploaderName))].map((value) => ({value,label:value})), getValue: (item) => item.uploaderName },
    { key: "product", label: "关联商品", type: "select", options: versionProductOptions.map((value) => ({ value, label: value })), getValue: (item) => item.productName ?? "未分配" },
    { key: "latestVersion", label: "最新版本", type: "number", getValue: (item) => item.latestVersionNumber },
    { key: "versionCount", label: "版本数量", type: "number", getValue: (item) => item.versions.length },
    { key: "historicalCount", label: "历史版本数量", type: "number", getValue: (item) => item.versions.filter((version) => !version.current).length },
    { key: "updatedAt", label: "更新时间", type: "date", getValue: (item) => item.updatedAt },
  ], [data.contents, versionProductOptions]);
  const visible = useMemo(() => applySmartFilters(data.contents, smartRules, versionFields), [data.contents, smartRules, versionFields]);
  const detail = data.contents.find((item) => item.code === detailCode);
  const historicalCount = (item: LiveVersionData["contents"][number]) =>
    item.versions.filter((version) => !version.current&&!version.sourcePurgedAt).length;
  const selectedCount = data.contents
    .filter((item) => selected.includes(item.code))
    .reduce((sum, item) => sum + historicalCount(item), 0);
  const remove = async () => {
    if (!deleteRequest) return;
    const response = await fetch("/api/versions", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(deleteRequest),
    });
    const result = (await response.json()) as {
      error?: string;
      purgedCount?: number;
    };
    if (!response.ok) {
      notify(result.error ?? "删除失败");
      return;
    }
    await load();
    setSelected([]);
    setDeleteRequest(null);
    notify(`已清理 ${result.purgedCount ?? 0} 个历史源文件，版本记录和审核记录均已保留`);
  };
  const size = (value: number) =>
    `${(value / 1024 / 1024).toFixed(value > 10 * 1024 * 1024 ? 1 : 2)} MB`;
  if (detail)
    return (
      <>
        <div className="drilldown-header">
          <button onClick={() => setDetailCode("")}>←</button>
          <div>
            <small>版本管理 / 内容详情</small>
            <h2>{detail.title}</h2>
            <p>
              {detail.code} · 当前 V{detail.latestVersionNumber} ·{" "}
              {detail.productName ?? "未分配商品"}
            </p>
          </div>
        </div>
        <section className="panel version-detail-history">
          <div className="version-detail-head">
            <div>
              <h3>文件版本记录</h3>
              <p>
                每个版本独立审核；这里只清理历史源文件，版本、审核意见和关联记录永久保留。
              </p>
            </div>
          </div>
          <div>
            {detail.versions.map((version, index) => (
              <div
                className={`version-row ${version.current ? "current" : ""}`}
                key={version.id}
                style={{backgroundColor:employeeColor(detail.uploaderUserId??detail.uploaderName,detail.contentColor)}}
              >
                <div className="version-node">
                  <span>V{version.versionNumber}</span>
                  {index < detail.versions.length - 1 && <i />}
                </div>
                <div className="version-file">
                  <strong>{version.fileName}</strong>
                  <small>
                    {size(version.fileSize)} · {version.uploaderName} ·{" "}
                    {new Date(
                      version.createdAt.replace(" ", "T") + "Z",
                    ).toLocaleString("zh-CN")}
                  </small>
                  <small>流程状态：{versionReviewLabels[version.reviewStatus]??version.reviewStatus}{version.sourcePurgedAt?" · 源文件已清理":version.supersededAt?" · 已被后续版本替代":""}</small>
                  {version.files.length > 0 && (
                    <small>
                      {version.files.length} 张图片：
                      {version.files.map((file) => file.fileName).join("、")}
                    </small>
                  )}
                </div>
                {version.fileUrl && (
                  <a
                    className="version-preview"
                    href={version.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    预览
                  </a>
                )}
                {version.fileUrl && (
                  <a
                    className="version-download"
                    href={version.fileUrl}
                    download
                  >
                    下载
                  </a>
                )}
                {version.files.map((file) => (
                  <a
                    className="version-preview"
                    key={file.id}
                    href={file.fileUrl ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                  >
                    图片{file.position}
                  </a>
                ))}
                {version.current ? (
                  <Badge tone="blue">最新版本</Badge>
                ) : (
                  <>
                    <Badge tone="slate">历史版本</Badge>
                    <button
                      hidden={!data.canDeleteHistory}
                      disabled={Boolean(version.sourcePurgedAt)}
                      className="delete-old"
                      onClick={() =>
                        setDeleteRequest({
                          versionIds: [version.id],
                          label: `V${version.versionNumber}`,
                        })
                      }
                    >
                        {version.sourcePurgedAt?"源文件已清理":"清理历史源文件"}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
        {deleteRequest && (
          <div className="modal-backdrop confirm-layer">
            <div className="modal confirm-modal">
              <div className="confirm-icon">!</div>
              <h3>确认清理 {deleteRequest.label} 的源文件？</h3>
              <p>
                文件将从存储中清理，但版本信息、审核意见与操作日志继续保留；推荐或发布使用中的版本不会被清理。
              </p>
              <div className="confirm-actions">
                <button onClick={() => setDeleteRequest(null)}>取消</button>
                <button
                  className="danger-confirm"
                  onClick={() => void remove()}
                >
                  确认清理
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  return (
    <>
      <ModuleHeader
        title="版本管理"
        description="一条业务内容一行，默认进入最新版本；详情内查看完整版本链和各版本审核状态。"
      />
      <section className="panel module-panel">
        <RuleFilterBar moduleKey="versions" fields={versionFields} rules={smartRules} onChange={setSmartRules} />
        <div className="version-list-toolbar">
          <label className="legacy-list-filter" aria-hidden="true">
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索内容名称、编号或商品"
            />
          </label>
          <select className="legacy-list-filter" aria-hidden="true"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option>全部类型</option>
            <option>视频</option>
            <option>图文</option>
          </select>
          <div>
            <span>
              已选 {selected.length} 条 · 可清理 {selectedCount} 个历史源文件
            </span>
            <button
              hidden={!data.canDeleteHistory}
              className="danger"
              disabled={!selectedCount}
              onClick={() =>
                setDeleteRequest({
                  contentCodes: selected,
                  label: `所选内容的 ${selectedCount} 个历史版本`,
                })
              }
            >
              清理历史源文件
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="module-table version-management-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={
                      visible.length > 0 &&
                      visible.every((item) => selected.includes(item.code))
                    }
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? visible.map((item) => item.code)
                          : [],
                      )
                    }
                  />
                </th>
                <th>内容</th>
                <th>当前版本</th>
                <th>版本总数</th>
                <th>类型</th>
                <th>关联商品</th>
                <th>最后上传人</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item, index) => (
                <tr key={item.code} style={{backgroundColor:employeeColor(item.uploaderUserId??item.uploaderName,item.contentColor)}}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.includes(item.code)}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? [...selected, item.code]
                            : selected.filter((code) => code !== item.code),
                        )
                      }
                    />
                  </td>
                  <td>
                    <div className="version-content-cell">
                      <div className={`thumb thumb-${(index % 4) + 1}`}>
                        <span>{item.contentType === "video" ? "▶" : "▤"}</span>
                      </div>
                      <div className="content-cell">
                        <button
                          className="content-detail-link"
                          onClick={() => setDetailCode(item.code)}
                        >
                          {item.title}
                        </button>
                        <small>{item.code}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge tone="blue">V{item.latestVersionNumber}</Badge>
                  </td>
                  <td>
                    {item.versions.length} 个版本 · {historicalCount(item)}{" "}
                    个历史版本
                  </td>
                  <td>{item.contentType === "video" ? "视频" : "图文"}</td>
                  <td>{item.productName ?? "未分配"}</td>
                  <td>{item.uploaderName}</td>
                  <td>
                    {new Date(
                      item.updatedAt.replace(" ", "T") + "Z",
                    ).toLocaleString("zh-CN")}
                  </td>
                  <td>
                    <button onClick={() => setDetailCode(item.code)}>
                      查看版本
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <div className="empty-state">没有符合条件的内容</div>
        )}
      </section>
      {deleteRequest && (
        <div className="modal-backdrop confirm-layer">
          <div className="modal confirm-modal">
            <div className="confirm-icon">!</div>
            <h3>确认删除{deleteRequest.label}？</h3>
            <p>所有最新版本始终保留；删除动作会写入操作日志。</p>
            <div className="confirm-actions">
              <button onClick={() => setDeleteRequest(null)}>取消</button>
              <button className="danger-confirm" onClick={() => void remove()}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

type ManagementContent = {
  uploaderUserId?:number;
  contentColor?:string|null;
  id: string;
  title: string;
  kind: string;
  productCode: string;
  product: string;
  productType: string;
  productStatus: string;
  account: string;
  platform: string;
  shop: string;
  version: string;
  publishStatus: "published" | "pending";
  time: string;
};
type ProductDrill = {
  label: string;
  productCode?: string;
  account?: string;
  platform?: string;
  shop?: string;
  productType?: string;
  productStatus?: string;
};

function DrilldownContentList({
  title,
  note,
  rows,
  onBack,
  notify,
  initialProductCode,
}: {
  title: string;
  note: string;
  rows: ManagementContent[];
  onBack: () => void;
  notify: (message: string, tone?: "success" | "error") => void;
  initialProductCode?: string;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("全部类型");
  const [productCode, setProductCode] = useState(
    initialProductCode ?? "全部商品",
  );
  const [smartRules, setSmartRules] = useState<SmartFilterRule[]>(() => initialProductCode ? [{ id: ruleId(), join: "and", field: "productCode", operator: "eq", value: initialProductCode }] : []);
  const productOptions = useMemo(
    () =>
      Array.from(
        new Map(rows.map((item) => [item.productCode, item.product])).entries(),
      ),
    [rows],
  );
  const drilldownFields = useMemo<SmartFilterField<ManagementContent>[]>(() => [
    { key: "query", label: "内容/编号", type: "text", getValue: (item) => [item.title, item.id] },
    { key: "product", label: "关联商品", type: "select", options: [...new Set(rows.map((item) => item.product))].map((value) => ({ value, label: value })), getValue: (item) => item.product },
    { key: "productCode", label: "商品编号", type: "select", options: productOptions.map(([value, name]) => ({ value, label: `${name} · ${value}` })), getValue: (item) => item.productCode },
    { key: "account", label: "项目", type: "select", options: [...new Set(rows.map((item) => item.account))].map((value) => ({ value, label: value })), getValue: (item) => item.account },
    { key: "platform", label: "平台", type: "select", options: [...new Set(rows.map((item) => item.platform))].map((value) => ({ value, label: value })), getValue: (item) => item.platform },
    { key: "shop", label: "店铺", type: "select", options: [...new Set(rows.map((item) => item.shop))].map((value) => ({ value, label: value })), getValue: (item) => item.shop },
    { key: "contentType", label: "内容类型", type: "select", options: ["视频", "图文"].map((value) => ({ value, label: value })), getValue: (item) => item.kind },
    { key: "version", label: "版本", type: "text", getValue: (item) => item.version },
    { key: "publishStatus", label: "发布状态", type: "select", options: [{ value: "published", label: "已发布" }, { value: "pending", label: "待发布" }], getValue: (item) => item.publishStatus },
    { key: "time", label: "发布时间", type: "date", getValue: (item) => item.time },
  ], [rows, productOptions]);
  const visibleRows = useMemo(() => applySmartFilters(rows, smartRules, drilldownFields), [rows, smartRules, drilldownFields]);
  return (
    <>
      <div className="drilldown-header">
        <button onClick={onBack}>←</button>
        <div>
          <small>当前筛选条件</small>
          <h2>{title}</h2>
          <p>{note}</p>
        </div>
      </div>
      <section className="panel module-panel">
        <div className="module-toolbar legacy-list-filter" aria-hidden="true">
          <label>
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="在当前已发布内容中搜索"
            />
          </label>
          <div>
            <select
              value={productCode}
              onChange={(event) => setProductCode(event.target.value)}
              aria-label="按关联商品筛选"
            >
              <option>全部商品</option>
              {productOptions.map(([code, name]) => (
                <option key={code} value={code}>
                  {name} · {code}
                </option>
              ))}
            </select>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              aria-label="按内容类型筛选"
            >
              <option>全部类型</option>
              <option>视频</option>
              <option>图文</option>
            </select>
          </div>
        </div>
        <RuleFilterBar moduleKey="published_contents" fields={drilldownFields} rules={smartRules} onChange={setSmartRules} />
        <div className="drilldown-summary">
          <span>
            仅展示已完成发布的内容；从商品快捷入口进入时会自动带入商品条件
          </span>
          <strong>当前显示 {visibleRows.length} 条记录</strong>
        </div>
        <div className="table-wrap">
          <table className="module-table drilldown-content-table">
            <thead>
              <tr>
                <th>内容</th>
                <th>关联商品</th>
                <th>项目</th>
                <th>平台 / 店铺</th>
                <th>类型 / 版本</th>
                <th>发布时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((item, index) => (
                <tr key={item.id} style={{backgroundColor:employeeColor(item.uploaderUserId??item.id,item.contentColor)}}>
                  <td>
                    <div className="drilldown-content-cell">
                      <div className={`thumb thumb-${(index % 4) + 1}`}>
                        <span>{item.kind === "视频" ? "▶" : "▤"}</span>
                      </div>
                      <div className="content-cell">
                        <strong>{item.title}</strong>
                        <small>{item.id}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <strong>{item.product}</strong>
                    <small className="cell-subline">{item.productCode}</small>
                  </td>
                  <td>
                    <span className="mini-avatar">{item.account[0]}</span>
                    {item.account}
                  </td>
                  <td>
                    {item.platform}
                    <small className="cell-subline">{item.shop}</small>
                  </td>
                  <td>
                    {item.kind} · {item.version}
                  </td>
                  <td>{item.time}</td>
                  <td>
                    <button
                      className="table-action"
                      onClick={() =>
                        notify(`正在查看「${item.title}」内容详情`)
                      }
                    >
                      查看详情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visibleRows.length === 0 && (
          <div className="empty-state">当前筛选条件下暂无已发布内容</div>
        )}
      </section>
    </>
  );
}

function BusinessCreateModal({
  kind,
  data,
  initial,
  onClose,
  onSaved,
  notify,
}: {
  kind: "product" | "account";
  data: BusinessData;
  initial?: BusinessData["products"][number] | BusinessData["accounts"][number];
  onClose: () => void;
  onSaved: () => Promise<void>;
  notify: (message: string, tone?: "success" | "error") => void;
}) {
  const isProduct = kind === "product";
  const productInitial = initial && "storeId" in initial ? initial : undefined;
  const accountInitial =
    initial && "platformHandle" in initial ? initial : undefined;
  const [draft, setDraft] = useState({
    name: initial?.name ?? "",
    code: initial?.code ?? "",
    platformCode:
      initial?.platformCode ??
      data.platforms.find((item) => item.status === "active")?.code ??
      "",
    storeId: productInitial ? String(productInitial.storeId) : "",
    productType: productInitial?.productType ?? "",
    platformHandle: accountInitial?.platformHandle ?? "",
    status: initial?.status ?? "active",
  });
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>(
    accountInitial
      ? data.bindings
          .filter((item) => item.accountId === accountInitial.id)
          .map((item) => item.productId)
      : [],
  );
  const [saving, setSaving] = useState(false);
  const availableStores = data.stores.filter(
    (store) =>
      store.platformCode === draft.platformCode &&
      (store.status === "active" || store.id === productInitial?.storeId),
  );
  const availableProducts = data.products.filter(
    (product) => product.platformCode === draft.platformCode,
  );
  const save = async () => {
    if (!draft.name.trim() || !draft.code.trim() || !draft.platformCode) {
      notify("请填写名称、编号并选择平台");
      return;
    }
    if (isProduct && !draft.storeId) {
      notify("商品必须选择所属店铺");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/business-data", {
        method: initial ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity: kind,
          id: initial?.id,
          name: draft.name,
          code: draft.code,
          platformCode: draft.platformCode,
          storeId: Number(draft.storeId),
          productType: draft.productType,
          platformHandle: draft.platformHandle,
          status: draft.status,
        }),
      });
      const result = (await response.json()) as { error?: string; id?: number };
      if (!response.ok) throw new Error(result.error ?? "保存失败");
      const savedId = initial?.id ?? result.id;
      if (kind === "account" && savedId) {
        const bindingResponse = await fetch("/api/business-data", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            entity: "accountProducts",
            accountId: savedId,
            productIds: selectedProductIds,
          }),
        });
        const bindingResult = (await bindingResponse.json()) as {
          error?: string;
        };
        if (!bindingResponse.ok)
          throw new Error(bindingResult.error ?? "账号商品绑定失败");
      }
      await onSaved();
      notify(
        initial
          ? "业务资料已更新"
          : isProduct
            ? "商品已保存，可在发布管理中关联"
            : "项目及商品绑定已保存",
      );
      onClose();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="settings-drawer-backdrop">
      <aside
        className="settings-drawer"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer-head">
          <div>
            <small>业务资料</small>
            <h3>
              {initial ? "编辑" : isProduct ? "新建商品" : "新建项目"}
            </h3>
          </div>
          <small className="drawer-exit-hint">请使用底部“取消”或“保存”</small>
        </div>
        <div className="settings-form">
          <label>
            <span>所属平台 *</span>
            <select
              value={draft.platformCode}
              onChange={(event) => {
                const platformCode = event.target.value;
                setDraft({ ...draft, platformCode, storeId: "" });
                setSelectedProductIds(
                  data.products
                    .filter(
                      (item) =>
                        item.platformCode === platformCode &&
                        selectedProductIds.includes(item.id),
                    )
                    .map((item) => item.id),
                );
              }}
            >
              {data.platforms
                .filter(
                  (item) =>
                    item.status === "active" ||
                    item.code === draft.platformCode,
                )
                .map((item) => (
                  <option value={item.code} key={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
          {isProduct && (
            <label>
              <span>所属店铺 *</span>
              <select
                value={draft.storeId}
                onChange={(event) =>
                  setDraft({ ...draft, storeId: event.target.value })
                }
              >
                <option value="">请选择店铺</option>
                {availableStores.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name} · {item.code}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span>{isProduct ? "商品名称" : "账号名称"} *</span>
            <input
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </label>
          <label>
            <span>{isProduct ? "商品编号" : "账号编号"} *</span>
            <input
              value={draft.code}
              onChange={(event) =>
                setDraft({ ...draft, code: event.target.value })
              }
            />
          </label>
          {isProduct ? (
            <label>
              <span>商品类型</span>
              <input
                value={draft.productType}
                onChange={(event) =>
                  setDraft({ ...draft, productType: event.target.value })
                }
              />
            </label>
          ) : (
            <>
              <label>
                <span>平台账号标识</span>
                <input
                  value={draft.platformHandle}
                  onChange={(event) =>
                    setDraft({ ...draft, platformHandle: event.target.value })
                  }
                />
              </label>
              <div className="settings-impact">
                <strong>绑定同平台商品</strong>
                <p>
                  {availableProducts.length
                    ? "勾选后，商品管理与账号管理会同步显示绑定关系。"
                    : "当前平台还没有商品，可先保存账号后再编辑绑定。"}
                </p>
                {availableProducts.map((product) => (
                  <label key={product.id}>
                    <input
                      type="checkbox"
                      checked={selectedProductIds.includes(product.id)}
                      onChange={(event) =>
                        setSelectedProductIds(
                          event.target.checked
                            ? [...selectedProductIds, product.id]
                            : selectedProductIds.filter(
                                (id) => id !== product.id,
                              ),
                        )
                      }
                    />
                    <span>
                      {product.name} · {product.code}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
          <label>
            <span>启用状态</span>
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft({ ...draft, status: event.target.value })
              }
            >
              <option value="active">启用</option>
              <option value="inactive">停用</option>
            </select>
          </label>
        </div>
        <div className="drawer-actions">
          <button onClick={onClose}>取消</button>
          <button
            className="primary-button"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "保存中" : "保存"}
          </button>
        </div>
      </aside>
    </div>
  );
}

const toManagementContents = (data: BusinessData): ManagementContent[] =>
  data.publishedContents.map((item) => ({
    uploaderUserId:item.uploaderUserId,contentColor:item.contentColor,
    id: item.id,
    title: item.title,
    kind: item.kind === "image_text" ? "图文" : "视频",
    productCode: item.productCode ?? "未分配",
    product: item.product ?? "未分配",
    productType: item.productType ?? "未分类",
    productStatus: item.productStatus === "active" ? "启用" : "停用",
    account: item.account ?? "未分配",
    platform: item.platform,
    shop: item.shop ?? "未分配",
    version: `V${item.version}`,
    publishStatus: "published",
    time: item.publishedAt ?? "已发布",
  }));

function ProductManagement({
  notify,
  data,
  reload,
}: Pick<Props, "notify"> & {
  data: BusinessData;
  reload: () => Promise<void>;
}) {
  const liveContents = toManagementContents(data);
  const products = data.products.map((item) => {
    const accountIds = data.bindings
      .filter((binding) => binding.productId === item.id)
      .map((binding) => binding.accountId);
    return {
      ...item,
      type: item.productType ?? "未分类",
      accounts: accountIds.length,
      contents: data.publishedContents.filter(
        (content) => content.productId === item.id,
      ).length,
      statusLabel: item.status === "active" ? "启用" : "停用",
      boundAccounts: data.accounts.filter((account) =>
        accountIds.includes(account.id),
      ),
    };
  });
  const [editor, setEditor] = useState<
    BusinessData["products"][number] | "new" | null
  >(null);
  const [smartRules, setSmartRules] = useState<SmartFilterRule[]>([]);
  const productFields = useMemo<SmartFilterField<(typeof products)[number]>[]>(() => [
    { key: "query", label: "关键词", type: "text", getValue: (item) => [item.name, item.code] },
    { key: "platform", label: "所属平台", type: "select", options: [...new Set(products.map((item) => item.platformName))].map((value) => ({value,label:value})), getValue: (item) => item.platformName },
    { key: "store", label: "所属店铺", type: "select", options: [...new Set(products.map((item) => item.storeName))].map((value) => ({value,label:value})), getValue: (item) => item.storeName },
    { key: "productType", label: "商品类型", type: "select", options: [...new Set(products.map((item) => item.type))].map((value) => ({value,label:value})), getValue: (item) => item.type },
    { key: "owner", label: "负责人", type: "text", getValue: (item) => item.ownerName },
    { key: "accounts", label: "已挂账号数", type: "number", getValue: (item) => item.accounts },
    { key: "contents", label: "已发布内容数", type: "number", getValue: (item) => item.contents },
    { key: "status", label: "状态", type: "select", options: ["启用", "停用"].map((value) => ({value,label:value})), getValue: (item) => item.statusLabel },
  ], [products]);
  const visibleProducts = useMemo(() => applySmartFilters(products, smartRules, productFields), [products, smartRules, productFields]);
  const [drill, setDrill] = useState<ProductDrill | null>(null);
  const openDrill = (next: ProductDrill) => setDrill(next);
  const rows = drill
    ? liveContents.filter(
        (item) =>
          (!drill.productCode || item.productCode === drill.productCode) &&
          (!drill.account || item.account === drill.account) &&
          (!drill.platform || item.platform === drill.platform) &&
          (!drill.shop || item.shop === drill.shop) &&
          (!drill.productType || item.productType === drill.productType) &&
          (!drill.productStatus || item.productStatus === drill.productStatus),
      )
    : [];
  if (drill)
    return (
      <DrilldownContentList
        title={drill.label}
        note="由商品管理字段进入，返回后保留原商品列表。"
        rows={rows}
        onBack={() => setDrill(null)}
        notify={notify}
      />
    );
  return (
    <>
      <ModuleHeader
        title="商品管理"
        description="业务资料只统计已完成发布的内容；商品、平台、店铺、类型和账号都可以作为进一步筛选入口。"
        action="新建商品"
        onAction={() => setEditor("new")}
      />
      <section className="panel module-panel">
        <div className="legacy-list-filter" aria-hidden="true"><Toolbar placeholder="搜索商品名称或编号">
          <select>
            <option>全部平台</option>
            {data.platforms.map((item) => (
              <option key={item.id}>{item.name}</option>
            ))}
          </select>
          <select>
            <option>全部店铺</option>
            {data.stores.map((item) => (
              <option key={item.id}>{item.name}</option>
            ))}
          </select>
        </Toolbar></div>
        <RuleFilterBar moduleKey="products" fields={productFields} rules={smartRules} onChange={setSmartRules} />
        <div className="field-entry-note">
          点击带下划线的字段可直接查看对应筛选结果；“已挂账号”可先展开选择具体账号。
        </div>
        <div className="table-wrap">
          <table className="module-table">
            <thead>
              <tr>
                <th>商品</th>
                <th>所属平台</th>
                <th>所属店铺</th>
                <th>商品类型</th>
                <th>已挂账号</th>
                <th>已发布内容</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((p, i) => (
                <tr key={p.code}>
                  <td>
                    <div className={`product-thumb p${i + 1}`}>◇</div>
                    <div className="content-cell">
                      <button
                        className="field-entry main"
                        onClick={() =>
                          openDrill({
                            label: `商品：${p.name}`,
                            productCode: p.code,
                          })
                        }
                      >
                        {p.name}
                      </button>
                      <small>{p.code}</small>
                    </div>
                  </td>
                  <td>
                    <button
                      className="field-entry"
                      onClick={() =>
                        openDrill({
                          label: `平台：${p.platformName}`,
                          platform: p.platformName,
                        })
                      }
                    >
                      {p.platformName}
                    </button>
                  </td>
                  <td>
                    <button
                      className="field-entry"
                      onClick={() =>
                        openDrill({
                          label: `店铺：${p.storeName}`,
                          shop: p.storeName,
                        })
                      }
                    >
                      {p.storeName}
                    </button>
                  </td>
                  <td>
                    <button
                      className="field-entry"
                      onClick={() =>
                        openDrill({
                          label: `商品类型：${p.type}`,
                          productType: p.type,
                        })
                      }
                    >
                      {p.type}
                    </button>
                  </td>
                  <td>
                    <details className="account-drill-menu">
                      <summary>
                        {p.accounts} 个账号 <span>⌄</span>
                      </summary>
                      <div>
                        {p.boundAccounts.map((account) => (
                          <button
                            key={account.id}
                            onClick={() =>
                              openDrill({
                                label: `${p.name} / ${account.name}`,
                                productCode: p.code,
                                account: account.name,
                              })
                            }
                          >
                            <span className="mini-avatar">
                              {account.name[0]}
                            </span>
                            <strong>{account.name}</strong>
                            <small>
                              {
                                data.publishedContents.filter(
                                  (content) =>
                                    content.productId === p.id &&
                                    content.accountId === account.id,
                                ).length
                              }{" "}
                              条已发布 →
                            </small>
                          </button>
                        ))}
                      </div>
                    </details>
                  </td>
                  <td>
                    <button
                      className="field-entry count"
                      onClick={() =>
                        openDrill({
                          label: `${p.name}的已发布内容`,
                          productCode: p.code,
                        })
                      }
                    >
                      {p.contents} 条
                    </button>
                  </td>
                  <td>
                    <button
                      className="badge-entry"
                      onClick={() =>
                        openDrill({
                          label: `商品状态：${p.statusLabel}`,
                          productStatus: p.statusLabel,
                        })
                      }
                    >
                      <Badge
                        tone={p.statusLabel === "启用" ? "green" : "slate"}
                      >
                        {p.statusLabel}
                      </Badge>
                    </button>
                  </td>
                  <td>
                    <button
                      className="table-action"
                      onClick={() => setEditor(p)}
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visibleProducts.length && (
            <div className="empty-state">没有符合条件的商品</div>
          )}
        </div>
      </section>
      {editor && (
        <BusinessCreateModal
          kind="product"
          data={data}
          initial={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={reload}
          notify={notify}
        />
      )}
    </>
  );
}

function AccountManagement({
  notify,
  data,
  reload,
}: Pick<Props, "notify"> & {
  data: BusinessData;
  reload: () => Promise<void>;
}) {
  const productNames = Object.fromEntries(
    data.products.map((item) => [item.code, item.name]),
  );
  const accounts = data.accounts.map((item) => {
    const productIds = data.bindings
      .filter((binding) => binding.accountId === item.id)
      .map((binding) => binding.productId);
    return {
      ...item,
      handle: item.code,
      platform: item.platformCode,
      owner: item.ownerName ?? "未分配",
      products: productIds.length,
      contents: data.publishedContents.filter(
        (content) => content.accountId === item.id,
      ).length,
      statusLabel: item.status === "active" ? "运营中" : "暂停",
      bound: data.products.filter((product) => productIds.includes(product.id)),
    };
  });
  const [editor, setEditor] = useState<
    BusinessData["accounts"][number] | "new" | null
  >(null);
  const [smartRules, setSmartRules] = useState<SmartFilterRule[]>([]);
  const accountFields = useMemo<SmartFilterField<(typeof accounts)[number]>[]>(() => [
    { key: "query", label: "关键词", type: "text", getValue: (item) => [item.name, item.code, item.platformHandle] },
    { key: "platform", label: "所属平台", type: "select", options: [...new Set(accounts.map((item) => item.platformName))].map((value) => ({value,label:value})), getValue: (item) => item.platformName },
    { key: "owner", label: "负责人", type: "select", options: [...new Set(accounts.map((item) => item.owner))].map((value) => ({value,label:value})), getValue: (item) => item.owner },
    { key: "product", label: "绑定商品", type: "select", options: data.products.map((item) => ({value:item.name,label:item.name})), getValue: (item) => item.bound.map((product) => product.name) },
    { key: "products", label: "绑定商品数", type: "number", getValue: (item) => item.products },
    { key: "contents", label: "已发布内容数", type: "number", getValue: (item) => item.contents },
    { key: "status", label: "状态", type: "select", options: ["运营中", "暂停"].map((value) => ({value,label:value})), getValue: (item) => item.statusLabel },
  ], [accounts, data.products]);
  const visibleAccounts = useMemo(() => applySmartFilters(accounts, smartRules, accountFields), [accounts, smartRules, accountFields]);
  const [view, setView] = useState<{
    accountId: number;
    account: string;
    handle: string;
    productCode?: string;
  } | null>(null);
  if (view) {
    const rows = toManagementContents({
      ...data,
      publishedContents: data.publishedContents.filter(
        (content) => content.accountId === view.accountId,
      ),
    });
    return (
      <DrilldownContentList
        title={
          view.productCode
            ? `${view.account} / ${productNames[view.productCode]}`
            : `账号：${view.account} / 全部已发布内容`
        }
        note={
          view.productCode
            ? "由绑定商品快捷入口进入，账号和商品筛选条件已自动带入。"
            : "由已发布内容入口进入，默认展示该账号全部已发布内容，可继续按商品筛选。"
        }
        rows={rows}
        initialProductCode={view.productCode}
        onBack={() => setView(null)}
        notify={notify}
      />
    );
  }
  return (
    <>
      <ModuleHeader
        title="项目"
        description="绑定商品和发布内容只统计已完成发布的内容，不包含等待发布记录。"
        action="新建账号"
        onAction={() => setEditor("new")}
      />
      <RuleFilterBar moduleKey="accounts" fields={accountFields} rules={smartRules} onChange={setSmartRules} />
      <div className="account-grid">
        {visibleAccounts.map((a) => (
          <article className="panel account-card" key={a.handle}>
            <div className="account-top">
              <span className={`account-logo ${a.platform}`}>
                {(platformName[a.platform] ?? a.platformName)[0]}
              </span>
              <div>
                <button
                  className="account-title-entry"
                  onClick={() =>
                    setView({
                      accountId: a.id,
                      account: a.name,
                      handle: a.handle,
                    })
                  }
                >
                  {a.name}
                </button>
                <p>
                  {a.platformName} · {a.platformHandle || a.handle}
                </p>
              </div>
              <Badge tone={a.statusLabel === "运营中" ? "green" : "slate"}>
                {a.statusLabel}
              </Badge>
            </div>
            <div className="account-owner">
              <span className="mini-avatar">{a.owner[0]}</span>
              <div>
                <small>账号负责人</small>
                <strong>{a.owner}</strong>
              </div>
            </div>
            <div className="account-stats">
              <details className="account-product-menu">
                <summary>
                  <strong>{a.products}</strong>
                  <small>
                    绑定商品 <span>⌄</span>
                  </small>
                </summary>
                <div>
                  {a.bound.map((product) => (
                    <button
                      key={product.id}
                      onClick={() =>
                        setView({
                          accountId: a.id,
                          account: a.name,
                          handle: a.handle,
                          productCode: product.code,
                        })
                      }
                    >
                      <span className="product-menu-mark">◇</span>
                      <div>
                        <strong>{product.name}</strong>
                        <small>{product.code}</small>
                      </div>
                      <em>
                        {
                          data.publishedContents.filter(
                            (content) =>
                              content.accountId === a.id &&
                              content.productId === product.id,
                          ).length
                        }{" "}
                        条已发布 →
                      </em>
                    </button>
                  ))}
                </div>
              </details>
              <button
                onClick={() =>
                  setView({
                    accountId: a.id,
                    account: a.name,
                    handle: a.handle,
                  })
                }
              >
                <strong>{a.contents}</strong>
                <small>已发布内容 · 查看全部</small>
              </button>
            </div>
            <button className="account-edit" onClick={() => setEditor(a)}>
              编辑账号资料
            </button>
          </article>
        ))}
        {!visibleAccounts.length && (
          <div className="empty-state">没有符合条件的项目</div>
        )}
      </div>
      {editor && (
        <BusinessCreateModal
          kind="account"
          data={data}
          initial={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={reload}
          notify={notify}
        />
      )}
    </>
  );
}
function PlatformStores({
  notify,
  platformIcons,
  setPlatformIcons,
  platforms,
  setPlatforms,
  stores,
  setStores,
  reload,
}: Pick<Props, "notify" | "platformIcons" | "setPlatformIcons"> & {
  platforms: ManagedPlatform[];
  setPlatforms: React.Dispatch<React.SetStateAction<ManagedPlatform[]>>;
  stores: ManagedStore[];
  setStores: React.Dispatch<React.SetStateAction<ManagedStore[]>>;
  reload: () => Promise<void>;
}) {
  type DrawerState = {
    kind: "platform" | "store";
    mode: "new" | "edit";
    platformKey?: PlatformKey;
    storeId?: string;
  };
  type ToggleState = {
    kind: "platform" | "store";
    id: string;
    label: string;
    next: "启用" | "停用";
  };
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [draft, setDraft] = useState<{
    name: string;
    code: string;
    owner: string;
    status: "启用" | "停用";
    platformKey: PlatformKey;
  }>({ name: "", code: "", owner: "", status: "启用", platformKey: "dy" });
  const [toggleRequest, setToggleRequest] = useState<ToggleState | null>(null);
  const [smartRules, setSmartRules] = useState<SmartFilterRule[]>([]);
  type PlatformStoreRow = {
    platformKey: string;
    platform: string;
    platformCode: string;
    platformStatus: string;
    accountCount: number;
    storeCount: number;
    storeId: string;
    store: string;
    storeCode: string;
    storeStatus: string;
  };
  const platformStoreRows = useMemo<PlatformStoreRow[]>(() => platforms.flatMap((platform) => {
    const platformStores = stores.filter((store) => store.platformKey === platform.key);
    const base = { platformKey: platform.key, platform: platform.name, platformCode: platform.key, platformStatus: platform.status, accountCount: platform.accounts, storeCount: platformStores.length };
    return platformStores.length ? platformStores.map((store) => ({ ...base, storeId: store.id, store: store.name, storeCode: store.code, storeStatus: store.status })) : [{ ...base, storeId: "", store: "", storeCode: "", storeStatus: "" }];
  }), [platforms, stores]);
  const platformStoreFields = useMemo<SmartFilterField<PlatformStoreRow>[]>(() => [
    { key: "query", label: "名称/编号", type: "text", getValue: (item) => [item.platform, item.platformCode, item.store, item.storeCode] },
    { key: "platform", label: "平台名称", type: "select", options: platforms.map((item) => ({ value: item.name, label: item.name })), getValue: (item) => item.platform },
    { key: "platformCode", label: "平台编号", type: "text", getValue: (item) => item.platformCode },
    { key: "platformStatus", label: "平台状态", type: "select", options: ["启用", "停用"].map((value) => ({ value, label: value })), getValue: (item) => item.platformStatus },
    { key: "accountCount", label: "项目数", type: "number", getValue: (item) => item.accountCount },
    { key: "storeCount", label: "店铺数", type: "number", getValue: (item) => item.storeCount },
    { key: "store", label: "店铺名称", type: "select", options: stores.map((item) => ({ value: item.name, label: item.name })), getValue: (item) => item.store },
    { key: "storeCode", label: "店铺编号", type: "text", getValue: (item) => item.storeCode },
    { key: "storeStatus", label: "店铺状态", type: "select", options: ["启用", "停用"].map((value) => ({ value, label: value })), getValue: (item) => item.storeStatus },
  ], [platforms, stores]);
  const filteredPlatformStoreRows = useMemo(() => applySmartFilters(platformStoreRows, smartRules, platformStoreFields), [platformStoreRows, smartRules, platformStoreFields]);
  const visiblePlatformKeys = new Set(filteredPlatformStoreRows.map((item) => item.platformKey));
  const visibleStoreIds = new Set(filteredPlatformStoreRows.map((item) => item.storeId).filter(Boolean));
  const uploadPlatformIcon = async (
    key: PlatformKey,
    name: string,
    file?: File,
  ) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("请选择图片文件");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notify("平台图案不能超过 2MB");
      return;
    }
    const response = await fetch(
      `/api/platforms/${encodeURIComponent(key)}/icon`,
      { method: "PUT", headers: { "content-type": file.type }, body: file },
    );
    const result = (await response.json()) as { error?: string; url?: string };
    if (!response.ok) {
      notify(result.error ?? "平台图案上传失败");
      return;
    }
    setPlatformIcons((current) => ({
      ...current,
      [key]: `${result.url}?v=${Date.now()}`,
    }));
    notify(`${name}平台图案已保存，其他电脑刷新后也能看到`);
  };
  const openPlatform = (platform?: ManagedPlatform) => {
    setDraft({
      name: platform?.name ?? "",
      code: platform?.key ?? "",
      owner: "",
      status: platform?.status ?? "启用",
      platformKey: platform?.key ?? "dy",
    });
    setDrawer({
      kind: "platform",
      mode: platform ? "edit" : "new",
      platformKey: platform?.key,
    });
  };
  const openStore = (platformKey: PlatformKey, store?: ManagedStore) => {
    setDraft({
      name: store?.name ?? "",
      code: store?.code ?? "",
      owner: "",
      status: store?.status ?? "启用",
      platformKey: store?.platformKey ?? platformKey,
    });
    setDrawer({
      kind: "store",
      mode: store ? "edit" : "new",
      platformKey,
      storeId: store?.id,
    });
  };
  const saveDrawer = async () => {
    if (!drawer || !draft.name.trim()) {
      notify("请填写名称");
      return;
    }
    if (drawer.kind === "platform") {
      if (drawer.mode === "edit" && drawer.platformKey) {
        const current = platforms.find(
          (item) => item.key === drawer.platformKey,
        );
        if (!current?.id) {
          notify("平台资料尚未加载完成");
          return;
        }
        const response = await fetch("/api/business-data", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            entity: "platform",
            id: current.id,
            name: draft.name.trim(),
            status: draft.status === "启用" ? "active" : "inactive",
          }),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) {
          notify(result.error ?? "平台保存失败");
          return;
        }
        await reload();
      } else {
        const code = draft.code.trim() || `platform-${Date.now()}`;
        const response = await fetch("/api/business-data", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            entity: "platform",
            name: draft.name.trim(),
            code,
            status: draft.status === "启用" ? "active" : "inactive",
          }),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) {
          notify(result.error ?? "平台保存失败");
          return;
        }
        await reload();
        setPlatformIcons((current) => ({ ...current, [code]: "" }));
      }
      notify(drawer.mode === "edit" ? "平台资料已保存" : "新平台已添加");
    } else {
      if (!draft.code.trim()) {
        notify("请填写店铺编号");
        return;
      }
      if (drawer.mode === "edit" && drawer.storeId) {
        const current = stores.find((item) => item.id === drawer.storeId);
        if (!current?.dbId) {
          notify("店铺资料尚未加载完成");
          return;
        }
        const response = await fetch("/api/business-data", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            entity: "store",
            id: current.dbId,
            platformCode: draft.platformKey,
            name: draft.name.trim(),
            code: draft.code.trim(),
            status: draft.status === "启用" ? "active" : "inactive",
          }),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) {
          notify(result.error ?? "店铺保存失败");
          return;
        }
        await reload();
      } else {
        const response = await fetch("/api/business-data", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            entity: "store",
            platformCode: draft.platformKey,
            name: draft.name.trim(),
            code: draft.code.trim(),
            status: draft.status === "启用" ? "active" : "inactive",
          }),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) {
          notify(result.error ?? "店铺保存失败");
          return;
        }
        await reload();
      }
      notify(drawer.mode === "edit" ? "店铺资料已保存" : "新店铺已添加");
    }
    setDrawer(null);
  };
  const movePlatform = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= platforms.length) return;
    const next = [...platforms];
    [next[index], next[target]] = [next[target], next[index]];
    setPlatforms(next);
    const response = await fetch("/api/business-data", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entity: "platformOrder",
        ids: next.map((item) => item.id),
      }),
    });
    if (!response.ok) {
      await reload();
      notify("平台顺序保存失败，已恢复数据库顺序");
      return;
    }
    await reload();
    notify("平台显示顺序已更新，发布管理的平台灯顺序同步生效");
  };
  const applyToggle = async () => {
    if (!toggleRequest) return;
    const current =
      toggleRequest.kind === "platform"
        ? platforms.find((item) => item.key === toggleRequest.id)
        : stores.find((item) => item.id === toggleRequest.id);
    const id = current && ("dbId" in current ? current.dbId : current.id);
    if (!id) {
      notify("业务资料尚未加载完成");
      return;
    }
    const response = await fetch("/api/business-data", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entity: toggleRequest.kind,
        id,
        name: current.name,
        code: "code" in current ? current.code : undefined,
        platformCode:
          "platformKey" in current ? current.platformKey : undefined,
        status: toggleRequest.next === "启用" ? "active" : "inactive",
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      notify(result.error ?? "状态更新失败");
      return;
    }
    await reload();
    notify(
      `${toggleRequest.label}已${toggleRequest.next}；历史内容和关联记录不受影响`,
    );
    setToggleRequest(null);
  };
  return (
    <>
      <ModuleHeader
        title="平台与店铺"
        description="统一维护平台顺序、发布灯图案和店铺资料；停用后保留历史关系，但不再用于新业务。"
        action="新增平台"
        onAction={() => openPlatform()}
      />
      <div className="platform-rule-note">
        <span>i</span>
        <div>
          <strong>基础资料规则</strong>
          <p>
            已被商品或账号使用的平台和店铺不直接删除，只能停用；平台排序同步决定发布管理的平台灯顺序。
          </p>
        </div>
      </div>
      <section className="panel module-panel platform-filter-panel">
        <RuleFilterBar moduleKey="platform_stores" fields={platformStoreFields} rules={smartRules} onChange={setSmartRules} />
      </section>
      <div className="platform-grid">
        {platforms.map((platform, index) => ({ platform, index })).filter(({ platform }) => visiblePlatformKeys.has(platform.key)).map(({ platform, index }) => {
          const platformStores = stores.filter(
            (store) => store.platformKey === platform.key && (!smartRules.length || visibleStoreIds.has(store.id)),
          );
          const restore = async () => {
            const response = await fetch(
              `/api/platforms/${encodeURIComponent(platform.key)}/icon`,
              { method: "DELETE" },
            );
            if (!response.ok) {
              notify("恢复默认图案失败");
              return;
            }
            setPlatformIcons((current) => ({ ...current, [platform.key]: "" }));
            notify(`${platform.name}已恢复默认图案`);
          };
          return (
            <section
              className={`panel platform-card ${platform.status === "停用" ? "disabled" : ""}`}
              key={platform.key}
            >
              <div className="platform-card-head">
                <span className={`account-logo ${platform.key}`}>
                  {platformIcons[platform.key] ? (
                    <img
                      src={platformIcons[platform.key]}
                      alt={`${platform.name}图案`}
                    />
                  ) : (
                    platform.mark
                  )}
                </span>
                <div>
                  <div className="platform-title-line">
                    <h3>{platform.name}</h3>
                    <Badge
                      tone={platform.status === "启用" ? "green" : "slate"}
                    >
                      {platform.status}
                    </Badge>
                  </div>
                  <p>
                    显示顺序 {index + 1} · {platformStores.length} 个店铺 ·{" "}
                    {platform.accounts} 个项目
                  </p>
                </div>
                <div className="platform-card-actions">
                  <button
                    disabled={index === 0}
                    onClick={() => void movePlatform(index, -1)}
                    title="上移"
                  >
                    ↑
                  </button>
                  <button
                    disabled={index === platforms.length - 1}
                    onClick={() => void movePlatform(index, 1)}
                    title="下移"
                  >
                    ↓
                  </button>
                  <button onClick={() => openPlatform(platform)}>编辑</button>
                  <button
                    className={platform.status === "启用" ? "danger" : ""}
                    onClick={() =>
                      setToggleRequest({
                        kind: "platform",
                        id: platform.key,
                        label: platform.name,
                        next: platform.status === "启用" ? "停用" : "启用",
                      })
                    }
                  >
                    {platform.status === "启用" ? "停用" : "启用"}
                  </button>
                </div>
              </div>
              <div className="platform-icon-setting">
                <div>
                  <strong>发布灯图案</strong>
                  <small>
                    统一按 1:1 圆角正方形居中裁剪，建议上传正方形 PNG 或
                    WebP，最大 2MB
                  </small>
                </div>
                <label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      void uploadPlatformIcon(
                        platform.key,
                        platform.name,
                        event.target.files?.[0],
                      )
                    }
                  />
                  上传图片
                </label>
                {platformIcons[platform.key] && (
                  <button onClick={() => void restore()}>恢复默认</button>
                )}
              </div>
              <div className="store-list">
                <div className="store-title">
                  <div>
                    <strong>所属店铺</strong>
                    <small>编号和状态统一维护</small>
                  </div>
                  <button
                    disabled={platform.status === "停用"}
                    onClick={() => openStore(platform.key)}
                  >
                    ＋ 新增店铺
                  </button>
                </div>
                {platformStores.map((store) => (
                  <div
                    className={`store-row ${store.status === "停用" ? "disabled" : ""}`}
                    key={store.id}
                  >
                    <span>▱</span>
                    <div>
                      <strong>{store.name}</strong>
                      <small>{store.code}</small>
                    </div>
                    <Badge tone={store.status === "启用" ? "green" : "slate"}>
                      {store.status}
                    </Badge>
                    <button onClick={() => openStore(platform.key, store)}>
                      编辑
                    </button>
                    <button
                      className={store.status === "启用" ? "danger" : ""}
                      onClick={() =>
                        setToggleRequest({
                          kind: "store",
                          id: store.id,
                          label: store.name,
                          next: store.status === "启用" ? "停用" : "启用",
                        })
                      }
                    >
                      {store.status === "启用" ? "停用" : "启用"}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {drawer && (
        <div className="settings-drawer-backdrop">
          <aside
            className="settings-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drawer-head">
              <div>
                <small>
                  {drawer.kind === "platform" ? "平台资料" : "店铺资料"}
                </small>
                <h3>
                  {drawer.mode === "new" ? "新增" : "编辑"}
                  {drawer.kind === "platform" ? "平台" : "店铺"}
                </h3>
              </div>
              <small className="drawer-exit-hint">请使用底部“取消”或“保存”</small>
            </div>
            <div className="settings-form">
              {drawer.kind === "store" && (
                <label>
                  <span>所属平台 *</span>
                  <select
                    value={draft.platformKey}
                    onChange={(event) =>
                      setDraft({ ...draft, platformKey: event.target.value })
                    }
                  >
                    {platforms
                      .filter(
                        (item) =>
                          item.status === "启用" ||
                          item.key === draft.platformKey,
                      )
                      .map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label>
                <span>
                  {drawer.kind === "platform" ? "平台名称" : "店铺名称"} *
                </span>
                <input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                />
              </label>
              {drawer.kind === "store" && (
                <label>
                  <span>店铺编号 *</span>
                  <input
                    value={draft.code}
                    onChange={(event) =>
                      setDraft({ ...draft, code: event.target.value })
                    }
                  />
                </label>
              )}
              <label>
                <span>启用状态</span>
                <select
                  value={draft.status}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      status: event.target.value as "启用" | "停用",
                    })
                  }
                >
                  <option>启用</option>
                  <option>停用</option>
                </select>
              </label>
              <div className="settings-impact">
                <strong>停用影响</strong>
                <p>
                  历史商品、账号、内容和发布记录继续保留；新建业务资料时不再提供该选项。
                </p>
              </div>
            </div>
            <div className="drawer-actions">
              <button onClick={() => setDrawer(null)}>取消</button>
              <button className="primary-button" onClick={saveDrawer}>
                保存
              </button>
            </div>
          </aside>
        </div>
      )}
      {toggleRequest && (
        <div className="modal-backdrop confirm-layer">
          <div className="modal confirm-modal">
            <div className="confirm-icon">!</div>
            <h3>
              确认{toggleRequest.next}“{toggleRequest.label}”？
            </h3>
            <p>
              {toggleRequest.next === "停用"
                ? "停用后不能用于新建商品、账号或店铺，但已有历史内容和关联记录继续保留。"
                : "启用后将重新出现在新建业务资料的可选项中。"}
            </p>
            <div className="confirm-actions">
              <button onClick={() => setToggleRequest(null)}>取消</button>
              <button
                className={
                  toggleRequest.next === "停用"
                    ? "danger-confirm"
                    : "primary-button"
                }
                onClick={() => void applyToggle()}
              >
                确认{toggleRequest.next}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Analytics({ notify }: Pick<Props, "notify">) {
  type MetricRecord = {
    id: string;
    content: string;
    platform: string;
    account: string;
    product: string;
    owner: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    favorites: number;
    recordedAt: string;
    recordedBy: string;
  };
  const [period, setPeriod] = useState("本月");
  const [platformFilter, setPlatformFilter] = useState("全部平台");
  const [accountFilter, setAccountFilter] = useState("全部账号");
  const [productFilter, setProductFilter] = useState("全部商品");
  const [ownerFilter, setOwnerFilter] = useState("全部员工");
  const [metricRecords, setMetricRecords] = useState<MetricRecord[]>([
    {
      id: "MET-011",
      content: "珍珠耳环日常搭配",
      platform: "小红书",
      account: "首饰灵感簿",
      product: "珍珠耳环",
      owner: "林晓",
      views: 28650,
      likes: 2184,
      comments: 136,
      shares: 82,
      favorites: 615,
      recordedAt: "今天 11:18",
      recordedBy: "王晨",
    },
    {
      id: "MET-010",
      content: "项链通勤搭配",
      platform: "抖音",
      account: "轻奢饰界",
      product: "锁骨链",
      owner: "周莉",
      views: 46320,
      likes: 3915,
      comments: 208,
      shares: 174,
      favorites: 982,
      recordedAt: "今天 10:42",
      recordedBy: "王晨",
    },
    {
      id: "MET-009",
      content: "戒指细节展示",
      platform: "快手",
      account: "每日新饰",
      product: "星芒戒指",
      owner: "陈瑜",
      views: 18480,
      likes: 1265,
      comments: 94,
      shares: 61,
      favorites: 306,
      recordedAt: "昨天 16:20",
      recordedBy: "赵安",
    },
    {
      id: "MET-008",
      content: "礼盒开箱展示",
      platform: "小红书",
      account: "礼物研究所",
      product: "礼盒套装",
      owner: "林晓",
      views: 35210,
      likes: 2874,
      comments: 189,
      shares: 126,
      favorites: 744,
      recordedAt: "昨天 14:15",
      recordedBy: "周莉",
    },
  ]);
  const [metricDraft, setMetricDraft] = useState({
    content: "珍珠耳环日常搭配",
    platform: "小红书",
    views: "",
    likes: "",
    comments: "",
    shares: "",
    favorites: "",
  });
  const accountBars = [
    { name: "抖音｜轻奢饰界", count: 62, percent: 100 },
    { name: "小红书｜首饰灵感簿", count: 48, percent: 77 },
    { name: "快手｜每日新饰", count: 39, percent: 63 },
    { name: "小红书｜礼物研究所", count: 21, percent: 34 },
  ];
  const visibleMetrics = metricRecords.filter(
    (record) =>
      (platformFilter === "全部平台" || record.platform === platformFilter) &&
      (accountFilter === "全部账号" || record.account === accountFilter) &&
      (productFilter === "全部商品" || record.product === productFilter) &&
      (ownerFilter === "全部员工" || record.owner === ownerFilter),
  );
  const saveMetrics = () => {
    if (!metricDraft.views.trim()) {
      notify("请至少填写播放量");
      return;
    }
    const account =
      metricDraft.platform === "抖音"
        ? "轻奢饰界"
        : metricDraft.platform === "快手"
          ? "每日新饰"
          : "首饰灵感簿";
    setMetricRecords([
      {
        id: `MET-${Date.now()}`,
        content: metricDraft.content,
        platform: metricDraft.platform,
        account,
        product: metricDraft.content.includes("珍珠") ? "珍珠耳环" : "锁骨链",
        owner: "林晓",
        views: Number(metricDraft.views.replaceAll(",", "")) || 0,
        likes: Number(metricDraft.likes) || 0,
        comments: Number(metricDraft.comments) || 0,
        shares: Number(metricDraft.shares) || 0,
        favorites: Number(metricDraft.favorites) || 0,
        recordedAt: "刚刚",
        recordedBy: "系统管理员",
      },
      ...metricRecords,
    ]);
    setMetricDraft({
      ...metricDraft,
      views: "",
      likes: "",
      comments: "",
      shares: "",
      favorites: "",
    });
    notify("平台表现数据已保存，原有录入记录和修改历史继续保留");
  };
  return (
    <>
      <ModuleHeader
        title="数据统计"
        description="统计上传、审核、发布和平台表现；平台表现第一版由发布人员手工录入。"
        action="导出 Excel"
        onAction={() => notify("已按当前日期和筛选条件生成 Excel 导出任务")}
      />
      <section className="panel analytics-filter-panel">
        <div className="analytics-period-tabs">
          {["今天", "本周", "本月", "自定义"].map((item) => (
            <button
              key={item}
              className={period === item ? "active" : ""}
              onClick={() => setPeriod(item)}
            >
              {item}
            </button>
          ))}
        </div>
        {period === "自定义" && (
          <div className="custom-date-range">
            <input type="date" aria-label="开始日期" />
            <span>至</span>
            <input type="date" aria-label="结束日期" />
          </div>
        )}
        <div className="analytics-dimensions">
          <select
            value={platformFilter}
            onChange={(event) => setPlatformFilter(event.target.value)}
          >
            <option>全部平台</option>
            <option>抖音</option>
            <option>快手</option>
            <option>小红书</option>
          </select>
          <select
            value={accountFilter}
            onChange={(event) => setAccountFilter(event.target.value)}
          >
            <option>全部账号</option>
            <option>轻奢饰界</option>
            <option>每日新饰</option>
            <option>首饰灵感簿</option>
            <option>礼物研究所</option>
          </select>
          <select
            value={productFilter}
            onChange={(event) => setProductFilter(event.target.value)}
          >
            <option>全部商品</option>
            <option>珍珠耳环</option>
            <option>锁骨链</option>
            <option>星芒戒指</option>
            <option>礼盒套装</option>
          </select>
          <select
            value={ownerFilter}
            onChange={(event) => setOwnerFilter(event.target.value)}
          >
            <option>全部员工</option>
            <option>林晓</option>
            <option>陈瑜</option>
            <option>周莉</option>
          </select>
          <select>
            <option>全部内容类型</option>
            <option>视频</option>
            <option>图文</option>
          </select>
        </div>
      </section>
      <div className="analytics-scope-note">
        <span>◉</span>
        <p>
          当前以“全公司”数据范围展示；内容员工登录后只统计本人数据，审核角色和发布专员只显示各自授权指标。
        </p>
      </div>
      <section className="metrics module-metrics">
        {[
          ["新增内容", "243", "+31 较上期", "purple"],
          ["审核通过", "218", "通过率 89.7%", "green"],
          ["已发布", "186", "待发布 12 条", "blue"],
          ["发布完成率", "98.9%", "2 条未完成", "amber"],
        ].map(([label, value, note, tone]) => (
          <article className="metric-card" key={label}>
            <div className={`metric-icon ${tone}`}>⌁</div>
            <div>
              <p>{label}</p>
              <strong>{value}</strong>
              <small>
                {period} · {note}
              </small>
            </div>
          </article>
        ))}
      </section>
      <div className="analytics-grid">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h3>各账号发布量</h3>
              <p>按已确认的平台发布灯统计</p>
            </div>
          </div>
          <div className="bar-chart">
            {accountBars.map((bar) => (
              <div className="bar-row" key={bar.name}>
                <span>{bar.name}</span>
                <div>
                  <i style={{ width: `${bar.percent}%` }} />
                </div>
                <strong>{bar.count}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="panel analytics-breakdown">
          <div className="panel-heading">
            <div>
              <h3>审核与发布状态</h3>
              <p>当前筛选范围内的内容流转情况</p>
            </div>
          </div>
          <div className="breakdown-list">
            {[
              ["待审核", 8, 18, "amber"],
              ["审核中", 3, 9, "blue"],
              ["已通过", 218, 88, "green"],
              ["已驳回", 14, 27, "red"],
              ["待发布", 12, 22, "slate"],
            ].map(([label, count, width, tone]) => (
              <div key={String(label)}>
                <span className={`breakdown-dot ${tone}`} />
                <strong>{label}</strong>
                <div>
                  <i style={{ width: `${width}%` }} />
                </div>
                <em>{count}</em>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="panel metric-record-panel">
        <div className="panel-heading">
          <div>
            <h3>平台表现记录</h3>
            <p>每次手工录入单独保留，不覆盖旧记录。</p>
          </div>
          <span>{visibleMetrics.length} 条记录</span>
        </div>
        <div className="table-wrap">
          <table className="module-table metric-record-table">
            <thead>
              <tr>
                <th>内容</th>
                <th>平台 / 账号</th>
                <th>商品</th>
                <th>播放</th>
                <th>点赞</th>
                <th>评论</th>
                <th>分享</th>
                <th>收藏</th>
                <th>录入信息</th>
              </tr>
            </thead>
            <tbody>
              {visibleMetrics.map((record) => (
                <tr key={record.id}>
                  <td>
                    <strong>{record.content}</strong>
                    <small className="cell-subline">
                      {record.id} · 上传人 {record.owner}
                    </small>
                  </td>
                  <td>
                    <Badge tone="blue">{record.platform}</Badge>
                    <small className="cell-subline">{record.account}</small>
                  </td>
                  <td>{record.product}</td>
                  <td>{record.views.toLocaleString()}</td>
                  <td>{record.likes.toLocaleString()}</td>
                  <td>{record.comments.toLocaleString()}</td>
                  <td>{record.shares.toLocaleString()}</td>
                  <td>{record.favorites.toLocaleString()}</td>
                  <td>
                    {record.recordedAt}
                    <small className="cell-subline">{record.recordedBy}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel data-entry analytics-data-entry">
        <div className="panel-heading">
          <div>
            <h3>手工数据录入</h3>
            <p>发布专员录入已发布内容的最新平台表现。</p>
          </div>
        </div>
        <div className="data-form">
          <div className="data-source-fields">
            <label>
              选择发布内容
              <select
                value={metricDraft.content}
                onChange={(event) =>
                  setMetricDraft({
                    ...metricDraft,
                    content: event.target.value,
                  })
                }
              >
                <option>珍珠耳环日常搭配</option>
                <option>项链通勤搭配</option>
                <option>戒指细节展示</option>
              </select>
            </label>
            <label>
              发布平台
              <select
                value={metricDraft.platform}
                onChange={(event) =>
                  setMetricDraft({
                    ...metricDraft,
                    platform: event.target.value,
                  })
                }
              >
                <option>抖音</option>
                <option>快手</option>
                <option>小红书</option>
              </select>
            </label>
          </div>
          <div>
            <label>
              播放量 *
              <input
                value={metricDraft.views}
                onChange={(event) =>
                  setMetricDraft({ ...metricDraft, views: event.target.value })
                }
              />
            </label>
            <label>
              点赞量
              <input
                value={metricDraft.likes}
                onChange={(event) =>
                  setMetricDraft({ ...metricDraft, likes: event.target.value })
                }
              />
            </label>
            <label>
              评论量
              <input
                value={metricDraft.comments}
                onChange={(event) =>
                  setMetricDraft({
                    ...metricDraft,
                    comments: event.target.value,
                  })
                }
              />
            </label>
            <label>
              分享量
              <input
                value={metricDraft.shares}
                onChange={(event) =>
                  setMetricDraft({ ...metricDraft, shares: event.target.value })
                }
              />
            </label>
            <label>
              收藏量
              <input
                value={metricDraft.favorites}
                onChange={(event) =>
                  setMetricDraft({
                    ...metricDraft,
                    favorites: event.target.value,
                  })
                }
              />
            </label>
          </div>
          <button className="primary-button" onClick={saveMetrics}>
            保存本次数据
          </button>
        </div>
      </section>
    </>
  );
}

type AnalyticsData = {
  contents: Array<{
    id: number;
    title: string;
    contentType: string;
    reviewStatus: string;
    uploaderUserId?:number;
    contentColor?:string|null;
    uploaderName: string;
    createdAt: string;
  }>;
  published: Array<{
    platformContentId: number;
    sourceContentId: number;
    contentTitle: string;
    contentType: string;
    uploaderUserId?:number;
    contentColor?:string|null;
    uploaderName: string;
    platform: string;
    account: string | null;
    product: string | null;
    publishStatus: string;
    publishedAt: string | null;
  }>;
  metrics: Array<{
    id: number;
    platformContentId: number;
    recordedOn: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    favorites: number;
    recordedAt: string;
    recordedBy: string;
    sourceContentId: number;
    contentTitle: string;
    contentType: string;
    uploaderUserId?:number;
    contentColor?:string|null;
    uploaderName: string;
    platform: string;
    account: string | null;
    product: string | null;
    publishedAt: string | null;
  }>;
};

function AnalyticsLive({ notify }: Pick<Props, "notify">) {
  const empty: AnalyticsData = { contents: [], published: [], metrics: [] };
  const [data, setData] = useState<AnalyticsData>(empty);
  const [period, setPeriod] = useState("本月");
  const [platformFilter, setPlatformFilter] = useState("全部平台");
  const [accountFilter, setAccountFilter] = useState("全部账号");
  const [productFilter, setProductFilter] = useState("全部商品");
  const [ownerFilter, setOwnerFilter] = useState("全部员工");
  const [kindFilter, setKindFilter] = useState("全部内容类型");
  const [metricRules, setMetricRules] = useState<SmartFilterRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [metricDraft, setMetricDraft] = useState({
    platformContentId: "",
    views: "",
    likes: "",
    comments: "",
    shares: "",
    favorites: "",
  });
  const load = async () => {
    const response = await fetch("/api/analytics", { cache: "no-store" });
    if (!response.ok) return;
    setData((await response.json()) as AnalyticsData);
  };
  useEffect(() => {
    void load();
  }, []);
  const inPeriod = (value: string | null) => {
    if (!value) return false;
    const date = new Date(
      value.replace(" ", "T") + (value.includes("Z") ? "" : "Z"),
    );
    const now = new Date();
    if (period === "今天") return date.toDateString() === now.toDateString();
    if (period === "本周")
      return date.getTime() >= now.getTime() - 6 * 86400000;
    if (period === "本月")
      return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth()
      );
    return true;
  };
  const dimensionMatch = (item: {
    platform?: string;
    account?: string | null;
    product?: string | null;
    uploaderName: string;
    contentType: string;
  }) =>
    (platformFilter === "全部平台" || item.platform === platformFilter) &&
    (accountFilter === "全部账号" || item.account === accountFilter) &&
    (productFilter === "全部商品" || item.product === productFilter) &&
    (ownerFilter === "全部员工" || item.uploaderName === ownerFilter) &&
    (kindFilter === "全部内容类型" ||
      item.contentType === (kindFilter === "视频" ? "video" : "image_text"));
  const metricScope = data.metrics.filter(
    (item) => inPeriod(item.recordedOn) && dimensionMatch(item),
  );
  const metricFields = useMemo<SmartFilterField<AnalyticsData["metrics"][number]>[]>(() => [
    { key: "query", label: "内容/员工", type: "text", getValue: (item) => [item.contentTitle, item.uploaderName, item.recordedBy] },
    { key: "platform", label: "平台", type: "select", options: [...new Set(data.metrics.map((item) => item.platform))].map((value) => ({ value, label: value })), getValue: (item) => item.platform },
    { key: "account", label: "账号", type: "select", options: [...new Set(data.metrics.map((item) => item.account ?? "未分配"))].map((value) => ({ value, label: value })), getValue: (item) => item.account ?? "未分配" },
    { key: "product", label: "商品", type: "select", options: [...new Set(data.metrics.map((item) => item.product ?? "未分配"))].map((value) => ({ value, label: value })), getValue: (item) => item.product ?? "未分配" },
    { key: "contentType", label: "内容类型", type: "select", options: [{ value: "video", label: "视频" }, { value: "image_text", label: "图文" }], getValue: (item) => item.contentType },
    { key: "views", label: "播放", type: "number", getValue: (item) => item.views },
    { key: "likes", label: "点赞", type: "number", getValue: (item) => item.likes },
    { key: "comments", label: "评论", type: "number", getValue: (item) => item.comments },
    { key: "shares", label: "分享", type: "number", getValue: (item) => item.shares },
    { key: "favorites", label: "收藏", type: "number", getValue: (item) => item.favorites },
    { key: "recordedOn", label: "数据日期", type: "date", getValue: (item) => item.recordedOn },
    { key: "recordedBy", label: "录入人", type: "select", options: [...new Set(data.metrics.map((item) => item.recordedBy))].map((value) => ({ value, label: value })), getValue: (item) => item.recordedBy },
  ], [data.metrics]);
  const visibleMetrics = useMemo(() => applySmartFilters(metricScope, metricRules, metricFields), [metricScope, metricRules, metricFields]);
  const visiblePublished = data.published.filter(
    (item) => inPeriod(item.publishedAt) && dimensionMatch(item),
  );
  const visibleContents = data.contents.filter(
    (item) =>
      inPeriod(item.createdAt) &&
      (ownerFilter === "全部员工" || item.uploaderName === ownerFilter) &&
      (kindFilter === "全部内容类型" ||
        item.contentType === (kindFilter === "视频" ? "video" : "image_text")),
  );
  const publishedSourceIds = new Set(
    data.published.map((item) => item.sourceContentId),
  );
  const approved = visibleContents.filter(
    (item) => item.reviewStatus === "approved",
  );
  const pendingPublish = approved.filter(
    (item) => !publishedSourceIds.has(item.id),
  ).length;
  const completionRate = approved.length
    ? Math.round(
        (new Set(visiblePublished.map((item) => item.sourceContentId)).size /
          approved.length) *
          100,
      )
    : 0;
  const accountCounts = new Map<string, number>();
  for (const item of visiblePublished) {
    const key = `${item.platform}｜${item.account ?? "未分配"}`;
    accountCounts.set(key, (accountCounts.get(key) ?? 0) + 1);
  }
  const maxAccount = Math.max(1, ...accountCounts.values());
  const accountBars = [...accountCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({
      name,
      count,
      percent: Math.max(6, Math.round((count / maxAccount) * 100)),
    }));
  const statusItems = [
    {
      label: "待审核",
      count: visibleContents.filter((item) => item.reviewStatus === "pending")
        .length,
      tone: "amber",
    },
    {
      label: "审核中",
      count: visibleContents.filter((item) => item.reviewStatus === "reviewing")
        .length,
      tone: "blue",
    },
    { label: "已通过", count: approved.length, tone: "green" },
    {
      label: "已驳回",
      count: visibleContents.filter((item) => item.reviewStatus === "rejected")
        .length,
      tone: "red",
    },
    { label: "待发布", count: pendingPublish, tone: "slate" },
  ];
  const maxStatus = Math.max(1, ...statusItems.map((item) => item.count));
  const selectedPublished = data.published.find(
    (item) => item.platformContentId === Number(metricDraft.platformContentId),
  );
  const saveMetrics = async () => {
    if (!metricDraft.platformContentId || !metricDraft.views.trim()) {
      notify("请选择已发布内容并填写播放量");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/analytics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...metricDraft,
          platformContentId: Number(metricDraft.platformContentId),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "保存失败");
      await load();
      setMetricDraft({
        platformContentId: "",
        views: "",
        likes: "",
        comments: "",
        shares: "",
        favorites: "",
      });
      notify("平台表现数据已保存，历史录入记录继续保留");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };
  const options = (values: (string | null)[]) => [
    ...new Set(values.filter((item): item is string => Boolean(item))),
  ];
  return (
    <>
      <ModuleHeader
        title="数据统计"
        description="上传、审核、发布和平台表现均读取真实业务记录；平台表现由发布人员手工录入。"
        action="刷新数据"
        onAction={() => void load()}
      />
      <section className="panel analytics-filter-panel">
        <div className="analytics-period-tabs">
          {["今天", "本周", "本月", "全部"].map((item) => (
            <button
              key={item}
              className={period === item ? "active" : ""}
              onClick={() => setPeriod(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="analytics-dimensions">
          <select
            value={platformFilter}
            onChange={(event) => setPlatformFilter(event.target.value)}
          >
            <option>全部平台</option>
            {options(data.published.map((item) => item.platform)).map(
              (item) => (
                <option key={item}>{item}</option>
              ),
            )}
          </select>
          <select
            value={accountFilter}
            onChange={(event) => setAccountFilter(event.target.value)}
          >
            <option>全部账号</option>
            {options(data.published.map((item) => item.account)).map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            value={productFilter}
            onChange={(event) => setProductFilter(event.target.value)}
          >
            <option>全部商品</option>
            {options(data.published.map((item) => item.product)).map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            value={ownerFilter}
            onChange={(event) => setOwnerFilter(event.target.value)}
          >
            <option>全部员工</option>
            {options(data.contents.map((item) => item.uploaderName)).map(
              (item) => (
                <option key={item}>{item}</option>
              ),
            )}
          </select>
          <select
            value={kindFilter}
            onChange={(event) => setKindFilter(event.target.value)}
          >
            <option>全部内容类型</option>
            <option>视频</option>
            <option>图文</option>
          </select>
        </div>
      </section>
      <div className="analytics-scope-note">
        <span>◉</span>
        <p>
          所有数字都按当前账号的数据权限和上方筛选条件计算；普通员工不会看到其他员工的私有内容。
        </p>
      </div>
      <section className="metrics module-metrics">
        {[
          [
            "新增内容",
            String(visibleContents.length),
            "按创建时间统计",
            "purple",
          ],
          [
            "审核通过",
            String(approved.length),
            `${visibleContents.length ? Math.round((approved.length / visibleContents.length) * 100) : 0}% 通过率`,
            "green",
          ],
          [
            "已发布",
            String(visiblePublished.length),
            `待发布 ${pendingPublish} 条`,
            "blue",
          ],
          ["发布完成率", `${completionRate}%`, "按审核通过内容计算", "amber"],
        ].map(([label, value, note, tone]) => (
          <article className="metric-card" key={label}>
            <div className={`metric-icon ${tone}`}>⌁</div>
            <div>
              <p>{label}</p>
              <strong>{value}</strong>
              <small>
                {period} · {note}
              </small>
            </div>
          </article>
        ))}
      </section>
      <div className="analytics-grid">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h3>各账号发布量</h3>
              <p>按已确认的平台发布灯统计</p>
            </div>
          </div>
          <div className="bar-chart">
            {accountBars.map((bar) => (
              <div className="bar-row" key={bar.name}>
                <span>{bar.name}</span>
                <div>
                  <i style={{ width: `${bar.percent}%` }} />
                </div>
                <strong>{bar.count}</strong>
              </div>
            ))}
            {!accountBars.length && (
              <div className="empty-state">当前筛选范围内暂无已发布内容</div>
            )}
          </div>
        </section>
        <section className="panel analytics-breakdown">
          <div className="panel-heading">
            <div>
              <h3>审核与发布状态</h3>
              <p>当前筛选范围内的内容流转情况</p>
            </div>
          </div>
          <div className="breakdown-list">
            {statusItems.map((item) => (
              <div key={item.label}>
                <span className={`breakdown-dot ${item.tone}`} />
                <strong>{item.label}</strong>
                <div>
                  <i
                    style={{
                      width: `${Math.round((item.count / maxStatus) * 100)}%`,
                    }}
                  />
                </div>
                <em>{item.count}</em>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="panel metric-record-panel">
        <div className="panel-heading">
          <div>
            <h3>平台表现记录</h3>
            <p>每次手工录入单独保留，不覆盖旧记录。</p>
          </div>
          <span>{visibleMetrics.length} 条记录</span>
        </div>
        <RuleFilterBar moduleKey="analytics_metrics" fields={metricFields} rules={metricRules} onChange={setMetricRules} />
        <div className="table-wrap">
          <table className="module-table metric-record-table">
            <thead>
              <tr>
                <th>内容</th>
                <th>平台 / 账号</th>
                <th>商品</th>
                <th>播放</th>
                <th>点赞</th>
                <th>评论</th>
                <th>分享</th>
                <th>收藏</th>
                <th>录入信息</th>
              </tr>
            </thead>
            <tbody>
              {visibleMetrics.map((record) => (
                <tr key={record.id} style={{backgroundColor:employeeColor(record.uploaderUserId??record.uploaderName,record.contentColor)}}>
                  <td>
                    <strong>{record.contentTitle}</strong>
                    <small className="cell-subline">
                      上传人 {record.uploaderName}
                    </small>
                  </td>
                  <td>
                    <Badge tone="blue">{record.platform}</Badge>
                    <small className="cell-subline">
                      {record.account ?? "未分配"}
                    </small>
                  </td>
                  <td>{record.product ?? "未分配"}</td>
                  <td>{record.views.toLocaleString()}</td>
                  <td>{record.likes.toLocaleString()}</td>
                  <td>{record.comments.toLocaleString()}</td>
                  <td>{record.shares.toLocaleString()}</td>
                  <td>{record.favorites.toLocaleString()}</td>
                  <td>
                    {record.recordedOn}
                    <small className="cell-subline">{record.recordedBy}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visibleMetrics.length && (
          <div className="empty-state">当前筛选范围内还没有平台表现记录</div>
        )}
      </section>
      <section className="panel data-entry analytics-data-entry">
        <div className="panel-heading">
          <div>
            <h3>手工数据录入</h3>
            <p>只允许选择已经点亮发布灯的内容。</p>
          </div>
        </div>
        <div className="data-form">
          <div className="data-source-fields">
            <label>
              选择已发布内容
              <select
                value={metricDraft.platformContentId}
                onChange={(event) =>
                  setMetricDraft({
                    ...metricDraft,
                    platformContentId: event.target.value,
                  })
                }
              >
                <option value="">请选择</option>
                {data.published.map((item) => (
                  <option
                    value={item.platformContentId}
                    key={item.platformContentId}
                  >
                    {item.contentTitle} · {item.platform} /{" "}
                    {item.account ?? "未分配"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              发布平台
              <input
                value={
                  selectedPublished
                    ? `${selectedPublished.platform} / ${selectedPublished.account ?? "未分配"}`
                    : "选择内容后自动带出"
                }
                disabled
              />
            </label>
          </div>
          <div>
            <label>
              播放量 *
              <input
                inputMode="numeric"
                value={metricDraft.views}
                onChange={(event) =>
                  setMetricDraft({ ...metricDraft, views: event.target.value })
                }
              />
            </label>
            <label>
              点赞量
              <input
                inputMode="numeric"
                value={metricDraft.likes}
                onChange={(event) =>
                  setMetricDraft({ ...metricDraft, likes: event.target.value })
                }
              />
            </label>
            <label>
              评论量
              <input
                inputMode="numeric"
                value={metricDraft.comments}
                onChange={(event) =>
                  setMetricDraft({
                    ...metricDraft,
                    comments: event.target.value,
                  })
                }
              />
            </label>
            <label>
              分享量
              <input
                inputMode="numeric"
                value={metricDraft.shares}
                onChange={(event) =>
                  setMetricDraft({ ...metricDraft, shares: event.target.value })
                }
              />
            </label>
            <label>
              收藏量
              <input
                inputMode="numeric"
                value={metricDraft.favorites}
                onChange={(event) =>
                  setMetricDraft({
                    ...metricDraft,
                    favorites: event.target.value,
                  })
                }
              />
            </label>
          </div>
          <button
            className="primary-button"
            disabled={saving}
            onClick={() => void saveMetrics()}
          >
            {saving ? "保存中" : "保存本次数据"}
          </button>
        </div>
      </section>
    </>
  );
}

function Organization({ notify }: Pick<Props, "notify">) {
  type PermissionKey =
    | "setPublic"
    | "review"
    | "correctReview"
    | "publish"
    | "deleteVersion"
    | "baseData"
    | "manageUsers"
    | "download"
    | "transfer";
  type RoleRecord = {
    id: string;
    name: string;
    people: number;
    scope: string;
    permissions: Record<PermissionKey, boolean>;
    system?: boolean;
  };
  type EmployeeRecord = {
    id: string;
    username: string;
    name: string;
    departmentId: string;
    roleId: string;
    status: "启用" | "停用";
    firstLogin: boolean;
    lastLogin: string;
  };
  type DepartmentRecord = {
    id: string;
    name: string;
    parentId: string;
    status: "启用" | "停用";
    members: number;
  };
  const permissionCatalog: {
    key: PermissionKey;
    label: string;
    highRisk?: boolean;
  }[] = [
    { key: "setPublic", label: "设置公开", highRisk: true },
    { key: "review", label: "内容审核" },
    { key: "correctReview", label: "修正审核状态", highRisk: true },
    { key: "publish", label: "维护发布状态", highRisk: true },
    { key: "deleteVersion", label: "删除旧版本", highRisk: true },
    { key: "baseData", label: "维护基础资料" },
    { key: "manageUsers", label: "管理员工角色", highRisk: true },
    { key: "download", label: "下载原始文件", highRisk: true },
    { key: "transfer", label: "转移员工内容", highRisk: true },
  ];
  const makePermissions = (...enabled: PermissionKey[]) =>
    Object.fromEntries(
      permissionCatalog.map((item) => [item.key, enabled.includes(item.key)]),
    ) as Record<PermissionKey, boolean>;
  const [tab, setTab] = useState<"roles" | "employees" | "departments">(
    "roles",
  );
  const [roles, setRoles] = useState<RoleRecord[]>([
    {
      id: "ROLE-SUPER",
      name: "超级管理员",
      people: 2,
      scope: "全公司",
      permissions: makePermissions(
        ...permissionCatalog.map((item) => item.key),
      ),
      system: true,
    },
    {
      id: "ROLE-CONTENT",
      name: "内容管理员",
      people: 2,
      scope: "全公司",
      permissions: makePermissions(
        "setPublic",
        "deleteVersion",
        "baseData",
        "download",
        "transfer",
      ),
    },
    {
      id: "ROLE-REVIEW",
      name: "审核专员",
      people: 3,
      scope: "全公司",
      permissions: makePermissions("review"),
    },
    {
      id: "ROLE-PUBLISH",
      name: "发布专员",
      people: 4,
      scope: "全公司",
      permissions: makePermissions("publish", "download"),
    },
    {
      id: "ROLE-EMPLOYEE",
      name: "内容员工",
      people: 18,
      scope: "仅本人",
      permissions: makePermissions(),
    },
  ]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([
    {
      id: "USR-001",
      username: "admin",
      name: "系统管理员",
      departmentId: "DEP-MGT",
      roleId: "ROLE-SUPER",
      status: "启用",
      firstLogin: false,
      lastLogin: "今天 11:42",
    },
    {
      id: "USR-018",
      username: "linxiao",
      name: "林晓",
      departmentId: "DEP-CONTENT",
      roleId: "ROLE-EMPLOYEE",
      status: "启用",
      firstLogin: false,
      lastLogin: "今天 11:26",
    },
    {
      id: "USR-021",
      username: "chenyu",
      name: "陈瑜",
      departmentId: "DEP-CONTENT",
      roleId: "ROLE-EMPLOYEE",
      status: "启用",
      firstLogin: false,
      lastLogin: "今天 10:48",
    },
    {
      id: "USR-006",
      username: "reviewer",
      name: "审核专员",
      departmentId: "DEP-MGT",
      roleId: "ROLE-REVIEW",
      status: "启用",
      firstLogin: false,
      lastLogin: "今天 10:56",
    },
    {
      id: "USR-011",
      username: "publisher",
      name: "王晨",
      departmentId: "DEP-OPS",
      roleId: "ROLE-PUBLISH",
      status: "启用",
      firstLogin: true,
      lastLogin: "尚未登录",
    },
  ]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([
    {
      id: "DEP-COMPANY",
      name: "公司",
      parentId: "",
      status: "启用",
      members: 29,
    },
    {
      id: "DEP-MGT",
      name: "管理组",
      parentId: "DEP-COMPANY",
      status: "启用",
      members: 5,
    },
    {
      id: "DEP-CONTENT",
      name: "内容制作部",
      parentId: "DEP-COMPANY",
      status: "启用",
      members: 18,
    },
    {
      id: "DEP-OPS",
      name: "发布运营部",
      parentId: "DEP-COMPANY",
      status: "启用",
      members: 6,
    },
  ]);
  const [drawer, setDrawer] = useState<
    "role" | "employee" | "department" | null
  >(null);
  const [roleDraft, setRoleDraft] = useState<RoleRecord>({
    id: "",
    name: "",
    people: 0,
    scope: "仅本人",
    permissions: makePermissions(),
  });
  const [employeeDraft, setEmployeeDraft] = useState({
    id: "",
    username: "",
    name: "",
    departmentId: "DEP-CONTENT",
    roleId: "ROLE-EMPLOYEE",
    status: "启用" as "启用" | "停用",
    initialPassword: "",
  });
  const [departmentDraft, setDepartmentDraft] = useState<DepartmentRecord>({
    id: "",
    name: "",
    parentId: "DEP-COMPANY",
    status: "启用",
    members: 0,
  });
  const [disableRequest, setDisableRequest] = useState<{
    kind: "employee" | "department";
    id: string;
    label: string;
  } | null>(null);
  const departmentName = (id: string) =>
    departments.find((item) => item.id === id)?.name ?? "未分配";
  const roleName = (id: string) =>
    roles.find((item) => item.id === id)?.name ?? "未分配";
  const openRole = (role?: RoleRecord) => {
    setRoleDraft(
      role
        ? { ...role, permissions: { ...role.permissions } }
        : {
            id: "",
            name: "",
            people: 0,
            scope: "仅本人",
            permissions: makePermissions(),
          },
    );
    setDrawer("role");
  };
  const openEmployee = (employee?: EmployeeRecord) => {
    setEmployeeDraft(
      employee
        ? { ...employee, initialPassword: "" }
        : {
            id: "",
            username: "",
            name: "",
            departmentId: "DEP-CONTENT",
            roleId: "ROLE-EMPLOYEE",
            status: "启用",
            initialPassword: "",
          },
    );
    setDrawer("employee");
  };
  const openDepartment = (department?: DepartmentRecord) => {
    setDepartmentDraft(
      department
        ? { ...department }
        : {
            id: "",
            name: "",
            parentId: "DEP-COMPANY",
            status: "启用",
            members: 0,
          },
    );
    setDrawer("department");
  };
  const saveDrawer = () => {
    if (drawer === "role") {
      if (!roleDraft.name.trim()) {
        notify("请填写角色名称");
        return;
      }
      if (roleDraft.id)
        setRoles(
          roles.map((item) => (item.id === roleDraft.id ? roleDraft : item)),
        );
      else setRoles([...roles, { ...roleDraft, id: `ROLE-${Date.now()}` }]);
      notify("角色权限和数据范围已保存，后续接口将读取同一配置");
    }
    if (drawer === "employee") {
      if (!employeeDraft.username.trim() || !employeeDraft.name.trim()) {
        notify("请填写登录账号和员工姓名");
        return;
      }
      if (!employeeDraft.id && !employeeDraft.initialPassword.trim()) {
        notify("请设置初始密码");
        return;
      }
      if (employeeDraft.id)
        setEmployees(
          employees.map((item) =>
            item.id === employeeDraft.id
              ? {
                  ...item,
                  ...employeeDraft,
                  firstLogin: item.firstLogin,
                  lastLogin: item.lastLogin,
                }
              : item,
          ),
        );
      else {
        setEmployees([
          ...employees,
          {
            id: `USR-${Date.now()}`,
            username: employeeDraft.username.trim(),
            name: employeeDraft.name.trim(),
            departmentId: employeeDraft.departmentId,
            roleId: employeeDraft.roleId,
            status: employeeDraft.status,
            firstLogin: true,
            lastLogin: "尚未登录",
          },
        ]);
        setRoles(
          roles.map((role) =>
            role.id === employeeDraft.roleId
              ? { ...role, people: role.people + 1 }
              : role,
          ),
        );
      }
      notify(
        employeeDraft.id
          ? "员工账号资料已保存"
          : "员工账号已创建，首次登录必须修改密码",
      );
    }
    if (drawer === "department") {
      if (!departmentDraft.name.trim()) {
        notify("请填写部门名称");
        return;
      }
      if (departmentDraft.id)
        setDepartments(
          departments.map((item) =>
            item.id === departmentDraft.id ? departmentDraft : item,
          ),
        );
      else
        setDepartments([
          ...departments,
          { ...departmentDraft, id: `DEP-${Date.now()}` },
        ]);
      notify("部门资料已保存");
    }
    setDrawer(null);
  };
  const applyDisable = () => {
    if (!disableRequest) return;
    if (disableRequest.kind === "employee")
      setEmployees(
        employees.map((item) =>
          item.id === disableRequest.id ? { ...item, status: "停用" } : item,
        ),
      );
    else
      setDepartments(
        departments.map((item) =>
          item.id === disableRequest.id ? { ...item, status: "停用" } : item,
        ),
      );
    notify(`${disableRequest.label}已停用，历史上传、审核和发布记录继续保留`);
    setDisableRequest(null);
  };
  const headerAction =
    tab === "roles"
      ? "新建角色"
      : tab === "employees"
        ? "创建员工账号"
        : "新建部门";
  return (
    <>
      <ModuleHeader
        title="组织与权限"
        description="角色、权限项和数据范围均为配置数据；员工只引用一个角色，后期调整不需要修改业务流程。"
        action={headerAction}
        onAction={() =>
          tab === "roles"
            ? openRole()
            : tab === "employees"
              ? openEmployee()
              : openDepartment()
        }
      />
      <div className="permission-safety-note">
        <span>♙</span>
        <div>
          <strong>权限必须在接口层校验</strong>
          <p>
            页面隐藏只能改善操作体验，不能代替数据权限；后续所有列表、详情、下载和状态修改接口均按角色与数据范围过滤。
          </p>
        </div>
      </div>
      <section className="panel module-panel">
        <div className="org-tabs">
          <button
            className={tab === "roles" ? "selected" : ""}
            onClick={() => setTab("roles")}
          >
            角色权限
          </button>
          <button
            className={tab === "employees" ? "selected" : ""}
            onClick={() => setTab("employees")}
          >
            员工账号
          </button>
          <button
            className={tab === "departments" ? "selected" : ""}
            onClick={() => setTab("departments")}
          >
            部门管理
          </button>
        </div>
        {tab === "roles" && (
          <>
            <div className="org-toolbar-note">
              <span>
                第一版每名员工只选择一个角色；特殊权限通过新建组合角色处理。
              </span>
              <strong>{roles.length} 个角色</strong>
            </div>
            <div className="table-wrap">
              <table className="permission-table">
                <thead>
                  <tr>
                    <th>角色</th>
                    <th>成员</th>
                    <th>数据范围</th>
                    {permissionCatalog.map((permission) => (
                      <th
                        key={permission.key}
                        className={permission.highRisk ? "high-risk" : ""}
                      >
                        {permission.label}
                      </th>
                    ))}
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={role.id}>
                      <td>
                        <strong>{role.name}</strong>
                        {role.system && (
                          <small className="cell-subline">系统内置角色</small>
                        )}
                      </td>
                      <td>{role.people} 人</td>
                      <td>
                        <Badge tone="blue">{role.scope}</Badge>
                      </td>
                      {permissionCatalog.map((permission) => (
                        <td key={permission.key}>
                          <span
                            className={
                              role.permissions[permission.key]
                                ? "permission yes"
                                : "permission no"
                            }
                          >
                            {role.permissions[permission.key] ? "✓" : "—"}
                          </span>
                        </td>
                      ))}
                      <td>
                        <button
                          className="table-action"
                          onClick={() => openRole(role)}
                        >
                          配置权限
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === "employees" && (
          <>
            <div className="org-toolbar-note">
              <span>管理员统一创建账号；停用账号不会删除员工历史记录。</span>
              <strong>
                {employees.filter((item) => item.status === "启用").length}{" "}
                个启用账号
              </strong>
            </div>
            <div className="table-wrap">
              <table className="module-table employee-table">
                <thead>
                  <tr>
                    <th>员工</th>
                    <th>登录账号</th>
                    <th>所属部门</th>
                    <th>角色</th>
                    <th>账号状态</th>
                    <th>首次改密</th>
                    <th>最后登录</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id}>
                      <td>
                        <span className="mini-avatar">{employee.name[0]}</span>
                        <strong>{employee.name}</strong>
                      </td>
                      <td>
                        <code>{employee.username}</code>
                      </td>
                      <td>{departmentName(employee.departmentId)}</td>
                      <td>
                        <Badge tone="blue">{roleName(employee.roleId)}</Badge>
                      </td>
                      <td>
                        <Badge
                          tone={employee.status === "启用" ? "green" : "slate"}
                        >
                          {employee.status}
                        </Badge>
                      </td>
                      <td>
                        {employee.firstLogin ? (
                          <span className="first-login">待修改</span>
                        ) : (
                          "已完成"
                        )}
                      </td>
                      <td>{employee.lastLogin}</td>
                      <td>
                        <div className="employee-actions">
                          <button onClick={() => openEmployee(employee)}>
                            编辑
                          </button>
                          {employee.status === "启用" ? (
                            <button
                              className="danger"
                              onClick={() =>
                                setDisableRequest({
                                  kind: "employee",
                                  id: employee.id,
                                  label: employee.name,
                                })
                              }
                            >
                              停用
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                setEmployees(
                                  employees.map((item) =>
                                    item.id === employee.id
                                      ? { ...item, status: "启用" }
                                      : item,
                                  ),
                                )
                              }
                            >
                              启用
                            </button>
                          )}
                          <button
                            onClick={() =>
                              notify(`已为${employee.name}生成密码重置流程`)
                            }
                          >
                            重置密码
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === "departments" && (
          <>
            <div className="org-toolbar-note">
              <span>
                公司、部门和小组使用同一层级结构；部门下仍有员工时不能删除，只能停用。
              </span>
              <strong>{departments.length} 个组织节点</strong>
            </div>
            <div className="department-list">
              {departments.map((department, index) => {
                const parent = departments.find(
                  (item) => item.id === department.parentId,
                );
                return (
                  <article
                    className={`department-row ${department.status === "停用" ? "disabled" : ""}`}
                    key={department.id}
                  >
                    <span
                      className="department-depth"
                      style={{
                        marginLeft: `${department.parentId ? 22 : 0}px`,
                      }}
                    >
                      {department.parentId ? "↳" : "▣"}
                    </span>
                    <div>
                      <strong>{department.name}</strong>
                      <small>
                        {parent ? `上级：${parent.name}` : "公司根节点"} ·{" "}
                        {department.members} 名员工
                      </small>
                    </div>
                    <Badge
                      tone={department.status === "启用" ? "green" : "slate"}
                    >
                      {department.status}
                    </Badge>
                    <button onClick={() => openDepartment(department)}>
                      编辑
                    </button>
                    {department.status === "启用" && index > 0 ? (
                      <button
                        className="danger"
                        onClick={() =>
                          setDisableRequest({
                            kind: "department",
                            id: department.id,
                            label: department.name,
                          })
                        }
                      >
                        停用
                      </button>
                    ) : department.status === "停用" ? (
                      <button
                        onClick={() =>
                          setDepartments(
                            departments.map((item) =>
                              item.id === department.id
                                ? { ...item, status: "启用" }
                                : item,
                            ),
                          )
                        }
                      >
                        启用
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
      {drawer && (
        <div className="settings-drawer-backdrop">
          <aside
            className={`settings-drawer permission-drawer ${drawer === "role" ? "wide" : ""}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drawer-head">
              <div>
                <small>
                  {drawer === "role"
                    ? "角色配置"
                    : drawer === "employee"
                      ? "员工账号"
                      : "组织架构"}
                </small>
                <h3>
                  {drawer === "role"
                    ? roleDraft.id
                      ? "编辑角色"
                      : "新建角色"
                    : drawer === "employee"
                      ? employeeDraft.id
                        ? "编辑员工"
                        : "创建员工账号"
                      : departmentDraft.id
                        ? "编辑部门"
                        : "新建部门"}
                </h3>
              </div>
              <small className="drawer-exit-hint">请使用底部“取消”或“保存”</small>
            </div>
            <div className="settings-form">
              {drawer === "role" && (
                <>
                  <label>
                    <span>角色名称 *</span>
                    <input
                      value={roleDraft.name}
                      onChange={(event) =>
                        setRoleDraft({ ...roleDraft, name: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>数据可见范围</span>
                    <select
                      value={roleDraft.scope}
                      onChange={(event) =>
                        setRoleDraft({
                          ...roleDraft,
                          scope: event.target.value,
                        })
                      }
                    >
                      <option>仅本人</option>
                      <option>本部门</option>
                      <option>本部门及下级部门</option>
                      <option>全公司</option>
                    </select>
                  </label>
                  <div className="permission-checklist">
                    <div>
                      <strong>操作权限</strong>
                      <small>带“高风险”标记的操作会写入操作日志。</small>
                    </div>
                    {permissionCatalog.map((permission) => (
                      <label key={permission.key}>
                        <input
                          type="checkbox"
                          checked={roleDraft.permissions[permission.key]}
                          onChange={(event) =>
                            setRoleDraft({
                              ...roleDraft,
                              permissions: {
                                ...roleDraft.permissions,
                                [permission.key]: event.target.checked,
                              },
                            })
                          }
                        />
                        <span>
                          {permission.label}
                          {permission.highRisk && <em>高风险</em>}
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              )}
              {drawer === "employee" && (
                <>
                  <label>
                    <span>登录账号 *</span>
                    <input
                      value={employeeDraft.username}
                      onChange={(event) =>
                        setEmployeeDraft({
                          ...employeeDraft,
                          username: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>员工姓名 *</span>
                    <input
                      value={employeeDraft.name}
                      onChange={(event) =>
                        setEmployeeDraft({
                          ...employeeDraft,
                          name: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>所属部门</span>
                    <select
                      value={employeeDraft.departmentId}
                      onChange={(event) =>
                        setEmployeeDraft({
                          ...employeeDraft,
                          departmentId: event.target.value,
                        })
                      }
                    >
                      {departments
                        .filter((item) => item.status === "启用")
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    <span>所属角色</span>
                    <select
                      value={employeeDraft.roleId}
                      onChange={(event) =>
                        setEmployeeDraft({
                          ...employeeDraft,
                          roleId: event.target.value,
                        })
                      }
                    >
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name} · {role.scope}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!employeeDraft.id && (
                    <label>
                      <span>初始密码 *</span>
                      <input
                        type="password"
                        value={employeeDraft.initialPassword}
                        onChange={(event) =>
                          setEmployeeDraft({
                            ...employeeDraft,
                            initialPassword: event.target.value,
                          })
                        }
                        placeholder="首次登录后必须修改"
                      />
                    </label>
                  )}
                  <label>
                    <span>账号状态</span>
                    <select
                      value={employeeDraft.status}
                      onChange={(event) =>
                        setEmployeeDraft({
                          ...employeeDraft,
                          status: event.target.value as "启用" | "停用",
                        })
                      }
                    >
                      <option>启用</option>
                      <option>停用</option>
                    </select>
                  </label>
                </>
              )}
              {drawer === "department" && (
                <>
                  <label>
                    <span>部门或小组名称 *</span>
                    <input
                      value={departmentDraft.name}
                      onChange={(event) =>
                        setDepartmentDraft({
                          ...departmentDraft,
                          name: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>上级组织</span>
                    <select
                      value={departmentDraft.parentId}
                      onChange={(event) =>
                        setDepartmentDraft({
                          ...departmentDraft,
                          parentId: event.target.value,
                        })
                      }
                    >
                      <option value="">无上级</option>
                      {departments
                        .filter(
                          (item) =>
                            item.id !== departmentDraft.id &&
                            item.status === "启用",
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    <span>组织状态</span>
                    <select
                      value={departmentDraft.status}
                      onChange={(event) =>
                        setDepartmentDraft({
                          ...departmentDraft,
                          status: event.target.value as "启用" | "停用",
                        })
                      }
                    >
                      <option>启用</option>
                      <option>停用</option>
                    </select>
                  </label>
                </>
              )}
            </div>
            <div className="drawer-actions">
              <button onClick={() => setDrawer(null)}>取消</button>
              <button className="primary-button" onClick={saveDrawer}>
                保存
              </button>
            </div>
          </aside>
        </div>
      )}
      {disableRequest && (
        <div className="modal-backdrop confirm-layer">
          <div className="modal confirm-modal">
            <div className="confirm-icon">!</div>
            <h3>确认停用“{disableRequest.label}”？</h3>
            <p>
              停用后不能继续登录或用于新业务，但历史上传、审核、发布和操作日志继续保留。
            </p>
            <div className="confirm-actions">
              <button onClick={() => setDisableRequest(null)}>取消</button>
              <button className="danger-confirm" onClick={applyDisable}>
                确认停用
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

type AdminData = {
  currentUserId: number;
  currentRoleCode: string;
  canManageSensitiveAccounts: boolean;
  canManageUsers?:boolean;
  canManageRoles?:boolean;
  canManageDepartments?:boolean;
  canManageGroups?:boolean;
  canManageGroupMembers?:boolean;
  roles: Array<{
    id: number;
    code: string;
    name: string;
    dataScope: string;
    permissions: string[];
    people: number;
  }>;
  departments: Array<{
    id: number;
    name: string;
    parentId: number | null;
    members: number;
  }>;
  accounts:Array<{id:number;code:string;name:string;platformName:string;status:string}>;
  groups:Array<{id:number;code:string;name:string;accountId:number|null;accountName:string|null;departmentId:number|null;coverPath:string|null;themeColor:string|null;description:string|null;businessDirection:string|null;status:string;leaderUserId:number|null;members:number;settings:Record<string,unknown>}>;
  users: Array<{
    id: number;
    username: string;
    displayName: string;
    departmentId: number | null;
    departmentName: string | null;
    primaryGroupId:number|null;
    groupScopes:Record<string,number[]>;
    accountResponsibilities:Record<string,number[]>;
    permissionGrants:string[];
    permissionDenies:string[];
    roleId: number;
    roleName: string;
    status: string;
    mustChangePassword: boolean;
    lastLoginAt: string | null;
    contentColor?:string|null;
  }>;
};
const adminPermissionCatalog = permissionGroups.flatMap(
  (group) => group.permissions,
);

function OrganizationLive({ notify }: Pick<Props, "notify">) {
  const empty: AdminData = {
    currentUserId: 0,
    currentRoleCode: "",
    canManageSensitiveAccounts: false,
    roles: [],
    departments: [],
    accounts:[],
    groups:[],
    users: [],
  };
  const [data, setData] = useState<AdminData>(empty);
  const [tab, setTab] = useState<"organization"|"roles" | "employees">(
    "organization",
  );
  const [drawer, setDrawer] = useState<"role" | "user" | "department" | "group" | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [roleDraft, setRoleDraft] = useState({
    id: 0,
    name: "",
    dataScope: "self",
    permissions: [] as string[],
  });
  const [userDraft, setUserDraft] = useState({
    id: 0,
    username: "",
    displayName: "",
    departmentId: "",
    primaryGroupId:"",
    viewGroups:[] as number[],uploadGroups:[] as number[],reviewGroups:[] as number[],
    materialUploadAccounts:[] as number[],materialReviewAccounts:[] as number[],publishingAccounts:[] as number[],
    permissionGrants:[] as string[],permissionDenies:[] as string[],
    roleId: "",
    status: "active",
    password: "",
    contentColor:"",
  });
  const [departmentDraft, setDepartmentDraft] = useState({
    id: 0,
    name: "",
    parentId: "",
  });
  const [groupDraft,setGroupDraft]=useState({id:0,name:"",code:"",accountId:"",departmentId:"",themeColor:"#64748b",description:"",businessDirection:"",leaderUserId:"",status:"active"});
  const [toggleUser, setToggleUser] = useState<
    AdminData["users"][number] | null
  >(null);
  const [roleRules, setRoleRules] = useState<SmartFilterRule[]>([]);
  const [userRules, setUserRules] = useState<SmartFilterRule[]>([]);
  const [departmentRules, setDepartmentRules] = useState<SmartFilterRule[]>([]);
  const roleFields = useMemo<SmartFilterField<AdminData["roles"][number]>[]>(() => [
    { key: "query", label: "角色名称/编号", type: "text", getValue: (item) => [item.name, item.code] },
    { key: "people", label: "成员数", type: "number", getValue: (item) => item.people },
    { key: "dataScope", label: "数据范围", type: "select", options: [{ value: "company", label: "全公司" }, { value: "self", label: "仅本人" }], getValue: (item) => item.dataScope },
    { key: "permission", label: "具体权限", type: "select", options: permissionKeys.map((value) => ({ value, label: adminPermissionCatalog.find((item) => item.key === value)?.label ?? value })), getValue: (item) => item.permissions.includes("*") ? permissionKeys : item.permissions },
  ], []);
  const userFields = useMemo<SmartFilterField<AdminData["users"][number]>[]>(() => [
    { key: "query", label: "员工/登录账号", type: "text", getValue: (item) => [item.displayName, item.username] },
    { key: "department", label: "部门", type: "select", options: [...new Set(data.users.map((item) => item.departmentName ?? "未分配"))].map((value) => ({ value, label: value })), getValue: (item) => item.departmentName ?? "未分配" },
    { key: "role", label: "角色", type: "select", options: [...new Set(data.users.map((item) => item.roleName))].map((value) => ({ value, label: value })), getValue: (item) => item.roleName },
    { key: "status", label: "账号状态", type: "select", options: [{ value: "active", label: "启用" }, { value: "inactive", label: "停用" }], getValue: (item) => item.status },
    { key: "mustChangePassword", label: "首次改密", type: "select", options: [{ value: "是", label: "待修改" }, { value: "否", label: "已完成" }], getValue: (item) => item.mustChangePassword ? "是" : "否" },
    { key: "lastLoginAt", label: "最后登录", type: "date", getValue: (item) => item.lastLoginAt },
  ], [data.users]);
  const departmentFields = useMemo<SmartFilterField<AdminData["departments"][number]>[]>(() => [
    { key: "query", label: "部门名称", type: "text", getValue: (item) => item.name },
    { key: "parent", label: "上级部门", type: "select", options: data.departments.map((item) => ({ value: String(item.id), label: item.name })), getValue: (item) => item.parentId === null ? "根部门" : String(item.parentId) },
    { key: "members", label: "成员数", type: "number", getValue: (item) => item.members },
  ], [data.departments]);
  const visibleRoles = useMemo(() => applySmartFilters(data.roles, roleRules, roleFields), [data.roles, roleRules, roleFields]);
  const visibleUsers = useMemo(() => applySmartFilters(data.users, userRules, userFields), [data.users, userRules, userFields]);
  const visibleDepartments = useMemo(() => applySmartFilters(data.departments, departmentRules, departmentFields), [data.departments, departmentRules, departmentFields]);
  const automaticDutyPermissions=useMemo(()=>new Set(dutyPermissions({
    primaryGroupId:Number(userDraft.primaryGroupId)||null,
    groupScopes:{view:userDraft.viewGroups,upload:userDraft.uploadGroups,review:userDraft.reviewGroups},
    accountResponsibilities:{materialUpload:userDraft.materialUploadAccounts,materialReview:userDraft.materialReviewAccounts,publishing:userDraft.publishingAccounts},
  })),[userDraft.primaryGroupId,userDraft.viewGroups,userDraft.uploadGroups,userDraft.reviewGroups,userDraft.materialUploadAccounts,userDraft.materialReviewAccounts,userDraft.publishingAccounts]);
  const load = async () => {
    const response = await fetch("/api/admin", { cache: "no-store" });
    if (!response.ok) return;
    setData((await response.json()) as AdminData);
  };
  useEffect(() => {
    void load();
  }, []);
  const openRole = (item?: AdminData["roles"][number]) => {
    setRoleDraft(
      item
        ? {
            id: item.id,
            name: item.name,
            dataScope: item.dataScope,
            permissions: item.permissions.includes("*")
              ? [...permissionKeys]
              : item.permissions,
          }
        : { id: 0, name: "", dataScope: "self", permissions: [] },
    );
    setDrawer("role");
  };
  const openUser = (item?: AdminData["users"][number]) => {
    setUserDraft(
      item
        ? {
            id: item.id,
            username: item.username,
            displayName: item.displayName,
            departmentId: String(item.departmentId ?? ""),
            primaryGroupId:String(item.primaryGroupId??""),viewGroups:item.groupScopes.view??[],uploadGroups:item.groupScopes.upload??[],reviewGroups:item.groupScopes.review??[],
            materialUploadAccounts:item.accountResponsibilities.materialUpload??[],materialReviewAccounts:item.accountResponsibilities.materialReview??[],publishingAccounts:item.accountResponsibilities.publishing??[],
            permissionGrants:item.permissionGrants??[],permissionDenies:item.permissionDenies??[],
            roleId: String(item.roleId),
            status: item.status,
            password: "",
            contentColor:item.contentColor??"",
          }
        : {
            id: 0,
            username: "",
            displayName: "",
            departmentId: String(data.departments[0]?.id ?? ""),
            primaryGroupId:String(data.groups[0]?.id??""),viewGroups:[],uploadGroups:data.groups[0]?[data.groups[0].id]:[],reviewGroups:[],
            materialUploadAccounts:[],materialReviewAccounts:[],publishingAccounts:[],
            permissionGrants:[],permissionDenies:[],
            roleId: String(data.roles[0]?.id ?? ""),
            status: "active",
            password: "",
            contentColor:"",
          },
    );
    setDrawer("user");
  };
  const openDepartment = (item?: AdminData["departments"][number]) => {
    setDepartmentDraft(
      item
        ? {
            id: item.id,
            name: item.name,
            parentId: String(item.parentId ?? ""),
          }
        : { id: 0, name: "", parentId: "" },
    );
    setDrawer("department");
  };
  const openGroup=(item?:AdminData["groups"][number])=>{setGroupDraft(item?{id:item.id,name:item.name,code:item.code,accountId:String(item.accountId??""),departmentId:String(item.departmentId??""),themeColor:item.themeColor??"#64748b",description:item.description??"",businessDirection:item.businessDirection??"",leaderUserId:String(item.leaderUserId??""),status:item.status}:{id:0,name:"",code:"",accountId:String(data.accounts.find(account=>account.status==="active")?.id??""),departmentId:"",themeColor:"#64748b",description:"",businessDirection:"",leaderUserId:"",status:"active"});setDrawer("group");};
  const save = async () => {
    if (!drawer) return;
    const draft =
      drawer === "role"
        ? { entity: "role", ...roleDraft }
        : drawer === "user"
          ? {
              entity: "user",
              ...userDraft,
              roleId: Number(userDraft.roleId),
              departmentId: Number(userDraft.departmentId) || null,
              primaryGroupId:Number(userDraft.primaryGroupId)||null,groupScopes:{view:userDraft.viewGroups,upload:userDraft.uploadGroups,review:userDraft.reviewGroups},accountResponsibilities:{materialUpload:userDraft.materialUploadAccounts,materialReview:userDraft.materialReviewAccounts,publishing:userDraft.publishingAccounts},
              permissionGrants:userDraft.permissionGrants,permissionDenies:userDraft.permissionDenies.filter(key=>!automaticDutyPermissions.has(key)),
            }
          : drawer === "group" ? {entity:"group",...groupDraft,accountId:Number(groupDraft.accountId)||null,departmentId:Number(groupDraft.departmentId)||null,leaderUserId:Number(groupDraft.leaderUserId)||null}
          : {
              entity: "department",
              ...departmentDraft,
              parentId: Number(departmentDraft.parentId) || null,
            };
    if (
      ("name" in draft && !String(draft.name).trim()) ||
      (drawer === "user" &&
        (!userDraft.username.trim() ||
          !userDraft.displayName.trim() ||
          (!userDraft.id && userDraft.password.length < 8)))
    ) {
      notify(
        drawer === "user" ? "请填写账号、姓名和至少8位初始密码" : "请填写名称",
      );
      return;
    }
    setSaving(true);
    try {
      const id = "id" in draft ? Number(draft.id) : 0;
      const response = await fetch("/api/admin", {
        method: id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "保存失败");
      await load();
      setDrawer(null);
      notify(id ? "资料已保存并立即生效" : "资料已创建并立即生效");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };
  const applyToggle = async () => {
    if (!toggleUser) return;
    const response = await fetch("/api/admin", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entity: "user",
        id: toggleUser.id,
        displayName: toggleUser.displayName,
        roleId: toggleUser.roleId,
        departmentId: toggleUser.departmentId,
        status: toggleUser.status === "active" ? "inactive" : "active",
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      notify(result.error ?? "账号状态更新失败");
      return;
    }
    await load();
    notify(`${toggleUser.displayName}的账号状态已更新`);
    setToggleUser(null);
  };
  const action =
    tab === "roles"
      ? data.canManageRoles ? "新建角色" : ""
      : tab === "employees"
        ? data.canManageUsers ? "创建员工账号" : ""
        : data.canManageGroups ? "新建内容小组" : "";
  return (
    <>
      
      <ModuleHeader
        title="组织与权限"
        description=""
        action={action}
        onAction={() =>
          tab === "roles"
            ? openRole()
            : tab === "employees"
              ? openUser()
              : openGroup()
        }
      />
      <section className="panel module-panel">
        <div className="org-tabs">
          <button className={tab === "organization" ? "selected" : ""} onClick={() => setTab("organization")}>组织架构与小组</button>
          <button
            className={tab === "roles" ? "selected" : ""}
            onClick={() => setTab("roles")}
          >
            角色权限
          </button>
          <button
            className={tab === "employees" ? "selected" : ""}
            onClick={() => setTab("employees")}
          >
            员工账号
          </button>
        </div>
        {tab === "roles" && (
          <>
            <RuleFilterBar moduleKey="roles" fields={roleFields} rules={roleRules} onChange={setRoleRules} />
            <div className="org-toolbar-note">
              <span>表格按模块汇总；点击“配置权限”后可精确勾选具体操作。</span>
              <strong>{data.roles.length} 个角色</strong>
            </div>
            <div className="table-wrap">
              <table className="permission-table grouped">
                <thead>
                  <tr>
                    <th>角色</th>
                    <th>成员</th>
                    <th>数据范围</th>
                    {permissionGroups.map((group) => (
                      <th key={group.key}>{group.label}</th>
                    ))}
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRoles.map((role) => (
                    <tr key={role.id}>
                      <td>
                        <strong>{role.name}</strong>
                        {role.code === "super_admin" && (
                          <small className="cell-subline">系统角色</small>
                        )}
                      </td>
                      <td>{role.people} 人</td>
                      <td>
                        <Badge tone="blue">
                          {role.dataScope === "company" ? "全公司" : "仅本人"}
                        </Badge>
                      </td>
                      {permissionGroups.map((group) => {
                        const count = role.permissions.includes("*")
                          ? group.permissions.length
                          : group.permissions.filter((item) =>
                              role.permissions.includes(item.key),
                            ).length;
                        return (
                          <td key={group.key}>
                            <span
                              className={
                                count
                                  ? "permission-summary active"
                                  : "permission-summary"
                              }
                            >
                              {count}/{group.permissions.length}
                            </span>
                          </td>
                        );
                      })}
                      <td>
                        {data.canManageRoles ? <button
                          className="table-action"
                          onClick={() => openRole(role)}
                        >
                          配置权限
                        </button> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === "employees" && (
          <>
            <RuleFilterBar moduleKey="employees" fields={userFields} rules={userRules} onChange={setUserRules} />
            <div className="org-toolbar-note">
              <span>
                新账号首次登录必须修改密码；重置密码也会重新触发首次改密。
              </span>
              <strong>
                {data.users.filter((item) => item.status === "active").length}{" "}
                个启用账号
              </strong>
            </div>
            <div className="table-wrap">
              <table className="module-table employee-table">
                <thead>
                  <tr>
                    <th>员工</th>
                    <th>登录账号</th>
                    <th>部门</th>
                    <th>角色</th>
                    <th>主小组</th>
                    <th>状态</th>
                    <th>首次改密</th>
                    <th>最后登录</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <span className="mini-avatar">
                          {user.displayName[0]}
                        </span>
                        <strong>{user.displayName}</strong>
                      </td>
                      <td>
                        <code>{user.username}</code>
                      </td>
                      <td>{user.departmentName ?? "未分配"}</td>
                      <td>
                        <Badge tone="blue">{user.roleName}</Badge>
                      </td>
                      <td>{data.groups.find(group=>group.id===user.primaryGroupId)?.name??"未分配"}</td>
                      <td>
                        <Badge
                          tone={user.status === "active" ? "green" : "slate"}
                        >
                          {user.status === "active" ? "启用" : "停用"}
                        </Badge>
                      </td>
                      <td>{user.mustChangePassword ? "待修改" : "已完成"}</td>
                      <td>
                        {user.lastLoginAt
                          ? new Date(user.lastLoginAt).toLocaleString("zh-CN")
                          : "尚未登录"}
                      </td>
                      <td>
                        {data.canManageUsers ? <div className="employee-actions">
                          <button onClick={() => openUser(user)}>
                            配置账号
                          </button>
                          <button
                            disabled={user.id === data.currentUserId}
                            className={user.status === "active" ? "danger" : ""}
                            onClick={() => setToggleUser(user)}
                          >
                            {user.status === "active" ? "停用" : "启用"}
                          </button>
                        </div> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab==="organization"&&<div className="organization-combined"><header><div><h3>内容小组</h3><span>{data.groups.filter(item=>item.status==="active").length} 个启用小组</span></div>{data.canManageDepartments?<button onClick={()=>openDepartment()}>＋ 新建部门</button>:null}</header><div className="department-list">{data.groups.map(group=><article className="department-row" key={group.id} style={{borderLeft:`8px solid ${group.themeColor??"#64748b"}`}}><span className="mini-avatar" style={{background:group.themeColor??"#64748b"}}>{group.name[0]}</span><div><strong>{group.name}</strong><small>{group.accountName??"账号待归类"} · {group.code} · {group.businessDirection||"未填写业务方向"} · {group.members} 名成员 · 负责人：{data.users.find(user=>user.id===group.leaderUserId)?.displayName??"未设置"}</small></div><Badge tone={group.status==="active"?"green":"slate"}>{group.status==="active"?"启用":"停用"}</Badge>{data.canManageGroups?<button onClick={()=>openGroup(group)}>配置</button>:null}</article>)}</div></div>}
        {tab === "organization" && (
          <>
            <RuleFilterBar moduleKey="departments" fields={departmentFields} rules={departmentRules} onChange={setDepartmentRules} />
            <div className="organization-combined"><header><div><h3>部门结构</h3><span>{data.departments.length} 个组织节点</span></div></header>
            <div className="department-list">
              {visibleDepartments.map((department) => (
                <article className="department-row" key={department.id}>
                  <span className="department-depth">
                    {department.parentId ? "↳" : "▣"}
                  </span>
                  <div>
                    <strong>{department.name}</strong>
                    <small>
                      {department.parentId
                        ? `上级：${data.departments.find((item) => item.id === department.parentId)?.name ?? "未知"}`
                        : "公司根节点"}{" "}
                      · {department.members} 名员工
                    </small>
                  </div>
                  {data.canManageDepartments ? <button onClick={() => openDepartment(department)}>
                    编辑
                  </button> : null}
                </article>
              ))}
            </div></div>
          </>
        )}
      </section>
      {drawer && (
        <div className="settings-drawer-backdrop">
          <aside
            className={`settings-drawer permission-drawer ${drawer === "role" ? "wide" : ""}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drawer-head">
              <div>
                <small>组织与权限</small>
                <h3>
                  {drawer === "role"
                    ? roleDraft.id
                      ? "编辑角色"
                      : "新建角色"
                    : drawer === "user"
                      ? userDraft.id
                        ? "编辑员工账号"
                        : "创建员工账号"
                      : drawer === "group"
                        ? groupDraft.id
                          ? "编辑内容小组"
                          : "新建内容小组"
                      : departmentDraft.id
                        ? "编辑部门"
                        : "新建部门"}
                </h3>
              </div>
              <small className="drawer-exit-hint">请使用底部“取消”或“保存”</small>
            </div>
            <div className="settings-form">
              {drawer === "role" && (
                <>
                  <label>
                    <span>角色名称 *</span>
                    <input
                      value={roleDraft.name}
                      onChange={(event) =>
                        setRoleDraft({ ...roleDraft, name: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>数据范围</span>
                    <select
                      value={roleDraft.dataScope}
                      disabled={
                        data.roles.find((item) => item.id === roleDraft.id)
                          ?.code === "super_admin"
                      }
                      onChange={(event) =>
                        setRoleDraft({
                          ...roleDraft,
                          dataScope: event.target.value,
                        })
                      }
                    >
                      <option value="self">仅本人</option>
                      <option value="company">全公司</option>
                    </select>
                  </label>
                  <div className="permission-checklist grouped">
                    {permissionGroups.map((group) => {
                      const keys = group.permissions.map((item) => item.key);
                      const all = keys.every((key) =>
                        roleDraft.permissions.includes(key),
                      );
                      const readonly = keys.find((key) =>
                        key.endsWith(".view"),
                      );
                      const disabled =
                        data.roles.find((item) => item.id === roleDraft.id)
                          ?.code === "super_admin";
                      return (
                        <section className="permission-group" key={group.key}>
                          <div className="permission-group-head">
                            <div>
                              <strong>{group.label}</strong>
                              <small>
                                {
                                  keys.filter((key) =>
                                    roleDraft.permissions.includes(key),
                                  ).length
                                }
                                /{keys.length} 项已选择
                              </small>
                            </div>
                            <div>
                              <button
                                type="button"
                                disabled={disabled || !readonly}
                                onClick={() =>
                                  readonly &&
                                  setRoleDraft({
                                    ...roleDraft,
                                    permissions: [
                                      ...new Set([
                                        ...roleDraft.permissions.filter(
                                          (key) => !keys.includes(key),
                                        ),
                                        readonly,
                                      ]),
                                    ],
                                  })
                                }
                              >
                                只读
                              </button>
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() =>
                                  setRoleDraft({
                                    ...roleDraft,
                                    permissions: all
                                      ? roleDraft.permissions.filter(
                                          (key) => !keys.includes(key),
                                        )
                                      : [
                                          ...new Set([
                                            ...roleDraft.permissions,
                                            ...keys,
                                          ]),
                                        ],
                                  })
                                }
                              >
                                {all ? "清空" : "全选"}
                              </button>
                            </div>
                          </div>
                          {group.permissions.map((permission) => (
                            <label key={permission.key}>
                              <input
                                type="checkbox"
                                disabled={disabled}
                                checked={roleDraft.permissions.includes(
                                  permission.key,
                                )}
                                onChange={(event) =>
                                  setRoleDraft({
                                    ...roleDraft,
                                    permissions: event.target.checked
                                      ? [
                                          ...roleDraft.permissions,
                                          permission.key,
                                        ]
                                      : roleDraft.permissions.filter(
                                          (item) => item !== permission.key,
                                        ),
                                  })
                                }
                              />
                              <span>
                                <strong>
                                  {permission.label}
                                  {permission.highRisk && <em>高风险</em>}
                                </strong>
                                <small>{permission.description}</small>
                              </span>
                            </label>
                          ))}
                        </section>
                      );
                    })}
                  </div>
                </>
              )}
              {drawer === "user" && (
                <>
                  <label>
                    <span>登录账号 *</span>
                    <input
                      disabled={Boolean(userDraft.id)}
                      value={userDraft.username}
                      onChange={(event) =>
                        setUserDraft({
                          ...userDraft,
                          username: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>员工姓名 *</span>
                    <input
                      disabled={Boolean(userDraft.id) && !data.canManageSensitiveAccounts}
                      value={userDraft.displayName}
                      onChange={(event) =>
                        setUserDraft({
                          ...userDraft,
                          displayName: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>部门</span>
                    <select
                      value={userDraft.departmentId}
                      onChange={(event) =>
                        setUserDraft({
                          ...userDraft,
                          departmentId: event.target.value,
                        })
                      }
                    >
                      <option value="">未分配</option>
                      {data.departments.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>角色 *</span>
                    <select
                      value={userDraft.roleId}
                      onChange={(event) =>
                        setUserDraft({
                          ...userDraft,
                          roleId: event.target.value,
                        })
                      }
                    >
                      {data.roles.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(!userDraft.id || data.canManageSensitiveAccounts) && <label>
                    <span>{userDraft.id ? "重置密码（不修改可留空）" : "初始密码 *"}</span>
                    <input type="password" value={userDraft.password} onChange={(event) => setUserDraft({ ...userDraft, password: event.target.value })} />
                  </label>}
                  <label><span>员工识别颜色</span><select value={userDraft.contentColor} onChange={event=>setUserDraft({...userDraft,contentColor:event.target.value})}><option value="">自动分配</option>{employeePalette.map((color,index)=><option value={color} key={color}>中性色 {index+1}</option>)}</select><i className="employee-color-preview" style={{background:employeeColor(userDraft.id||userDraft.username,userDraft.contentColor)}}/></label>
                  {data.roles.find(item=>String(item.id)===String(userDraft.roleId))?.code==="super_admin"?<div className="employee-duty-fixed"><strong>全系统范围</strong><p>超级管理员固定拥有全部业务范围，不需要逐项设置。</p></div>:<>
                    <label className="primary-duty-select"><span>本人在哪个小组制作内容</span><select value={userDraft.primaryGroupId} onChange={event=>{const id=Number(event.target.value)||0;setUserDraft({...userDraft,primaryGroupId:event.target.value,uploadGroups:id?[...new Set([...userDraft.uploadGroups,id])]:userDraft.uploadGroups});}}><option value="">不制作内容</option>{data.groups.filter(item=>item.status==="active").map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select><small>选择后，该员工只能上传和管理自己的内容，不会自动看到其他队员内容。</small></label>
                    {data.canManageGroupMembers&&<div className="employee-duty-builder"><div className="employee-duty-heading"><strong>这个人还负责什么</strong><small>只选择实际承担的工作</small></div><section><h4>内容工作</h4>{data.groups.filter(item=>item.status==="active").map(group=><article className="employee-duty-target" key={group.id}><strong>{group.name}</strong><label><input type="checkbox" checked={userDraft.reviewGroups.includes(group.id)} onChange={event=>setUserDraft({...userDraft,reviewGroups:event.target.checked?[...userDraft.reviewGroups,group.id]:userDraft.reviewGroups.filter(id=>id!==group.id)})}/><span>审核这个小组提交的内容</span></label><label><input type="checkbox" checked={userDraft.viewGroups.includes(group.id)} onChange={event=>setUserDraft({...userDraft,viewGroups:event.target.checked?[...userDraft.viewGroups,group.id]:userDraft.viewGroups.filter(id=>id!==group.id)})}/><span>管理这个小组的进度，可查看全组内容</span></label></article>)}</section><section><h4>账号工作</h4>{data.accounts.filter(item=>item.status==="active").map(account=><article className="employee-duty-target" key={account.id}><strong>{account.platformName} · {account.name}</strong><label><input type="checkbox" checked={userDraft.materialUploadAccounts.includes(account.id)} onChange={event=>setUserDraft({...userDraft,materialUploadAccounts:event.target.checked?[...userDraft.materialUploadAccounts,account.id]:userDraft.materialUploadAccounts.filter(id=>id!==account.id)})}/><span>拍摄并上传素材</span></label><label><input type="checkbox" checked={userDraft.materialReviewAccounts.includes(account.id)} onChange={event=>setUserDraft({...userDraft,materialReviewAccounts:event.target.checked?[...userDraft.materialReviewAccounts,account.id]:userDraft.materialReviewAccounts.filter(id=>id!==account.id)})}/><span>审核这个账号的素材</span></label><label><input type="checkbox" checked={userDraft.publishingAccounts.includes(account.id)} onChange={event=>setUserDraft({...userDraft,publishingAccounts:event.target.checked?[...userDraft.publishingAccounts,account.id]:userDraft.publishingAccounts.filter(id=>id!==account.id)})}/><span>负责这个账号的发布运营</span></label></article>)}</section><details><summary>高级设置：向其他小组上传内容</summary><p>一般员工不需要设置；仅在确实跨组制作时使用。</p>{data.groups.filter(item=>item.status==="active"&&String(item.id)!==String(userDraft.primaryGroupId)).map(group=><label className="employee-duty-advanced" key={group.id}><input type="checkbox" checked={userDraft.uploadGroups.includes(group.id)} onChange={event=>setUserDraft({...userDraft,uploadGroups:event.target.checked?[...userDraft.uploadGroups,group.id]:userDraft.uploadGroups.filter(id=>id!==group.id)})}/><span>可以向 {group.name} 上传本人内容</span></label>)}</details><details className="employee-permission-overrides"><summary>高级设置：这个员工的权限例外</summary><p>默认跟随角色和上面的职责。只有确实需要区别于同角色其他员工时才调整；以后修改角色不会覆盖这里。</p>{permissionGroups.map(group=><section key={group.key}><h4>{group.label}</h4>{group.permissions.map(permission=>{const automatic=automaticDutyPermissions.has(permission.key);const value=automatic?"automatic":userDraft.permissionDenies.includes(permission.key)?"deny":userDraft.permissionGrants.includes(permission.key)?"allow":"inherit";return <label key={permission.key}><span><strong>{permission.label}</strong><small>{automatic?"由当前职责自动开启":permission.description}</small></span><select disabled={automatic} value={value} onChange={event=>{const next=event.target.value;setUserDraft({...userDraft,permissionGrants:next==="allow"?[...new Set([...userDraft.permissionGrants,permission.key])]:userDraft.permissionGrants.filter(key=>key!==permission.key),permissionDenies:next==="deny"?[...new Set([...userDraft.permissionDenies,permission.key])]:userDraft.permissionDenies.filter(key=>key!==permission.key)});}}><option value={automatic?"automatic":"inherit"}>{automatic?"职责自动开启":"跟随角色/职责"}</option>{!automatic?<><option value="allow">额外允许</option><option value="deny">单独禁止</option></>:null}</select></label>;})}</section>)}</details><div className="employee-duty-summary"><strong>保存后的工作范围</strong><ul>{userDraft.primaryGroupId?<li>在 {data.groups.find(item=>String(item.id)===String(userDraft.primaryGroupId))?.name??"所选小组"} 制作本人内容</li>:null}{userDraft.reviewGroups.map(id=><li key={`review-${id}`}>审核 {data.groups.find(item=>item.id===id)?.name??"所选小组"} 的内容</li>)}{userDraft.viewGroups.map(id=><li key={`view-${id}`}>查看并管理 {data.groups.find(item=>item.id===id)?.name??"所选小组"} 的全组进度</li>)}{userDraft.materialUploadAccounts.map(id=><li key={`material-upload-${id}`}>向 {data.accounts.find(item=>item.id===id)?.name??"所选账号"} 上传素材</li>)}{userDraft.materialReviewAccounts.map(id=><li key={`material-review-${id}`}>审核 {data.accounts.find(item=>item.id===id)?.name??"所选账号"} 的素材</li>)}{userDraft.publishingAccounts.map(id=><li key={`publishing-${id}`}>负责 {data.accounts.find(item=>item.id===id)?.name??"所选账号"} 的发布</li>)}{userDraft.permissionGrants.length?<li>另行允许 {userDraft.permissionGrants.length} 项个人权限</li>:null}{userDraft.permissionDenies.length?<li>单独禁止 {userDraft.permissionDenies.length} 项个人权限</li>:null}{!userDraft.primaryGroupId&&!userDraft.reviewGroups.length&&!userDraft.viewGroups.length&&!userDraft.materialUploadAccounts.length&&!userDraft.materialReviewAccounts.length&&!userDraft.publishingAccounts.length?<li>暂未分配业务工作</li>:null}</ul></div></div>}
                  </>}
                </>
              )}
              {drawer==="group"&&<><label><span>小组名称 *</span><input value={groupDraft.name} onChange={event=>setGroupDraft({...groupDraft,name:event.target.value})}/></label><label><span>小组编号</span><input disabled={Boolean(groupDraft.id)} placeholder="留空自动生成" value={groupDraft.code} onChange={event=>setGroupDraft({...groupDraft,code:event.target.value})}/></label><label><span>所属项目 *</span><select required value={groupDraft.accountId} onChange={event=>setGroupDraft({...groupDraft,accountId:event.target.value})}><option value="">请选择账号</option>{data.accounts.filter(item=>item.status==="active"||String(item.id)===groupDraft.accountId).map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>所属部门</span><select value={groupDraft.departmentId} onChange={event=>setGroupDraft({...groupDraft,departmentId:event.target.value})}><option value="">未绑定</option>{data.departments.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>小组负责人（不自动获得审核权）</span><select value={groupDraft.leaderUserId} onChange={event=>setGroupDraft({...groupDraft,leaderUserId:event.target.value})}><option value="">未设置</option>{data.users.filter(item=>item.status==="active").map(item=><option value={item.id} key={item.id}>{item.displayName}</option>)}</select></label><label><span>识别颜色</span><input type="color" value={groupDraft.themeColor} onChange={event=>setGroupDraft({...groupDraft,themeColor:event.target.value})}/></label><label><span>业务方向</span><input value={groupDraft.businessDirection} onChange={event=>setGroupDraft({...groupDraft,businessDirection:event.target.value})}/></label><label><span>小组说明</span><textarea value={groupDraft.description} onChange={event=>setGroupDraft({...groupDraft,description:event.target.value})}/></label>{groupDraft.id&&<label><span>状态</span><select value={groupDraft.status} onChange={event=>setGroupDraft({...groupDraft,status:event.target.value})}><option value="active">启用</option><option value="inactive">停用</option></select></label>}</>}
              {drawer === "department" && (
                <>
                  <label>
                    <span>部门名称 *</span>
                    <input
                      value={departmentDraft.name}
                      onChange={(event) =>
                        setDepartmentDraft({
                          ...departmentDraft,
                          name: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>上级部门</span>
                    <select
                      value={departmentDraft.parentId}
                      onChange={(event) =>
                        setDepartmentDraft({
                          ...departmentDraft,
                          parentId: event.target.value,
                        })
                      }
                    >
                      <option value="">无上级</option>
                      {data.departments
                        .filter((item) => item.id !== departmentDraft.id)
                        .map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            <div className="drawer-actions">
              <button onClick={() => setDrawer(null)}>取消</button>
              <button
                className="primary-button"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "保存中" : "保存"}
              </button>
            </div>
          </aside>
        </div>
      )}
      {toggleUser && (
        <div className="modal-backdrop confirm-layer">
          <div className="modal confirm-modal">
            <div className="confirm-icon">!</div>
            <h3>
              确认{toggleUser.status === "active" ? "停用" : "启用"}“
              {toggleUser.displayName}”？
            </h3>
            <p>
              {toggleUser.status === "active"
                ? "停用后不能继续登录，历史上传、审核和发布记录继续保留。"
                : "启用后该员工可以重新登录。"}
            </p>
            <div className="confirm-actions">
              <button onClick={() => setToggleUser(null)}>取消</button>
              <button
                className={
                  toggleUser.status === "active"
                    ? "danger-confirm"
                    : "primary-button"
                }
                onClick={() => void applyToggle()}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AuditLog({ notify }: Pick<Props, "notify">) {
  type AuditRecord = {
    id: string;
    user: string;
    module: string;
    actionType: string;
    action: string;
    object: string;
    detail: string;
    time: string;
    ip: string;
    result: "成功" | "失败";
  };
  const logs: AuditRecord[] = [
    {
      id: "LOG-1042",
      user: "系统管理员",
      module: "组织与权限",
      actionType: "权限",
      action: "修改角色权限",
      object: "发布专员",
      detail: "新增下载原始文件权限",
      time: "今天 11:42",
      ip: "192.168.1.12",
      result: "成功",
    },
    {
      id: "LOG-1041",
      user: "王晨",
      module: "发布管理",
      actionType: "发布",
      action: "更新发布状态",
      object: "PUB-216 → 已发布",
      detail: "点亮小红书平台灯",
      time: "今天 11:18",
      ip: "192.168.1.26",
      result: "成功",
    },
    {
      id: "LOG-1040",
      user: "审核专员",
      module: "审核中心",
      actionType: "审核",
      action: "审核通过",
      object: "CNT-0825-014 V3",
      detail: "审核批次 REV-0825-06",
      time: "今天 10:56",
      ip: "192.168.1.18",
      result: "成功",
    },
    {
      id: "LOG-1039",
      user: "林晓",
      module: "内容池",
      actionType: "版本",
      action: "上传新版本",
      object: "CNT-0825-018 V2",
      detail: "驳回后重新提交审核",
      time: "今天 10:31",
      ip: "192.168.1.34",
      result: "成功",
    },
    {
      id: "LOG-1038",
      user: "陈瑜",
      module: "发布管理",
      actionType: "下载",
      action: "下载原始文件",
      object: "CNT-0825-017 V1",
      detail: "用于小红书发布",
      time: "今天 09:48",
      ip: "192.168.1.29",
      result: "成功",
    },
    {
      id: "LOG-1037",
      user: "系统管理员",
      module: "员工账号",
      actionType: "账号",
      action: "重置员工密码",
      object: "USR-021 陈瑜",
      detail: "要求下次登录修改密码",
      time: "今天 09:26",
      ip: "192.168.1.12",
      result: "成功",
    },
    {
      id: "LOG-1036",
      user: "周莉",
      module: "内容池",
      actionType: "内容",
      action: "批量提交审核",
      object: "3 条内容",
      detail: "CNT-0825-029 等",
      time: "昨天 17:42",
      ip: "192.168.1.31",
      result: "成功",
    },
    {
      id: "LOG-1035",
      user: "未知账号",
      module: "登录",
      actionType: "登录",
      action: "登录失败",
      object: "publisher",
      detail: "密码错误",
      time: "昨天 17:18",
      ip: "192.168.1.66",
      result: "失败",
    },
    {
      id: "LOG-1034",
      user: "系统管理员",
      module: "版本管理",
      actionType: "删除",
      action: "删除历史版本",
      object: "CNT-0824-063 V1",
      detail: "最新版本 V2 已保留",
      time: "昨天 16:55",
      ip: "192.168.1.12",
      result: "成功",
    },
    {
      id: "LOG-1033",
      user: "系统管理员",
      module: "平台与店铺",
      actionType: "基础资料",
      action: "停用店铺",
      object: "礼物研究所",
      detail: "历史关系继续保留",
      time: "昨天 15:20",
      ip: "192.168.1.12",
      result: "成功",
    },
  ];
  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("全部模块");
  const [actionFilter, setActionFilter] = useState("全部操作类型");
  const [resultFilter, setResultFilter] = useState("全部结果");
  const [period, setPeriod] = useState("最近7天");
  const visibleLogs = logs.filter(
    (log) =>
      (moduleFilter === "全部模块" || log.module === moduleFilter) &&
      (actionFilter === "全部操作类型" || log.actionType === actionFilter) &&
      (resultFilter === "全部结果" || log.result === resultFilter) &&
      (!query.trim() ||
        `${log.user}${log.action}${log.object}${log.ip}${log.id}`.includes(
          query.trim(),
        )),
  );
  return (
    <>
      <ModuleHeader
        title="操作日志"
        description="记录登录、内容、审核、发布、版本、下载、基础资料和权限等关键操作；日志不能修改或删除。"
        action="导出日志"
        onAction={() => notify("已按当前筛选条件生成日志导出任务")}
      />
      <div className="audit-policy-note">
        <span>≡</span>
        <div>
          <strong>日志长期保留</strong>
          <p>
            普通用户不能修改或删除日志；超级管理员可以查询和导出，失败操作同样记录。
          </p>
        </div>
      </div>
      <section className="panel module-panel">
        <div className="audit-filters">
          <label>
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索操作人、对象、日志编号或IP"
            />
          </label>
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            <option>今天</option>
            <option>最近7天</option>
            <option>最近30天</option>
            <option>自定义日期</option>
          </select>
          <select
            value={moduleFilter}
            onChange={(event) => setModuleFilter(event.target.value)}
          >
            <option>全部模块</option>
            {[...new Set(logs.map((log) => log.module))].map((module) => (
              <option key={module}>{module}</option>
            ))}
          </select>
          <select
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
          >
            <option>全部操作类型</option>
            {[...new Set(logs.map((log) => log.actionType))].map((action) => (
              <option key={action}>{action}</option>
            ))}
          </select>
          <select
            value={resultFilter}
            onChange={(event) => setResultFilter(event.target.value)}
          >
            <option>全部结果</option>
            <option>成功</option>
            <option>失败</option>
          </select>
        </div>
        <div className="audit-summary">
          <span>当前显示 {visibleLogs.length} 条日志</span>
          <div>
            <strong>
              {logs.filter((log) => log.result === "失败").length}
            </strong>
            <small>失败操作</small>
          </div>
          <div>
            <strong>
              {
                logs.filter((log) =>
                  ["权限", "删除", "下载"].includes(log.actionType),
                ).length
              }
            </strong>
            <small>高风险操作</small>
          </div>
        </div>
        <div className="table-wrap">
          <table className="module-table audit-table">
            <thead>
              <tr>
                <th>操作时间</th>
                <th>操作人</th>
                <th>模块 / 类型</th>
                <th>操作行为</th>
                <th>操作对象</th>
                <th>详情</th>
                <th>局域网IP</th>
                <th>结果</th>
                <th>日志编号</th>
              </tr>
            </thead>
            <tbody>
              {visibleLogs.map((log) => (
                <tr key={log.id}>
                  <td>{log.time}</td>
                  <td>
                    <span className="mini-avatar">{log.user[0]}</span>
                    {log.user}
                  </td>
                  <td>
                    <strong>{log.module}</strong>
                    <small className="cell-subline">{log.actionType}</small>
                  </td>
                  <td>{log.action}</td>
                  <td>
                    <strong>{log.object}</strong>
                  </td>
                  <td>{log.detail}</td>
                  <td>
                    <code>{log.ip}</code>
                  </td>
                  <td>
                    <Badge tone={log.result === "成功" ? "green" : "red"}>
                      {log.result}
                    </Badge>
                  </td>
                  <td>
                    <code>{log.id}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visibleLogs.length === 0 && (
          <div className="empty-state">没有符合条件的操作日志</div>
        )}
      </section>
    </>
  );
}

type AuditData = {
  logs: Array<{
    id: number;
    userId: number | null;
    userName: string | null;
    action: string;
    objectType: string;
    objectId: string;
    result: string;
    details: unknown;
    ipAddress: string | null;
    createdAt: string;
  }>;
};
function AuditLogLive({ notify }: Pick<Props, "notify">) {
  const [logs, setLogs] = useState<AuditData["logs"]>([]);
  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("全部模块");
  const [resultFilter, setResultFilter] = useState("全部结果");
  const [period, setPeriod] = useState("最近7天");
  const [smartRules, setSmartRules] = useState<SmartFilterRule[]>([]);
  const load = async () => {
    const response = await fetch("/api/audit-logs", { cache: "no-store" });
    if (!response.ok) {
      notify("当前账号没有查看操作日志的权限");
      return;
    }
    const data = (await response.json()) as AuditData;
    setLogs(data.logs);
  };
  useEffect(() => {
    void load();
  }, []);
  const moduleName = (action: string) =>
    action.startsWith("content.")
      ? "内容池"
      : action.startsWith("review")
        ? "审核中心"
        : action.startsWith("publishing")
          ? "发布管理"
          : action.startsWith("business.")
            ? "业务资料"
            : action.startsWith("admin.")
              ? "组织与权限"
              : action.startsWith("analytics.")
                ? "数据统计"
                : action.startsWith("auth.") || action.startsWith("system.")
                  ? "系统"
                  : "其他";
  const actionLabel = (action: string) =>
    ({
      "content.create_batch": "批量创建内容",
      "content.file_upload": "上传内容文件",
      "content.version_prepare": "准备新版本",
      "analytics.metric_create": "录入平台表现",
      "business.account_products_replace": "更新账号商品绑定",
      "business.platform_reorder": "调整平台顺序",
      "admin.user_create": "创建员工账号",
      "admin.user_update": "更新员工账号",
      "admin.role_create": "创建角色",
      "admin.role_update": "更新角色权限",
      "admin.department_create": "创建部门",
      "admin.department_update": "更新部门",
    })[action] ?? action;
  const inPeriod = (value: string) => {
    const date = new Date(value.replace(" ", "T") + "Z");
    const days =
      period === "今天"
        ? 1
        : period === "最近7天"
          ? 7
          : period === "最近30天"
            ? 30
            : 99999;
    return Date.now() - date.getTime() <= days * 86400000;
  };
  const modules = [...new Set(logs.map((item) => moduleName(item.action)))];
  const detail = (value: unknown) => {
    try {
      return JSON.stringify(value);
    } catch {
      return "{}";
    }
  };
  const auditFields = useMemo<SmartFilterField<AuditData["logs"][number]>[]>(() => [
    { key: "query", label: "关键词", type: "text", getValue: (item) => [item.userName, item.action, item.objectId, item.ipAddress, item.id, detail(item.details)] },
    { key: "createdAt", label: "操作时间", type: "date", getValue: (item) => item.createdAt },
    { key: "user", label: "操作人", type: "select", options: [...new Set(logs.map((item) => item.userName ?? "系统"))].map((value) => ({ value, label: value })), getValue: (item) => item.userName ?? "系统" },
    { key: "module", label: "模块", type: "select", options: modules.map((value) => ({ value, label: value })), getValue: (item) => moduleName(item.action) },
    { key: "action", label: "操作行为", type: "select", options: [...new Set(logs.map((item) => actionLabel(item.action)))].map((value) => ({ value, label: value })), getValue: (item) => actionLabel(item.action) },
    { key: "objectType", label: "对象类型", type: "select", options: [...new Set(logs.map((item) => item.objectType))].map((value) => ({ value, label: value })), getValue: (item) => item.objectType },
    { key: "objectId", label: "操作对象", type: "text", getValue: (item) => item.objectId },
    { key: "details", label: "详情", type: "text", getValue: (item) => detail(item.details) },
    { key: "ipAddress", label: "局域网IP", type: "text", getValue: (item) => item.ipAddress },
    { key: "result", label: "结果", type: "select", options: ["成功", "失败"].map((value) => ({ value, label: value })), getValue: (item) => item.result === "success" ? "成功" : "失败" },
    { key: "id", label: "日志编号", type: "number", getValue: (item) => item.id },
  ], [logs]);
  const visible = useMemo(() => applySmartFilters(logs, smartRules, auditFields), [logs, smartRules, auditFields]);
  return (
    <>
      <ModuleHeader
        title="操作日志"
        description="关键操作由服务器自动记录，普通用户不能修改或删除。"
        action="刷新日志"
        onAction={() => void load()}
      />
      <div className="audit-policy-note">
        <span>≡</span>
        <div>
          <strong>日志长期保留</strong>
          <p>
            登录、内容、审核、发布、版本、数据和权限操作均保留操作人、对象、结果与局域网IP。
          </p>
        </div>
      </div>
      <section className="panel module-panel">
        <div className="audit-filters legacy-list-filter" aria-hidden="true">
          <label>
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索操作人、对象、日志编号或IP"
            />
          </label>
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            <option>今天</option>
            <option>最近7天</option>
            <option>最近30天</option>
            <option>全部时间</option>
          </select>
          <select
            value={moduleFilter}
            onChange={(event) => setModuleFilter(event.target.value)}
          >
            <option>全部模块</option>
            {modules.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            value={resultFilter}
            onChange={(event) => setResultFilter(event.target.value)}
          >
            <option>全部结果</option>
            <option>成功</option>
            <option>失败</option>
          </select>
        </div>
        <RuleFilterBar moduleKey="audit" fields={auditFields} rules={smartRules} onChange={setSmartRules} />
        <div className="audit-summary">
          <span>当前显示 {visible.length} 条日志</span>
          <div>
            <strong>
              {logs.filter((item) => item.result !== "success").length}
            </strong>
            <small>失败操作</small>
          </div>
          <div>
            <strong>
              {
                logs.filter((item) =>
                  /delete|password|role|status|publish/.test(item.action),
                ).length
              }
            </strong>
            <small>高风险操作</small>
          </div>
        </div>
        <div className="table-wrap">
          <table className="module-table audit-table">
            <thead>
              <tr>
                <th>操作时间</th>
                <th>操作人</th>
                <th>模块</th>
                <th>操作行为</th>
                <th>操作对象</th>
                <th>详情</th>
                <th>局域网IP</th>
                <th>结果</th>
                <th>日志编号</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id}>
                  <td>
                    {new Date(
                      item.createdAt.replace(" ", "T") + "Z",
                    ).toLocaleString("zh-CN")}
                  </td>
                  <td>
                    <span className="mini-avatar">
                      {(item.userName ?? "系")[0]}
                    </span>
                    {item.userName ?? "系统"}
                  </td>
                  <td>
                    <strong>{moduleName(item.action)}</strong>
                    <small className="cell-subline">{item.objectType}</small>
                  </td>
                  <td>{actionLabel(item.action)}</td>
                  <td>
                    <strong>{item.objectId}</strong>
                  </td>
                  <td>
                    <small>{detail(item.details).slice(0, 120)}</small>
                  </td>
                  <td>
                    <code>{item.ipAddress ?? "local"}</code>
                  </td>
                  <td>
                    <Badge tone={item.result === "success" ? "green" : "red"}>
                      {item.result === "success" ? "成功" : "失败"}
                    </Badge>
                  </td>
                  <td>
                    <code>LOG-{item.id}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <div className="empty-state">没有符合条件的操作日志</div>
        )}
      </section>
    </>
  );
}

type UiSettings={uploadTitlePlaceholder:string;imageTitlePlaceholder:string;contentRemarkPlaceholder:string;reviewRejectPlaceholder:string;reviewRecommendationPlaceholder:string;defaultPageSize:string;materialCategories:string;materialTags:string};
const emptyUiSettings:UiSettings={uploadTitlePlaceholder:"",imageTitlePlaceholder:"",contentRemarkPlaceholder:"",reviewRejectPlaceholder:"",reviewRecommendationPlaceholder:"",defaultPageSize:"20",materialCategories:"",materialTags:""};

function SettingsCenter({notify}:Pick<Props,"notify">){
 const [settings,setSettings]=useState<UiSettings>(emptyUiSettings);const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);
 useEffect(()=>{let cancelled=false;void fetch("/api/system/settings",{cache:"no-store"}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error??"配置读取失败");if(!cancelled)setSettings({...emptyUiSettings,...data.settings});}).catch(error=>notify(error.message,"error")).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};},[]);
 const field=(key:keyof UiSettings,label:string,help:string)=><label><span>{label}</span><input value={settings[key]} placeholder="留空则不显示提示词" title={help} onChange={event=>setSettings(current=>({...current,[key]:event.target.value}))}/></label>;
 return <><ModuleHeader title="配置中心" description=""/><section className="panel settings-center"><header><div><h2>界面文字与列表</h2><p>留空的输入框不会在业务页面显示示例文字。</p></div></header>{loading?<div className="empty-state">正在读取配置…</div>:<form onSubmit={async event=>{event.preventDefault();if(saving)return;setSaving(true);try{const response=await fetch("/api/system/settings",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({settings})});const data=await response.json();if(!response.ok)throw new Error(data.error??"保存失败");notify("配置已保存，新进入页面时生效","success");}catch(error){notify((error as Error).message,"error");}finally{setSaving(false);}}}><div className="settings-grid">{field("uploadTitlePlaceholder","视频批量标题提示词","显示在上传新内容的视频标题输入框中")}{field("imageTitlePlaceholder","图文标题提示词","显示在上传新内容的图文标题输入框中")}{field("contentRemarkPlaceholder","内容备注提示词","显示在内容备注输入框中")}{field("reviewRejectPlaceholder","驳回评语提示词","显示在审核驳回评语输入框中")}{field("reviewRecommendationPlaceholder","推荐评语提示词","显示在审核推荐评语输入框中")}<label><span>列表默认每页数量</span><select value={settings.defaultPageSize} onChange={event=>setSettings(current=>({...current,defaultPageSize:event.target.value}))}><option value="20">20条</option><option value="50">50条</option><option value="100">100条</option></select></label><label className="settings-wide"><span>素材主分类</span><textarea value={settings.materialCategories} placeholder="每行一个分类" onChange={event=>setSettings(current=>({...current,materialCategories:event.target.value}))}/></label><label className="settings-wide"><span>素材标签</span><textarea value={settings.materialTags} placeholder="每行一个标签" onChange={event=>setSettings(current=>({...current,materialTags:event.target.value}))}/></label></div><footer><button className="primary-button" disabled={saving}>{saving?"正在保存…":"保存配置"}</button></footer></form>}</section></>;
}

function ReportTemplatePanel({notify}:Pick<Props,"notify">){
 const [data,setData]=useState<any>({templates:[],assignments:[],users:[]});const [name,setName]=useState("");const [editing,setEditing]=useState<any>(null);const [reminder,setReminder]=useState<any>(null);
 const load=()=>void fetch("/api/report-templates",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>d&&setData(d));useEffect(load,[]);
 const save=async(template?:any)=>{const value=(template?.name??name).trim();if(!value)return;const body=template?{...template,id:template.id,name:value,fields:JSON.parse(template.fieldsJson)}:{name:value};const r=await fetch("/api/report-templates",{method:template?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok){notify(d.error??"保存失败","error");return;}setName("");setEditing(null);notify("模板已保存","success");load();};
 const remove=async(id:number)=>{if(!window.confirm("删除模板不会删除历史报备，是否继续？"))return;await fetch("/api/report-templates",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,action:"delete"})});notify("模板已删除","success");load();};
 const assign=async()=>{if(!reminder)return;const userIds=data.users.filter((u:any)=>u.selected).map((u:any)=>u.id);const reminders=Object.fromEntries(data.users.filter((u:any)=>u.selected).map((u:any)=>[String(u.id),{enabled:true,time:u.reminderTime||"18:00"}]));await fetch("/api/report-templates",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:reminder.id,action:"assign",userIds,reminders})});notify("分配与提醒已保存","success");setReminder(null);load();};
 return <section className="panel report-template-panel"><header className="panel-heading"><div><h2>报备模板</h2><p>固定单列排版；模板分配只限制创建，不限制接收和抄送。</p></div><div><input value={name} placeholder="新模板名称" onChange={e=>setName(e.target.value)}/><button onClick={()=>void save()}>新增模板</button></div></header><div className="report-template-list">{data.templates.map((t:any)=><article key={t.id}><strong>{t.name}</strong><span>{t.description||"今日完成、明日计划、备注"}</span><div><button onClick={()=>{setName(`（副本）`);setEditing(null);}}>复制</button><button onClick={()=>setEditing(t)}>编辑</button><button onClick={()=>setReminder(t)}>提醒与分配</button><button onClick={()=>void remove(t.id)} className="danger">删除</button></div></article>)}</div>{editing?<CenterDialog title="编辑报备模板" onClose={()=>setEditing(null)}><div className="report-form"><label>模板名称<input value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></label><label>说明<textarea value={editing.description??""} onChange={e=>setEditing({...editing,description:e.target.value})}/></label><footer><button onClick={()=>setEditing(null)}>取消</button><button className="primary-button" onClick={()=>void save(editing)}>保存</button></footer></div></CenterDialog>:null}{reminder?<CenterDialog title={`${reminder.name} · 提醒与分配`} onClose={()=>setReminder(null)}><div className="report-form"><p>勾选员工后，该员工才可创建此模板；提醒时间按员工独立保存。</p>{data.users.map((u:any)=>{const a=data.assignments.find((x:any)=>x.templateId===reminder.id&&x.userId===u.id);return <label key={u.id}><input type="checkbox" defaultChecked={Boolean(a)} onChange={e=>{u.selected=e.target.checked;u.reminderTime=(u.reminderTime??a?.reminderTime??"18:00");}}/>{u.name}<input type="time" defaultValue={a?.reminderTime??"18:00"} onChange={e=>u.reminderTime=e.target.value}/></label>})}<footer><button onClick={()=>setReminder(null)}>取消</button><button className="primary-button" onClick={()=>void assign()}>保存</button></footer></div></CenterDialog>:null}</section>;
}

function FixedReportTemplatePanel({notify}:Pick<Props,"notify">){
 const [data,setData]=useState<any>({templates:[],assignments:[],users:[]});const [open,setOpen]=useState<any>(null);const [selected,setSelected]=useState<number[]>([]);
 const load=()=>void fetch("/api/report-templates",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>d&&setData(d));useEffect(load,[]);
 const begin=(template:any)=>{setSelected(data.assignments.filter((a:any)=>a.templateId===template.id).map((a:any)=>a.userId));setOpen(template);};
 const save=async()=>{if(!open)return;const r=await fetch("/api/report-templates",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:open.id,action:"assign",userIds:selected})});const d=await r.json();if(!r.ok){notify(d.error??"保存失败","error");return;}notify(open.name+"可用账号已保存","success");setOpen(null);load();};
 return <section className="panel report-template-panel"><header className="panel-heading"><div><h2>模板管理</h2><p>系统固定提供报备模板，只配置哪些账号可以创建；接收和抄送不受此配置限制。</p></div></header><div className="report-template-list">{data.templates.map((template:any)=><article key={template.id}><div className="fixed-template-icon">{template.code==="RPT-SPOKEN-COPY"?"文":"日"}</div><strong>{template.name}</strong><span>{template.code==="RPT-SPOKEN-COPY"?"商品 · 口播文案 · 备注":"今日完成的工作 · 明日工作计划 · 备注"}</span><small>模板内容固定，不支持删除和编辑</small><div><button className="primary-button" onClick={()=>begin(template)}>配置可用账号</button></div></article>)}</div>{open?<CenterDialog title={"配置"+open.name+"可用账号"} onClose={()=>setOpen(null)}><div className="report-form"><p>被勾选的账号可以在工作报备中创建此模板；未勾选账号仍可接收、查看和抄送。</p><div className="template-account-list">{data.users.map((u:any)=><label key={u.id}><input type="checkbox" checked={selected.includes(u.id)} onChange={e=>setSelected(current=>e.target.checked?[...new Set([...current,u.id])]:current.filter(id=>id!==u.id))}/><span>{u.name}</span></label>)}</div><footer><button onClick={()=>setOpen(null)}>取消</button><button className="primary-button" onClick={()=>void save()}>保存</button></footer></div></CenterDialog>:null}</section>;
}

function RichReportField({value,onChange}:{value:string;onChange:(value:string)=>void}){return <div className="report-richtext" contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{__html:value}} onInput={e=>onChange(e.currentTarget.innerHTML)} />;}
function WorkReportCenter({notify}:Pick<Props,"notify">){
 const [rows,setRows]=useState<any[]>([]);const [people,setPeople]=useState<any[]>([]);const [personQuery,setPersonQuery]=useState("");const [open,setOpen]=useState(false);const [detail,setDetail]=useState<any>(null);const [editId,setEditId]=useState<number|null>(null);const [form,setForm]=useState({completed:"",plan:"",remark:"",recipientUserId:""});
 const load=()=>{void fetch("/api/reports",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>d&&setRows(d.reports??[]));void fetch("/api/reports?recipients=1",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>d&&setPeople(d.users??[]));};useEffect(load,[]);
 const save=async(action:"draft"|"submit")=>{const r=await fetch(editId?`/api/reports/`:"/api/reports",{method:editId?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...form,recipientUserId:Number(form.recipientUserId)||null,action})});const d=await r.json();if(!r.ok){notify(d.error??"保存失败","error");return;}notify(action==="submit"?"日报已提交":"草稿已保存","success");setOpen(false);setForm({completed:"",plan:"",remark:"",recipientUserId:""});load();};
 return <><ModuleHeader title="工作报备" description="日报只记录工作完成、明日计划和必要备注，提交后不可修改。"/><section className="panel report-center"><header className="panel-heading"><div><h2>日报列表</h2><p>只显示自己提交、接收或被抄送的日报</p></div><button className="primary-button" onClick={()=>setOpen(true)}>添加报备内容</button></header><div className="table-wrap"><table><thead><tr><th>日期</th><th>编号</th><th>提交人</th><th>接收人</th><th>状态</th><th>更新时间</th><th/></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.reportDate}</td><td>{r.code}</td><td>{r.submitterName}</td><td>{r.recipientName??"-"}</td><td><span className={`status ${r.status==="draft"?"slate":r.recipientReadAt?"green":"amber"}`}><i/>{r.status==="draft"?"草稿":r.recipientReadAt?"已读":"未读"}</span></td><td>{r.status==="draft"?"-":r.lastEditedAt}</td><td><button onClick={()=>{if(r.status==="draft"){setEditId(r.id);setForm({completed:r.completed,plan:r.plan,remark:r.remark,recipientUserId:String(r.recipientUserId??"")});setOpen(true);}else void fetch(`/api/reports/`).then(x=>x.json()).then(d=>setDetail(d));}}>{r.status==="draft"?"编辑":"查看"}</button>{r.status==="submitted"?<button onClick={()=>{setForm({completed:r.completed,plan:r.plan,remark:r.remark,recipientUserId:""});setOpen(true);}}>复制</button>:null}</td></tr>)}</tbody></table>{!rows.length?<div className="empty-state">暂无日报</div>:null}</div></section>{open?<CenterDialog title="日报" onClose={()=>setOpen(false)}><div className="report-form"><label>日期<input value={new Date().toISOString().slice(0,10)} readOnly/></label><label>今日完成的工作<RichReportField value={form.completed} onChange={value=>setForm({...form,completed:value})}/></label><label>明日工作计划<RichReportField value={form.plan} onChange={value=>setForm({...form,plan:value})}/></label><label>备注<RichReportField value={form.remark} onChange={value=>setForm({...form,remark:value})}/></label><label>接收人<select value={form.recipientUserId} onChange={e=>setForm({...form,recipientUserId:e.target.value})}><option value="">请选择</option>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><footer><button onClick={()=>void save("draft")}>保存草稿</button><button className="primary-button" onClick={()=>void save("submit")}>提交并退出</button></footer></div></CenterDialog>:null}{detail?<CenterDialog title="日报详情" onClose={()=>setDetail(null)}><div className="report-detail"><p>{detail.report?.reportDate} · {detail.report?.code}</p><h3>今日完成的工作</h3><div dangerouslySetInnerHTML={{__html:detail.report?.completed??""}}/><h3>明日工作计划</h3><div dangerouslySetInnerHTML={{__html:detail.report?.plan??""}}/><h3>备注</h3><div dangerouslySetInnerHTML={{__html:detail.report?.remark||"-"}}/></div></CenterDialog>:null}</>;
}

function WorkReportCenterV2({notify}:Pick<Props,"notify">){
 const [rows,setRows]=useState<any[]>([]);const [people,setPeople]=useState<any[]>([]);const [canCreate,setCanCreate]=useState(false);const [mode,setMode]=useState<"list"|"edit"|"view">("list");const [current,setCurrent]=useState<any>(null);const [form,setForm]=useState({completed:"",plan:"",remark:"",recipientUserId:""});const [ccTarget,setCcTarget]=useState<any>(null);const [ccIds,setCcIds]=useState<number[]>([]);const [ccRemark,setCcRemark]=useState("");
 const load=()=>{void fetch("/api/reports",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>{if(d){setRows(d.reports??[]);setCanCreate(Boolean(d.canCreate));}});void fetch("/api/reports?recipients=1",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>d&&setPeople(d.users??[]));};useEffect(load,[]);
 const newReport=()=>{setCurrent(null);setForm({completed:"",plan:"",remark:"",recipientUserId:""});setMode("edit");};
 const editDraft=(row:any)=>{setCurrent(row);setForm({completed:row.completed??"",plan:row.plan??"",remark:row.remark??"",recipientUserId:String(row.recipientUserId??"")});setMode("edit");};
 const copyReport=(row:any)=>{setCurrent(null);setForm({completed:row.completed??"",plan:row.plan??"",remark:row.remark??"",recipientUserId:""});setMode("edit");};
 const save=async(action:"draft"|"submit")=>{if(action==="submit"&&!window.confirm("提交后将不能编辑，确认提交吗？"))return;const endpoint=current?`/api/reports/${current.id}`:"/api/reports";const r=await fetch(endpoint,{method:current?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...form,recipientUserId:Number(form.recipientUserId)||null,action})});const d=await r.json();if(!r.ok){notify(d.error??"保存失败","error");return;}notify(action==="submit"?"日报已提交":"草稿已保存","success");load();setMode("list");};
 const leave=()=>{if(window.confirm("放弃未保存修改并退出吗？")){setMode("list");setCurrent(null);}};
 const openView=(row:any)=>{void fetch(`/api/reports/${row.id}`,{cache:"no-store"}).then(r=>r.json()).then(d=>{setCurrent({...row,...d.report,cc:d.cc??[]});setMode("view");});};
 const sendCc=async()=>{if(!ccTarget||!ccIds.length)return;const r=await fetch(`/api/reports/${ccTarget.id}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({userIds:ccIds,remark:ccRemark})});const d=await r.json();if(!r.ok){notify(d.error??"抄送失败","error");return;}notify("已完成抄送","success");setCcTarget(null);setCcIds([]);setCcRemark("");load();};
 if(mode==="edit")return <section className="report-editor-page"><header><button onClick={leave}>×</button><div><small>工作报备 / 日报</small><h2>{current?"编辑草稿":"新建报备"}</h2></div></header><main><label>报备模板<select value="日报" onChange={()=>{}}><option>日报</option></select></label><label>日期<input value={new Date().toISOString().slice(0,10)} readOnly/></label><label>今日完成的工作<RichReportField value={form.completed} onChange={value=>setForm({...form,completed:value})}/></label><label>明日工作计划<RichReportField value={form.plan} onChange={value=>setForm({...form,plan:value})}/></label><label>备注<RichReportField value={form.remark} onChange={value=>setForm({...form,remark:value})}/></label><label>接收人<select value={form.recipientUserId} onChange={e=>setForm({...form,recipientUserId:e.target.value})}><option value="">请选择一名接收人</option>{people.map(p=><option key={p.id} value={p.id}>{p.departmentName?`${p.departmentName} · `:""}{p.name}</option>)}</select></label></main><footer><button onClick={()=>void save("draft")}>保存</button><button className="primary-button" onClick={()=>void save("submit")}>提交</button><button onClick={leave}>退出</button></footer></section>;
 if(mode==="view"&&current)return <section className="report-editor-page"><header><button onClick={()=>setMode("list")}>×</button><div><small>工作报备 / 日报</small><h2>日报详情</h2></div></header><main><p className="report-meta">{current.reportDate} · {current.code} · 提交人：{current.submitterName}</p><h3>今日完成的工作</h3><div className="report-read-rich" dangerouslySetInnerHTML={{__html:current.completed??""}}/><h3>明日工作计划</h3><div className="report-read-rich" dangerouslySetInnerHTML={{__html:current.plan??""}}/><h3>备注</h3><div className="report-read-rich" dangerouslySetInnerHTML={{__html:current.remark||"-"}}/><p>接收人：{current.recipientName??"-"} · {current.recipientReadAt?"已读":"未读"}</p></main><footer><button onClick={()=>setMode("list")}>关闭</button>{current.status==="submitted"?<><button onClick={()=>copyReport(current)}>复制</button><button className="primary-button" onClick={()=>setCcTarget(current)}>抄送</button></>:null}</footer>{ccTarget?<CenterDialog title="抄送日报" onClose={()=>setCcTarget(null)}><div className="cc-overlay-form"><p>原日报内容保持只读，本次抄送可以填写独立备注。</p><div className="template-account-list">{people.filter(p=>p.id!==current.submitterUserId&&p.id!==current.recipientUserId).map(p=><label key={p.id}><input type="checkbox" checked={ccIds.includes(p.id)} onChange={e=>setCcIds(x=>e.target.checked?[...new Set([...x,p.id])]:x.filter(id=>id!==p.id))}/>{p.name}</label>)}</div><textarea value={ccRemark} placeholder="本次抄送备注" onChange={e=>setCcRemark(e.target.value)}/><footer><button onClick={()=>setCcTarget(null)}>取消</button><button className="primary-button" onClick={()=>void sendCc()}>确认抄送</button></footer></div></CenterDialog>:null}</section>;
 return <><ModuleHeader title="工作报备" description="日报提交前可以编辑，提交后只能查看或复制。"/><section className="panel report-center"><header className="panel-heading"><div><h2>工作报备</h2><p>只显示自己提交、接收或被抄送的内容</p></div>{canCreate?<button className="primary-button" onClick={newReport}>新建报备</button>:null}</header><div className="table-wrap"><table><thead><tr><th>日期</th><th>编号</th><th>提交人</th><th>接收人</th><th>状态</th><th>操作</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.reportDate}</td><td>{r.code}</td><td>{r.submitterName}</td><td>{r.recipientName??"-"}</td><td>{r.status==="draft"?"草稿":r.recipientReadAt?"已读":"未读"}</td><td>{r.status==="draft"?<button onClick={()=>editDraft(r)}>编辑</button>:<button onClick={()=>openView(r)}>查看</button>}{r.status==="submitted"?<button onClick={()=>copyReport(r)}>复制</button>:null}</td></tr>)}</tbody></table>{!rows.length?<div className="empty-state">暂无工作报备</div>:null}</div></section></>;
}

export function ModuleView({
  name,
  notify,
  navigate,
  versionTarget,
  contentTarget,
  platformIcons,
  setPlatformIcons,
}: Props) {
  const [contentRows, setContentRows] = useState<UnifiedContent[]>([]);
  const [versionGroups, setVersionGroups] =
    useState<VersionGroup[]>(initialVersionGroups);
  const [managedPlatforms, setManagedPlatforms] = useState<ManagedPlatform[]>(
    initialManagedPlatforms,
  );
  const [managedStores, setManagedStores] =
    useState<ManagedStore[]>(initialManagedStores);
  const [businessData, setBusinessData] =
    useState<BusinessData>(emptyBusinessData);
  const [canFeature, setCanFeature] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(0);
  const [contentPagination, setContentPagination] =
    useState<ContentPagination>({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const lastContentOptions = useRef<ContentLoadOptions>({
    page: 1,
    pageSize: 20,
  });
  const reloadBusinessData = async () => {
    const [response, catalogResponse] = await Promise.all([
      fetch("/api/business-data", { cache: "no-store" }),
      fetch("/api/product-masters", { cache: "no-store" }),
    ]);
    const data = response.ok ? await response.json() as BusinessData : emptyBusinessData;
    const catalog = catalogResponse.ok ? await catalogResponse.json() as { items?: BusinessData["productMasters"] } : { items: [] };
    const unified: BusinessData = { ...data, productMasters: catalog.items ?? [] };
    setBusinessData(unified);
    if (!response.ok) return;
    setManagedPlatforms(
      data.platforms.map((item) => ({
        id: item.id,
        key: item.code,
        name: item.name,
        mark: item.name[0] ?? "平",
        status: item.status === "active" ? "启用" : "停用",
        accounts: item.accountCount,
      })),
    );
    setManagedStores(
      data.stores.map((item) => ({
        id: String(item.id),
        dbId: item.id,
        platformKey: item.platformCode,
        name: item.name,
        code: item.code,
        status: item.status === "active" ? "启用" : "停用",
        referenced: true,
      })),
    );
    setPlatformIcons(
      Object.fromEntries(
        data.platforms.map((item) => [
          item.code,
          item.iconStoragePath
            ? `/api/platforms/${encodeURIComponent(item.code)}/icon`
            : "",
        ]),
      ),
    );
  };
  const reloadContents = async (options?: ContentLoadOptions) => {
    if (options) lastContentOptions.current = options;
    const current = lastContentOptions.current;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(current)) {
      if (value === undefined || value === "" || value === false) continue;
      params.set(key, String(value));
    }
    const response = await fetch(`/api/contents?${params.toString()}`, {
      cache: "no-store",
    });
    if (!response.ok) {const failed=await response.json().catch(()=>({}));notify(failed.error??"内容加载失败，请重试","error");return;}
    const data = (await response.json()) as {
      contents: Array<{
        id: number;
        code: string;
        title: string;
        contentType: string;
        productId: number | null;
        productMasterId?: number | null;
        categoryId?:number|null; categoryName?:string|null;
        productName: string | null;
        productImageUrl?: string | null;
        accountName: string | null;
        groupId:number|null;
        groupName:string|null;
        uploaderName: string;
        contentColor?:string|null;
        archivedAt?:string|null;
        archiveReason?:string;
        reviewComment?:string;
        uploaderUserId: number;
        visibility: string;
        remark: string;
        reviewStatus: string;
        latestVersionNumber: number;
        featured: boolean;
        featuredReason: string;
        featuredTags: string[];
        featuredAt: string | null;
        createdAt: string;
        updatedAt: string;
        versionId: number | null;
        coverUrl?: string | null;
        fileName: string | null;
        fileSize: number | null;
        durationSeconds: number | null;
        imageCount: number;
        uploadStatus: string | null;
        rejectionReason: string | null;
        rejectedAt: string | null;
      }>;
      pagination: ContentPagination;
      canFeature?: boolean;
      currentUserId?: number;
    };
    const statusLabels: Record<string, string> = {
      draft: "草稿",
      pending: "待审核",
      reviewing: "审核中",
      approved: "已通过",
      rejected: "已驳回",
    };
    const formatted = data.contents.map(
      (item): UnifiedContent => ({
        contentId: item.id,
        uploaderUserId:item.uploaderUserId,
        contentColor:item.contentColor,archivedAt:item.archivedAt,archiveReason:item.archiveReason,reviewComment:item.reviewComment,groupId:item.groupId,groupName:item.groupName,
        versionId: item.versionId ?? undefined,
        id: item.code,
        title: item.title,
        kind: item.contentType === "video" ? "视频" : "图文",
        product: item.productName ?? "未分配",
        productId: item.productId,
        productMasterId: item.productMasterId ?? null,
        categoryId:item.categoryId,categoryName:item.categoryName,
        productImageUrl: item.productImageUrl ?? null,
        account: item.accountName ?? "未分配",
        owner: item.uploaderName,
        version: `V${item.latestVersionNumber}`,
        status: statusLabels[item.reviewStatus] ?? item.reviewStatus,
        visibility:
          item.visibility === "public" ? "全部可见" : "仅本人和管理员",
        remark: item.remark,
        time: formatServerTime(item.createdAt),
        createdAt: item.createdAt,
        detail: item.fileSize
          ? `${item.contentType === "video" ? formatDuration(item.durationSeconds) : `${item.imageCount} 张图片`} · ${formatBytes(item.fileSize)} · ${item.fileName ?? "文件"}`
          : "等待文件上传",
        fileSize: item.fileSize ?? undefined,
        durationSeconds: item.durationSeconds,
        imageCount: item.imageCount,
        uploadStatus: item.uploadStatus ?? undefined,
        rejectionReason: item.rejectionReason ?? undefined,
        rejectedAt: item.rejectedAt
          ? formatServerTime(item.rejectedAt)
          : undefined,
        featured: item.featured,
        featuredReason: item.featuredReason,
        featuredTags: item.featuredTags,
        featuredAt: item.featuredAt ?? undefined,
        coverUrl: item.coverUrl ?? null,
      }),
    );
    setContentRows(formatted);
    setContentPagination(data.pagination);
    setCanFeature(Boolean(data.canFeature));
    setCurrentUserId(Number(data.currentUserId??0));
  };
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if(name!=="内容池")return;
      void reloadContents();
      void reloadBusinessData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const handleResubmit = (row: UnifiedContent, fileName: string) => {
    setVersionGroups((current) => {
      const newVersion: VersionFile = {
        v: row.version,
        file: fileName,
        size: "等待处理",
        owner: row.owner,
        time: row.time,
        current: true,
      };
      const existing = current.find((group) => group.id === row.id);
      if (existing)
        return current.map((group) =>
          group.id === row.id
            ? {
                ...group,
                title: row.title,
                current: row.version,
                owner: row.owner,
                time: row.time,
                detail: row.detail,
                versions: [
                  newVersion,
                  ...group.versions.map((item) => ({
                    ...item,
                    current: false,
                  })),
                ],
              }
            : group,
        );
      return [
        {
          title: row.title,
          id: row.id,
          current: row.version,
          kind: row.kind,
          product: row.product,
          owner: row.owner,
          time: row.time,
          detail: row.detail,
          versions: [newVersion],
        },
        ...current,
      ];
    });
  };
  return (
    <div className="content-area module-area">
      {name === "内容池" && (
        <ContentPool
          notify={notify}
          navigate={navigate}
          rows={contentRows}
          setRows={setContentRows}
          onResubmit={handleResubmit}
          reloadContents={reloadContents}
          pagination={contentPagination}
          businessData={businessData}
          canFeature={canFeature}
          currentUserId={currentUserId}
          initialTarget={contentTarget}
        />
      )}
      {name === "审核中心" && (
        <ReviewCenter notify={notify} navigate={navigate} />
      )}
      {name === "发布管理" && (
        <PublishManagement
          notify={notify}
          navigate={navigate}
          platformIcons={platformIcons}
          platforms={managedPlatforms}
        />
      )}
      {name === "版本管理" && (
        <VersionCenterLive
          notify={notify}
          navigate={navigate}
          initialTarget={versionTarget}
        />
      )}
      {name === "商品管理" && (
        <ProductManagement
          notify={notify}
          data={businessData}
          reload={reloadBusinessData}
        />
      )}
      {name === "项目" && (
        <AccountManagement
          notify={notify}
          data={businessData}
          reload={reloadBusinessData}
        />
      )}
      {name === "平台与店铺" && (
        <PlatformStores
          notify={notify}
          platformIcons={platformIcons}
          setPlatformIcons={setPlatformIcons}
          platforms={managedPlatforms}
          setPlatforms={setManagedPlatforms}
          stores={managedStores}
          setStores={setManagedStores}
          reload={reloadBusinessData}
        />
      )}
      {name === "数据统计" && <AnalyticsLive notify={notify} />}
      {name === "产品库" && <ProductCatalogPanel notify={notify} />}
      {name === "通知公告" && <CommunicationCenter mode="notices" notify={notify} />}
      {name === "素材中心" && <MaterialCenterV3 notify={notify} />}
      {name === "工作报备" && <WorkReportCenterV3 notify={notify} />}
      {name === "报备模板" && <><ModuleHeader title="模板管理" description="固定日报模板，仅配置可创建账号。"/><FixedReportTemplatePanel notify={notify}/></>}
      {name === "组织与权限" && <OrganizationLive notify={notify} />}
      {name === "配置中心" && <SettingsCenter notify={notify} />}
      {name === "操作日志" && <AuditLogLive notify={notify} />}
    </div>
  );
}

import {and,or,not,sql,type SQL} from "drizzle-orm";
// User input is only bound as values. Field expressions are a server-owned allowlist.
export function listRules(raw:string|null,columns:Record<string,{expression:SQL;type?:"date"|"number"}>){
 let rules:unknown;try{rules=JSON.parse(raw??"[]");}catch{return undefined;}if(!Array.isArray(rules))return undefined;
 const all:SQL[]=[],any:SQL[]=[],excluded:SQL[]=[];
 for(const rule of rules.slice(0,30)){
 if(!rule||typeof rule!=="object")continue;const field=columns[String(rule.field)];if(!field)continue;
 const text=String(rule.value??"").slice(0,1000),op=String(rule.operator),value=field.type==="number"?Number(text):text;
 if(field.type==="number"&&!Number.isFinite(value))continue;
 const expr=field.type==="date"?sql`date(${field.expression},'+8 hours')`:field.expression;let predicate:SQL;
 if(op==="empty")predicate=sql`(${expr} IS NULL OR ${expr}='')`;
 else if(op==="not_empty")predicate=sql`(${expr} IS NOT NULL AND ${expr}!='')`;
 else if(op==="contains")predicate=sql`instr(lower(coalesce(${expr},'')),lower(${text}))>0`;
 else if(op==="not_contains")predicate=sql`instr(lower(coalesce(${expr},'')),lower(${text}))=0`;
 else if(op==="eq")predicate=sql`coalesce(${expr},'')=${value}`;
 else if(op==="neq")predicate=sql`coalesce(${expr},'')!=${value}`;
 else if(op==="gt"||op==="after")predicate=sql`${expr}>${value}`;
 else if(op==="gte")predicate=sql`${expr}>=${value}`;
 else if(op==="lt"||op==="before")predicate=sql`${expr}<${value}`;
 else if(op==="lte")predicate=sql`${expr}<=${value}`;
 else continue;
 if(rule.join==="exclude")excluded.push(not(predicate));else if(rule.join==="or")any.push(predicate);else all.push(predicate);
 }
 return and(...all,any.length?or(...any):undefined,...excluded);
}

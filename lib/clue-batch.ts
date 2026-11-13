export function clueTags(value:string){return [...new Set(value.split(/[,，\n]+/).map(v=>v.trim()).filter(Boolean))];}
export function tagColor(value:string){let h=0;for(const c of value)h=(h*31+c.codePointAt(0)!)>>>0;return h%7;}
export type ClueEntry={key:string;title:string;keywords:string;tagText?:string;source:string;assignee:string;files:File[];error?:string;locked?:boolean};
export function clueEntryState(row:ClueEntry){if(!row.title.trim()&&!clueTags(row.keywords).length&&!row.tagText?.trim()&&!row.source.trim()&&!row.files.length)return 'empty';return row.title.trim()&&clueTags(row.keywords).length&&row.files.length?'ready':'incomplete';}

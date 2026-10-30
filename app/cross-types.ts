export type Kind='clue'|'mother'|'package';
export type Row={id:number;project_id:number;kind:Kind;parent_id:number|null;parentTitle:string|null;main_id:number|null;package_type:string;product_category_id:number|null;copied_from_id:number|null;cover_file_id:number|null;title:string;creator_id:number;maker_id:number;creatorName:string;makerName:string;status:string;revision:number;version_number:number;body_json:string;coverId:number|null;coverMime:string;fileCount:number;created_at:string;updated_at:string;reviewerName?:string;reviewedAt?:string;submittedAt?:string};
export type Person={id:number;username:string;name:string};
export type Category={id:number;name:string;status:string};
export type BusinessType={id:number;code:string;name:string;media_type:'image'|'video'|'document';status:string};
export type Access={admin:boolean;canAssign:boolean;canCreate:boolean;canReview:boolean;canView:boolean;canDownload:boolean};
export type StoredFile={id:number;record_id:number;file_name:string;mime_type:string;file_size:number;uploader_id:number;uploaderName:string;shared_json:string;canShare:boolean;created_at:string};
export type Note={legacy_source?:string;id:number;body:string;authorName:string;created_at:string};
export type Version={id:number;version_number:number;snapshot_json:string;submitterName:string;created_at:string};
export type Timeline={id:number;recordId:number;recordTitle:string;kind:Kind;actorName:string;created_at:string;action:string;version_number:number|null;eventType:string;legacy_source?:string;fileName?:string;body?:string;details_json?:string};
export type Detail={row:Row;files:StoredFile[];notes:Note[];copiedNotes:Note[];versions:Version[];timeline:Timeline[];reference:{title:string;data:Record<string,string>;files:StoredFile[]}|null;referenceVersion:number|null;parent:Row|null;clue:Row|null;access:Access;currentUserId:number};
export type Notify=(s:string,t?:'success'|'error')=>void;
export const names={clue:'线索',mother:'母版',package:'产品包'};
export const states:Record<string,string>={draft:'草稿',pending:'待审核',approved:'已通过',rejected:'已退回'};
export const actions:Record<string,string>={create:'创建',copy:'复制新建',save:'修改资料',upload:'上传文件',remove_image:'移除文件',reorder:'调整顺序',note:'补充备注',share:'修改文档可见人员',submit:'提交',approve:'审核通过',reject:'审核退回',withdraw:'撤回',delivery:'生成交付包',cover:'设置封面'};
export function localTime(s:string){if(!s)return '—';const parsed=new Date(/Z$|[+]\d\d:/.test(s)?s:s.replace(' ','T')+'Z');return Number.isNaN(parsed.getTime())?s:parsed.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});}

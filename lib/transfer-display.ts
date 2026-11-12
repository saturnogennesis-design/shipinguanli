/* eslint-disable no-control-regex -- Remove control characters from archive names. */
import type {DatabaseSync} from 'node:sqlite';
import {transferMime} from './transfer-media';
export const transferContentTypes:Record<string,string>={image:'图片',document:'文档',video:'视频'};
export function transferCategory(value:unknown){return typeof value==='string'&&Object.hasOwn(transferContentTypes,value)?value:null;}
export function transferCover(db:DatabaseSync,pack:{id:number;cover_path?:unknown},fileId?:number){
 if(fileId){const f=db.prepare('SELECT storage_path,file_name,cover_path FROM transfer_files WHERE package_id=? AND id=? AND deleted_at IS NULL').get(pack.id,fileId);return f?String(f.cover_path||(transferMime(String(f.file_name)).startsWith('image/')?f.storage_path:'')):'';}
 if(pack.cover_path)return String(pack.cover_path);
 for(const f of db.prepare('SELECT storage_path,file_name,cover_path FROM transfer_files WHERE package_id=? AND deleted_at IS NULL ORDER BY id').all(pack.id)){if(f.cover_path)return String(f.cover_path);if(transferMime(String(f.file_name)).startsWith('image/'))return String(f.storage_path);}
 return '';
}
export function transferZipName(title:string){const value=Array.from(title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').replace(/[. ]+$/g,'').trim()).slice(0,160).join('')||'临时文件包';const safe=/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)?'_'+value:value;return /\.zip$/i.test(safe)?safe:safe+'.zip';}
export function transferZipHeaders(title:string){return {'content-type':'application/zip','cache-control':'private, no-store','content-disposition':`attachment; filename="transfer.zip"; filename*=UTF-8''${encodeURIComponent(transferZipName(title)).replace(/'/g,'%27')}`};}
export function transferZipEntries(files:{file_name:unknown}[]){const used=new Set<string>();return files.map(f=>{const name=String(f.file_name).replace(/[\\/\u0000-\u001f]/g,'-')||'file',dot=name.lastIndexOf('.'),base=dot>0?name.slice(0,dot):name,ext=dot>0?name.slice(dot):'';let result=name,n=2;while(used.has(result.toLowerCase()))result=base+' ('+(n++)+')'+ext;used.add(result.toLowerCase());return result;});}

import type {DatabaseSync} from 'node:sqlite';
import {hasPermission,type AuthUser} from './server-auth';
import {transferOwns,transferArchiveAllowed,type TransferPackage} from './transfer-auth';
import {atomicWrite} from './publishing-write';
// Single and batch operations share ownership, lifecycle and audit rules.
export function changeTransferLifecycle(db:DatabaseSync,user:AuthUser,row:TransferPackage,action:string,revision:number){return atomicWrite(db,()=>{
 if(['delete','restore'].includes(action)&&!transferOwns(row,user))throw Error('只能删除或恢复自己的文件包');
 if(['archive','unarchive'].includes(action)&&!transferArchiveAllowed(db,row,user))throw Error('没有归档此文件包的权限');
 if(Number(db.prepare('SELECT revision FROM transfer_packages WHERE id=?').get(row.id)?.revision)!==revision)throw Error('文件包已更新，请重新检查');
 let next='';if(action==='archive'&&hasPermission(user,'transfer.archive')&&row.lifecycle==='active')next='archived';if(action==='unarchive'&&hasPermission(user,'transfer.archive')&&row.lifecycle==='archived')next='active';if(action==='delete'&&hasPermission(user,'transfer.delete')&&row.lifecycle!=='deleted')next='deleted';if(action==='restore'&&hasPermission(user,'transfer.delete')&&row.lifecycle==='deleted')next=row.previous_lifecycle;
 if(!next)throw Error('没有操作权限或当前状态不允许');
 db.prepare('UPDATE transfer_packages SET lifecycle=?,previous_lifecycle=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(next,action==='delete'?row.lifecycle:row.previous_lifecycle,row.id);
 db.prepare('INSERT INTO audit_logs(user_id,action,object_type,object_id,details_json) VALUES(?,?,?,?,?)').run(user.id,'transfer.'+action,'transfer_package',String(row.id),JSON.stringify({projectId:user.projectId}));return row;
 });}

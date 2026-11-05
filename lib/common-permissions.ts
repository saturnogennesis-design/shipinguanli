import {permissionGroups,permissionGranted} from './permissions';
import type {DatabaseSync} from 'node:sqlite';
export const commonCatalog=permissionGroups.filter(g=>['notice','report','admin','audit'].includes(g.key)).map(g=>({...g,permissions:g.permissions.filter(p=>!['admin.groups','admin.group_members'].includes(p.key))})).concat([{key:'project',label:'项目管理',permissions:[{key:'business.accounts',label:'管理项目与业务配置',description:'管理外部项目管理中的业务字段，不开放项目入口'}]}]);
export const commonKeys=commonCatalog.flatMap(g=>g.permissions.map(p=>p.key));
export function commonExpanded(keys:string[]){const set=new Set(keys);if(keys.some(k=>k.startsWith('notice.')&&k!=='notice.view'))set.add('notice.view');if(keys.some(k=>k.startsWith('report.')&&k!=='report.view'))set.add('report.view');if(keys.some(k=>k.startsWith('admin.')&&k!=='admin.view'))set.add('admin.view');return [...set];}
export function effectiveCommon(db:DatabaseSync,id:number,key:string){
 if(!db.prepare("SELECT 1 FROM users WHERE id=? AND status='active'").get(id))return false;
 const configured=db.prepare('SELECT permissions_json FROM user_common_permissions WHERE user_id=?').get(id);
 if(configured)return commonExpanded(JSON.parse(String(configured.permissions_json))).includes(key);
 const row=db.prepare('SELECT r.code,r.permissions_json FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND u.status=\'active\'').get(id);if(!row)return false;
 const overrides=db.prepare('SELECT permission_key,effect FROM user_permission_overrides WHERE user_id=?').all(id),denied=overrides.some(o=>o.permission_key===key&&o.effect==='deny');
 const keys=[...JSON.parse(String(row.permissions_json)),...overrides.filter(o=>o.effect==='allow').map(o=>String(o.permission_key))];
 return row.code==='super_admin'||!denied&&(permissionGranted(commonExpanded(keys),key)||key==='notice.receive'&&permissionGranted(keys,'notice.view'));
}

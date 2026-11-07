import {DatabaseSync} from 'node:sqlite';
import {mkdir,rm,stat,statfs,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
export function defaultDataRoot(platform=process.platform,env=process.env){return env.ORBIT_EMPLOYEE_DATA??(platform==='darwin'?join(env.HOME??'.','Library','Application Support','OrbitEmployee','data'):join(env.LOCALAPPDATA??env.HOME??'.','OrbitEmployee','data'));}
export const CACHE_LIMIT=5*1024**3,LEASE_MS=7*86400000;
export class ClientStore{
 constructor(root,{limit=CACHE_LIMIT}={}){this.root=root;this.limit=limit;mkdirSync(root,{recursive:true,mode:0o700});for(const p of ['cache','queue'])mkdirSync(join(root,p),{recursive:true,mode:0o700});const key=join(root,'credential.key');if(!existsSync(key))writeFileSync(key,randomBytes(32),{mode:0o600});this.key=readFileSync(key);this.db=new DatabaseSync(join(root,'client.sqlite'));this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY,v TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS accounts(ns TEXT PRIMARY KEY,user_json TEXT NOT NULL,cookie TEXT NOT NULL,origin TEXT NOT NULL,verified INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS records(ns TEXT NOT NULL,k TEXT NOT NULL,project INTEGER NOT NULL,json TEXT NOT NULL,stamp TEXT NOT NULL,touched INTEGER NOT NULL,PRIMARY KEY(ns,k));
 CREATE TABLE IF NOT EXISTS blobs(ns TEXT NOT NULL,k TEXT NOT NULL,path TEXT NOT NULL,size INTEGER NOT NULL,mime TEXT NOT NULL,touched INTEGER NOT NULL,PRIMARY KEY(ns,k));
 CREATE TABLE IF NOT EXISTS jobs(ns TEXT NOT NULL,id TEXT NOT NULL,project INTEGER NOT NULL,json TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'preparing',error TEXT NOT NULL DEFAULT '',result TEXT,created INTEGER NOT NULL,progress INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(ns,id));
 CREATE TABLE IF NOT EXISTS job_files(ns TEXT NOT NULL,job TEXT NOT NULL,idx INTEGER NOT NULL,path TEXT NOT NULL,sha256 TEXT NOT NULL,size INTEGER NOT NULL,PRIMARY KEY(ns,job,idx),FOREIGN KEY(ns,job) REFERENCES jobs(ns,id));`);if(!this.db.prepare('PRAGMA table_info(jobs)').all().some(c=>c.name==='progress'))this.db.exec('ALTER TABLE jobs ADD COLUMN progress INTEGER NOT NULL DEFAULT 0');}
 setting(k,fallback=null){const r=this.db.prepare('SELECT v FROM settings WHERE k=?').get(k);return r?JSON.parse(r.v):fallback;}
 set(k,v){this.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k,JSON.stringify(v));}
 seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);return Buffer.concat([iv,cipher.update(value),cipher.final(),cipher.getAuthTag()]).toString('base64');}
 unseal(value){const b=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-gcm',this.key,b.subarray(0,12));d.setAuthTag(b.subarray(-16));return Buffer.concat([d.update(b.subarray(12,-16)),d.final()]).toString();}
 account(){const ns=this.setting('active');if(!ns)return null;return this.db.prepare('SELECT * FROM accounts WHERE ns=?').get(ns)??null;}
 requireAccount(){const a=this.account();if(!a)throw Error('请先在线登录员工账号');if(Date.now()-a.verified>LEASE_MS)throw Error('离线查看已超过7天，请联网重新验证账号');return a;}
 login(ns,user,cookie,origin){this.db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?) ON CONFLICT(ns) DO UPDATE SET user_json=excluded.user_json,cookie=excluded.cookie,origin=excluded.origin,verified=excluded.verified').run(ns,JSON.stringify(user),this.seal(cookie),origin,Date.now());this.set('active',ns);this.set('origin',origin);}
 touchAccount(ns){this.db.prepare('UPDATE accounts SET verified=? WHERE ns=?').run(Date.now(),ns);}
 cachePath(ns,k){return join(this.root,'cache',createHash('sha256').update(ns+'\0'+k).digest('hex'));}
 queuePath(ns,id,index){return join(this.root,'queue',createHash('sha256').update(ns+'\0'+id+'\0'+index).digest('hex'));}
 async reserve(bytes){const s=await statfs(this.root);if(Number(s.bavail)*Number(s.bsize)<bytes+512*1024**2)throw Error('本机空间不足，请保留至少512MB空闲空间；未上传文件不会被自动删除');}
 async evict(incoming=0){let used=Number(this.db.prepare('SELECT coalesce(sum(size),0) n FROM blobs').get().n);for(const row of this.db.prepare('SELECT * FROM blobs ORDER BY touched').all()){if(used+incoming<=this.limit)break;await rm(row.path,{force:true});this.db.prepare('DELETE FROM blobs WHERE ns=? AND k=?').run(row.ns,row.k);used-=row.size;}if(used+incoming>this.limit)throw Error('文件超过本机缓存上限');}
 async clearNamespace(ns){for(const r of this.db.prepare('SELECT path FROM blobs WHERE ns=?').all(ns))await rm(r.path,{force:true});this.db.prepare('DELETE FROM blobs WHERE ns=?').run(ns);this.db.prepare('DELETE FROM records WHERE ns=?').run(ns);}
 async putRecord(ns,k,project,json,stamp){this.db.prepare('INSERT INTO records VALUES(?,?,?,?,?,?) ON CONFLICT(ns,k) DO UPDATE SET json=excluded.json,stamp=excluded.stamp,touched=excluded.touched').run(ns,k,project,JSON.stringify(json),stamp,Date.now());}
 async clearProject(ns,project){const keys=new Set(this.db.prepare('SELECT k FROM records WHERE ns=? AND project=?').all(ns,project).map(r=>r.k));for(const b of this.db.prepare('SELECT * FROM blobs WHERE ns=?').all(ns)){if([...keys].some(k=>b.k.startsWith(k+'|'))){await rm(b.path,{force:true});this.db.prepare('DELETE FROM blobs WHERE ns=? AND k=?').run(ns,b.k);}}this.db.prepare('DELETE FROM records WHERE ns=? AND project=?').run(ns,project);}
 async reconcile(ns,keys){for(const r of this.db.prepare('SELECT k FROM records WHERE ns=?').all(ns)){if(keys.has(r.k))continue;this.db.prepare('DELETE FROM records WHERE ns=? AND k=?').run(ns,r.k);for(const b of this.db.prepare('SELECT * FROM blobs WHERE ns=?').all(ns)){if(b.k.startsWith(r.k+'|')){await rm(b.path,{force:true});this.db.prepare('DELETE FROM blobs WHERE ns=? AND k=?').run(ns,b.k);}}}}
 async pruneBroken(){for(const r of this.db.prepare('SELECT * FROM blobs').all()){try{await stat(r.path);}catch{this.db.prepare('DELETE FROM blobs WHERE ns=? AND k=?').run(r.ns,r.k);}}await mkdir(join(this.root,'queue'),{recursive:true});const keep=new Set(this.db.prepare('SELECT path FROM blobs').all().map(r=>r.path));for(const name of await readdir(join(this.root,'cache'))){const path=join(this.root,'cache',name);if(!keep.has(path))await rm(path,{force:true});}for(const name of await readdir(join(this.root,'queue')))if(name.endsWith('.part'))await rm(join(this.root,'queue',name),{force:true});}
 close(){this.db.close();}
}

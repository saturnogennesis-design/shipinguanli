import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
const args=process.argv.slice(2),arg=(name)=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
function run(){
 const dbPath=arg('--db');if(!dbPath||!existsSync(dbPath))throw Error('Database not found. Run ExportTaskCheck.cmd inside the host installation folder.');
 const output=resolve(arg('--output')??'task-check.json'),root=resolve(arg('--install-dir')??process.cwd());
 if(resolve(dbPath)===output||/\.(?:sqlite|db)(?:-(?:wal|shm))?$/i.test(output))throw Error('Output must be a new JSON file, never a database file.');
 if(existsSync(output))throw Error('Output file already exists; choose a new file name.');
 const db=new DatabaseSync(resolve(dbPath),{readOnly:true});let report;
 try{
  db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=5000; BEGIN');
  const projects=db.prepare("SELECT id,name,code FROM short_video_accounts WHERE project_type='cross_border' ORDER BY id").all();
  const id=arg('--project-id');const selected=id?projects.filter(p=>p.id===Number(id)):projects.filter(p=>p.name===(arg('--project-name')??'月光峡谷'));
  if(selected.length!==1)throw Error('Choose one cross-border project with --project-id. Available: '+projects.map(p=>p.id+' '+p.name).join(', '));
  const project=selected[0],rows=db.prepare('SELECT id,kind,parent_id,main_id,package_type,title,status,lifecycle,version_number,revision,creator_id,maker_id,created_at,updated_at FROM cross_records WHERE project_id=? ORDER BY id').all(project.id);
  const tasks=db.prepare('SELECT id,stage,source_id,result_id,package_type,assignee_id,priority,status,task_key,manual_owner,revision,created_at,updated_at FROM cross_tasks WHERE project_id=? ORDER BY id').all(project.id);
  const workspace=db.prepare('SELECT enabled,updated_at FROM cross_task_workspaces WHERE project_id=?').get(project.id)??null;
  const users=db.prepare("SELECT id,display_name FROM users WHERE id IN (SELECT creator_id FROM cross_records WHERE project_id=? UNION SELECT maker_id FROM cross_records WHERE project_id=? UNION SELECT assignee_id FROM cross_tasks WHERE project_id=?) ORDER BY id").all(project.id,project.id,project.id);
  const files=db.prepare('SELECT record_id,count(*) AS total,sum(CASE WHEN active=1 THEN 1 ELSE 0 END) AS active FROM cross_files WHERE record_id IN (SELECT id FROM cross_records WHERE project_id=?) GROUP BY record_id').all(project.id);
  const versions=db.prepare('SELECT record_id,version_number,snapshot_json FROM cross_versions WHERE record_id IN (SELECT id FROM cross_records WHERE project_id=?) ORDER BY record_id,version_number').all(project.id).map(v=>{let s={};try{s=JSON.parse(v.snapshot_json);}catch{}return {recordId:v.record_id,version:v.version_number,parentId:s.parentId??null,mainId:s.mainId??null,packageType:s.packageType??null,title:s.title??null};});
  const types=db.prepare('SELECT code,name,media_type FROM cross_business_types WHERE project_id=? ORDER BY id').all(project.id);
  const byId=new Map(rows.map(r=>[r.id,r])),normal=s=>String(s??'').replace(/[-－—]\s*产品主图$/,'').trim(),notes=[];
  for(const t of tasks){
   const source=byId.get(t.source_id),result=byId.get(t.result_id);const reasons=[];
   if(!source)reasons.push('SOURCE_NOT_IN_PROJECT');
   if(result?.status==='approved'&&['todo','making','rejected'].includes(t.status))reasons.push('APPROVED_RESULT_IN_TODO');
   if(t.result_id&&!result)reasons.push('RESULT_NOT_IN_PROJECT');
   const exact=t.stage==='product'?rows.filter(r=>r.kind==='package'&&r.package_type==='main'&&r.parent_id===t.source_id):t.stage==='mother'?rows.filter(r=>r.kind==='mother'&&r.parent_id===t.source_id):[];
   const snapshot=t.stage==='product'?versions.filter(v=>v.packageType==='main'&&v.parentId===t.source_id).map(v=>v.recordId):[];
   const nameOnly=t.stage==='product'&&source?rows.filter(r=>r.kind==='package'&&r.package_type==='main'&&normal(r.title)===normal(source.title)).map(r=>r.id):[];
   if(!t.result_id&&exact.length)reasons.push('EMPTY_TASK_WITH_LINKED_RESULTS');
   if(!t.result_id&&snapshot.length)reasons.push('EMPTY_TASK_WITH_HISTORICAL_SOURCE_REFERENCES');
   if(!t.result_id&&nameOnly.length&&!exact.length)reasons.push('NAME_ONLY_MATCH_REQUIRES_MANUAL_REVIEW');
   if(reasons.length||t.stage==='product'&&['todo','making','rejected'].includes(t.status))notes.push({taskId:t.id,reasons,exactResultIds:exact.map(r=>r.id),historicalResultIds:[...new Set(snapshot)],nameOnlyCandidateIds:nameOnly,sourcePredatesWorkspace:Boolean(source&&workspace&&source.created_at<workspace.updated_at)});
  }
  let installedVersion=null,sourceCommit=null;try{installedVersion=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;}catch{}try{sourceCommit=JSON.parse(readFileSync(join(root,'release-manifest.json'),'utf8')).sourceCommit;}catch{}
  report={format:'orbit-task-check-v1',generatedAt:new Date().toISOString(),installedVersion,sourceCommit,project,workspace,summary:{records:rows.length,tasks:tasks.length,approvedMainProducts:rows.filter(r=>r.kind==='package'&&r.package_type==='main'&&r.status==='approved').length,productTasksInTodo:tasks.filter(t=>t.stage==='product'&&['todo','making','rejected'].includes(t.status)).length},reviewOnly:notes,records:rows,tasks,users,fileCounts:files,versionRelations:versions,businessTypes:types};
  db.exec('ROLLBACK');
 }finally{db.close();}
 writeFileSync(output,JSON.stringify(report,null,2),'utf8');console.log('Read-only task report exported: '+output);console.log('Database and business records were not changed.');
}
try{run();}catch(e){console.error('Export failed: '+e.message);process.exitCode=1;}

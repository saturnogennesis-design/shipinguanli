import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";

test("V3.3 material tags migration preserves existing material sets",()=>{
  const db=new DatabaseSync(":memory:"),dir=new URL("../drizzle/",import.meta.url);
  for(const name of readdirSync(dir).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
    if(name==="0023_material_center_v33.sql"){
      const role=db.prepare("INSERT INTO roles(code,name,data_scope,permissions_json) VALUES('v33','V33','self','[]') RETURNING id").get();
      const user=db.prepare("INSERT INTO users(username,display_name,password_hash,role_id,must_change_password) VALUES('v33','V33','x',?,0) RETURNING id").get(role.id);
      db.prepare("INSERT INTO material_sets(code,title,description,category,uploader_user_id) VALUES('MAT-OLD','旧素材','旧说明','产品展示',?)").run(user.id);
    }
    db.exec(readFileSync(new URL(name,dir),"utf8"));
  }
  const row=db.prepare("SELECT title,tags_json FROM material_sets WHERE code='MAT-OLD'").get();
  assert.deepEqual({...row},{title:"旧素材",tags_json:"[]"});
  db.close();
});

test("V3.3 material UI includes claim-only view, editing, previews and whole-set download",()=>{
  const ui=readFileSync(new URL("../app/material-center-v3.tsx",import.meta.url),"utf8");
  const listApi=readFileSync(new URL("../app/api/material-sets/route.ts",import.meta.url),"utf8");
  const detailApi=readFileSync(new URL("../app/api/material-sets/[id]/route.ts",import.meta.url),"utf8");
  const fileApi=readFileSync(new URL("../app/api/material-files/[id]/file/route.ts",import.meta.url),"utf8");
  assert.match(ui,/宫格/);assert.match(ui,/紧凑预览/);assert.match(ui,/编辑并重新提交/);assert.match(ui,/下载整套 ZIP/);assert.match(ui,/已领取/);
  assert.match(listApi,/claimOnly/);assert.match(listApi,/status=claimOnly\?"admitted"/);assert.match(detailApi,/audienceMode:claimOnly\?"claim":"manage"/);
  assert.match(fileApi,/claimOnly&&row\.set\.status!=="admitted"/);assert.match(fileApi,/claimOnly\?"claim":"view"/);
});

test("V3.4 migration preserves material sets and adds transactional edit state",()=>{
  const db=new DatabaseSync(":memory:"),dir=new URL("../drizzle/",import.meta.url);
  for(const name of readdirSync(dir).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
    if(name==="0024_material_workflow_v34.sql"){
      const role=db.prepare("INSERT INTO roles(code,name,data_scope,permissions_json) VALUES('v34','V34','self','[]') RETURNING id").get();
      const user=db.prepare("INSERT INTO users(username,display_name,password_hash,role_id,must_change_password) VALUES('v34','V34','x',?,0) RETURNING id").get(role.id);
      const set=db.prepare("INSERT INTO material_sets(code,title,description,category,uploader_user_id) VALUES('MAT-V34','保留素材','说明','产品展示',?) RETURNING id").get(user.id);
      db.prepare("INSERT INTO material_files(set_id,position,file_name,mime_type,file_size,storage_path,upload_status) VALUES(?,1,'old.jpg','image/jpeg',4,'old','complete')").run(set.id);
    }
    db.exec(readFileSync(new URL(name,dir),"utf8"));
  }
  const set=db.prepare("SELECT title,deleted_at,deleted_by_user_id FROM material_sets WHERE code='MAT-V34'").get();
  const file=db.prepare("SELECT file_name,draft_edit_token FROM material_files WHERE set_id=(SELECT id FROM material_sets WHERE code='MAT-V34')").get();
  assert.deepEqual({...set},{title:"保留素材",deleted_at:null,deleted_by_user_id:null});
  assert.deepEqual({...file},{file_name:"old.jpg",draft_edit_token:null});
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='material_set_views'").get());
  db.close();
});

test("V3.4 material workflow exposes staged save, auto claim, personal state and recycle bin",()=>{
  const ui=readFileSync(new URL("../app/material-center-v3.tsx",import.meta.url),"utf8");
  const detailApi=readFileSync(new URL("../app/api/material-sets/[id]/route.ts",import.meta.url),"utf8");
  const stageApi=readFileSync(new URL("../app/api/material-sets/[id]/files/route.ts",import.meta.url),"utf8");
  const downloadApi=readFileSync(new URL("../app/api/material-sets/[id]/download/route.ts",import.meta.url),"utf8");
  assert.match(ui,/可分多次多选/);assert.match(ui,/素材回收站/);assert.match(ui,/未领取/);assert.match(ui,/提交前预览/);
  assert.match(detailApi,/markViewed/);assert.match(detailApi,/action==="delete"/);assert.match(detailApi,/editToken/);
  assert.match(stageApi,/draftEditToken:token/);assert.match(stageApi,/material_set\.edit_cancel/);
  assert.match(downloadApi,/material_set\.download_claim/);assert.match(downloadApi,/materialDownloads/);
});

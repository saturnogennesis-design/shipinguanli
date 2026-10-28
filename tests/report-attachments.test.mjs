import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditReportAttachments, matchesReportSignature, reportFileType, MAX_REPORT_FILE_BYTES } from '../lib/report-attachments.ts';
const daily={submitterUserId:1,recipientUserId:2,status:'draft',templateCode:'RPT-DAILY'};
const creator={id:1,canReceive:false,canCreate:true};
test('daily accepts Word, Excel and PDF including uppercase names and no browser MIME',()=>{
  for(const name of ['日报.doc','日报.DOCX','表格.xls','表格.XLSX','附件.pdf'])assert.ok(reportFileType(name,'RPT-DAILY'));
  for(const name of ['run.exe','document.docx.exe','macro.xlsm','page.html','photo.png'])assert.equal(reportFileType(name,'RPT-DAILY'),null);
  assert.equal(MAX_REPORT_FILE_BYTES,20*1024*1024);
});
test('daily attachments can only be edited by the authorized draft owner',()=>{
  assert.equal(canEditReportAttachments(daily,creator),true);
  assert.equal(canEditReportAttachments(daily,{...creator,id:2,canReceive:true}),false);
  assert.equal(canEditReportAttachments(daily,{...creator,canCreate:false}),false);
  assert.equal(canEditReportAttachments({...daily,status:'submitted'},creator),false);
  assert.equal(canEditReportAttachments({...daily,status:'submitted'},{id:2,canReceive:true,canCreate:true}),false);
});
test('spoken-copy images retain recipient editing and supported image formats',()=>{
  assert.equal(canEditReportAttachments({...daily,status:'submitted',templateCode:'RPT-SPOKEN-COPY'},{id:2,canReceive:true,canCreate:false}),true);
  assert.equal(reportFileType('image.png','RPT-SPOKEN-COPY').mimeType,'image/png');
  assert.equal(reportFileType('file.docx','RPT-SPOKEN-COPY'),null);
});
test('file signatures reject renamed executable and invalid contents',()=>{
  const bytes=(...values)=>new Uint8Array(values);
  assert.equal(matchesReportSignature('doc',bytes(0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1)),true);
  assert.equal(matchesReportSignature('xls',bytes(0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1)),true);
  assert.equal(matchesReportSignature('docx',bytes(0x50,0x4b,3,4)),true);
  assert.equal(matchesReportSignature('xlsx',bytes(0x50,0x4b,3,4)),true);
  assert.equal(matchesReportSignature('pdf',new TextEncoder().encode('%PDF-1.7')),true);
  for(const type of ['doc','xls','docx','xlsx','pdf'])assert.equal(matchesReportSignature(type,new TextEncoder().encode('MZ executable')),false);
});

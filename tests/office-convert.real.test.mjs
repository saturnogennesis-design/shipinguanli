import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {convertLegacyOffice,OfficeConversionError} from '../lib/office-convert.ts';
if(!process.env.ORBIT_OFFICE_EXECUTABLE)throw Error('Set ORBIT_OFFICE_EXECUTABLE to an installed LibreOffice executable before running this real conversion test');
const exec=promisify(execFile);
async function document(name){
 const bytes=await readFile(new URL('./fixtures/office/'+name,import.meta.url));
 assert.equal(bytes.subarray(0,8).toString('hex'),'d0cf11e0a1b11ae1','fixture must be genuine legacy OLE binary, not renamed OOXML');
 return new Blob([bytes]).stream();
}
async function extract(pdf,name){
 const dir=await mkdtemp(join(tmpdir(),'orbit-real-pdf-'));
 try{
  const path=join(dir,'preview.pdf');await writeFile(path,pdf);
  const {stdout}=await exec('pdftotext',['-layout',path,'-'],{maxBuffer:1024*1024});
  if(process.env.ORBIT_OFFICE_QA_OUTPUT){await mkdir(process.env.ORBIT_OFFICE_QA_OUTPUT,{recursive:true});await writeFile(join(process.env.ORBIT_OFFICE_QA_OUTPUT,name+'.pdf'),pdf);}
  return stdout;
 }finally{await rm(dir,{recursive:true,force:true});}
}
test('real Word 97 binary converts to PDF with Chinese body and table preserved',async()=>{
 const pdf=await convertLegacyOffice(await document('daily-word.doc'),'doc');
 assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
 const text=(await extract(pdf,'daily-word')).replace(/\s/g,'');
 assert.ok(text.includes('日报附件验收'));assert.ok(text.includes('完成短视频制作3条'));assert.ok(text.includes('明日计划'));assert.ok(text.includes('项目数量'));assert.ok(text.includes('视频3'));
});
test('real Excel 97 binary converts all sheets, Chinese cells and formula results to PDF',async()=>{
 const pdf=await convertLegacyOffice(await document('daily-excel.xls'),'xls');
 const text=(await extract(pdf,'daily-excel')).replace(/\s/g,'');
 assert.ok(text.includes('拍摄素材'));assert.ok(text.includes('完成视频'));assert.ok(text.includes('旧版Excel预览验收'),'second worksheet must be present');assert.ok(text.includes('11'),'SUM result must survive conversion');
});
test('simultaneous real conversions remain isolated and reject excess concurrency',async()=>{
 const [word,excel]=await Promise.all([document('daily-word.doc'),document('daily-excel.xls')]);
 const first=convertLegacyOffice(word,'doc'),second=convertLegacyOffice(excel,'xls');
 await assert.rejects(()=>convertLegacyOffice(new Blob(['extra']).stream(),'doc'),error=>error instanceof OfficeConversionError&&error.status===429);
 const [wordPdf,excelPdf]=await Promise.all([first,second]);
 assert.ok((await extract(wordPdf,'concurrent-word')).includes('日报'));assert.ok((await extract(excelPdf,'concurrent-excel')).includes('拍摄素材'));
});
test('damaged legacy binary is rejected without a fake PDF result',async()=>{
 const bytes=new Uint8Array(512);bytes.set([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);
 await assert.rejects(()=>convertLegacyOffice(new Blob([bytes]).stream(),'doc'),error=>error instanceof OfficeConversionError&&error.status===422);
});

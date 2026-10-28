import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertLegacyOffice,OfficeConversionError } from '../lib/office-convert.ts';
async function fixture(t,script){
 const directory=await mkdtemp(join(tmpdir(),'orbit-converter-test-')),command=join(directory,'converter'),marker=join(directory,'profile-path');
 const original=process.env.ORBIT_OFFICE_EXECUTABLE;
 t.after(async()=>{if(original===undefined)delete process.env.ORBIT_OFFICE_EXECUTABLE;else process.env.ORBIT_OFFICE_EXECUTABLE=original;await rm(directory,{recursive:true,force:true});});
 await writeFile(command,'#!/usr/bin/env node\n'+script.replaceAll('MARKER',JSON.stringify(marker)),{mode:0o700});
 process.env.ORBIT_OFFICE_EXECUTABLE=command;return {directory,command,marker};
}
const body=()=>new Blob(['binary legacy fixture']).stream();
test('missing converter reports a clear unavailable status',async t=>{
 const {directory}=await fixture(t,'');process.env.ORBIT_OFFICE_EXECUTABLE=join(directory,'not-installed');
 await assert.rejects(()=>convertLegacyOffice(body(),'doc'),error=>error instanceof OfficeConversionError&&error.status===503);
});
test('converter returns PDF bytes and removes temporary document/profile after conversion',async t=>{
 const {marker}=await fixture(t,`const fs=require('node:fs'),path=require('node:path');const args=process.argv.slice(2);const out=args[args.indexOf('--outdir')+1];fs.writeFileSync(MARKER,path.dirname(out));fs.writeFileSync(path.join(out,'document.pdf'),'%PDF-1.7 converted');`);
 assert.equal((await convertLegacyOffice(body(),'xls')).toString(),'%PDF-1.7 converted');
 const directory=await readFile(marker,'utf8');await assert.rejects(()=>readFile(join(directory,'document.xls')),{code:'ENOENT'});
});
test('invalid conversion output is rejected instead of returning it as PDF',async t=>{
 await fixture(t,`const fs=require('node:fs'),path=require('node:path');const args=process.argv.slice(2);fs.writeFileSync(path.join(args[args.indexOf('--outdir')+1],'document.pdf'),'not a pdf');`);
 await assert.rejects(()=>convertLegacyOffice(body(),'doc'),error=>error instanceof OfficeConversionError&&error.status===422);
});

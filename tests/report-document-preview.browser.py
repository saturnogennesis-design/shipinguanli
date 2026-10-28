"""Runs the standalone local document parser in installed Chromium. No app DB or migrations."""
import base64
import io
import json
from pathlib import Path
import subprocess
import threading
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
source = subprocess.check_output(['node', '--input-type=module', '-e', 'import {stripTypeScriptTypes} from "node:module";import{readFileSync}from"node:fs";process.stdout.write(stripTypeScriptTypes(readFileSync("lib/office-preview.ts","utf8")));'], cwd=root)

def archive(files):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, body in files.items(): z.writestr(name, body)
    return base64.b64encode(buffer.getvalue()).decode()

word = archive({'word/document.xml': '<w:document xmlns:w="urn:word"><w:body><w:p><w:r><w:t>日报正文 &amp; 中文</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>完成项目</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'})
excel_files = {
    'xl/workbook.xml': '<workbook xmlns="urn:x" xmlns:r="urn:r"><sheets><sheet name="工作明细" r:id="rId1"/><sheet name="第二页" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>本周进度</t></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>123</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>&lt;script&gt;alert(1)&lt;/script&gt;</t></is></c></row></sheetData></worksheet>',
    'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row><c r="A1" t="b"><v>1</v></c></row></sheetData></worksheet>',
}
excel = archive(excel_files)
xxe = archive({'word/document.xml': '<!DOCTYPE a [<!ENTITY x SYSTEM "https://example.invalid/private">]><document><body>&x;</body></document>'})
large = archive({'word/document.xml': '<w:document xmlns:w="urn:w"><w:body>' + '<w:p><w:r><w:t>工作</w:t></w:r></w:p>'*1002 + '</w:body></w:document>'})
invalid = archive({'word/document.xml': '<w:document>'})
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body=source if self.path=='/preview.js' else b'<html><body>Preview tests</body></html>'
        self.send_response(200); self.send_header('Content-Type','text/javascript' if self.path=='/preview.js' else 'text/html'); self.end_headers(); self.wfile.write(body)
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        page=browser.new_page(); page.goto(f'http://127.0.0.1:{server.server_port}')
        result=page.evaluate('''async ({word,excel,xxe,large,invalid})=>{
          const {previewOffice}=await import('/preview.js');
          const data=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer;
          const w=await previewOffice(data(word),'docx'),x=await previewOffice(data(excel),'xlsx');
          let passed=0;const check=(test,label)=>{if(!test)throw Error(label);passed++;};
          check(w.kind==='word','word kind');check(w.blocks[0].text==='日报正文 & 中文','word text');
          check(w.blocks[1].rows[0][0]==='完成项目','word table');
          check(x.sheets.length===2,'multiple sheets');check(x.sheets[0].rows[0][0]==='本周进度','shared strings');
          check(x.sheets[0].rows[0][1]===''&&x.sheets[0].rows[0][2]==='123','sparse cell columns');
          check(x.sheets[0].rows[1][0]==='<script>alert(1)</script>','text is returned without execution');
          check(x.sheets[1].rows[0][0]==='是','boolean value');
          for(const value of [xxe,invalid]){let rejected=false;try{await previewOffice(data(value),'docx');}catch{rejected=true;}check(rejected,'unsafe or malformed XML');}
          let rejected=false;try{await previewOffice(new ArrayBuffer(3),'docx');}catch{rejected=true;}check(rejected,'invalid zip');
          const capped=await previewOffice(data(large),'docx');check(capped.truncated&&capped.blocks.length===1000,'bounded paragraphs');
          return {passed};
        }''',dict(word=word,excel=excel,xxe=xxe,large=large,invalid=invalid))
        print(json.dumps(result));browser.close()
finally: server.shutdown();server.server_close()

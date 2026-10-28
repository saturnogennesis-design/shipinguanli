// Local, bounded content preview. Does not execute Office macros or formulas.
export type OfficeBlock = {type:"paragraph";text:string}|{type:"table";rows:string[][]};
export type OfficePreview = {kind:"word";blocks:OfficeBlock[];truncated:boolean}|{kind:"excel";sheets:{name:string;rows:string[][]}[];truncated:boolean};
const MAX_XML = 4 * 1024 * 1024;
const MAX_TOTAL = 16 * 1024 * 1024;
const MAX_TEXT = 200_000;
const decoder = new TextDecoder();
const crcTable=Array.from({length:256},(_,value)=>{let crc=value;for(let i=0;i<8;i++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;return crc>>>0;});
function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
async function zipReader(buffer:ArrayBuffer) {
  const bytes=new Uint8Array(buffer),view=new DataView(buffer);
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) {
    if(view.getUint32(i,true)===0x06054b50 && i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
  }
  if(end<0)throw Error("文件不是有效的 Office 文档，或文件已损坏");
  const count=view.getUint16(end+10,true),centralSize=view.getUint32(end+12,true),start=view.getUint32(end+16,true);
  if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||count>2048||count===65535||start+centralSize>end)throw Error("此文档结构过大或不受支持，请下载原文件查看");
  const entries=new Map<string,{offset:number;compressed:number;size:number;method:number;flags:number;crc:number}>();
  let cursor=start,total=0;
  for(let i=0;i<count;i++) {
    if(cursor+46>end||view.getUint32(cursor,true)!==0x02014b50)throw Error("文档目录损坏");
    const flags=view.getUint16(cursor+8,true),method=view.getUint16(cursor+10,true),compressed=view.getUint32(cursor+20,true),size=view.getUint32(cursor+24,true);
    const nameLength=view.getUint16(cursor+28,true),extra=view.getUint16(cursor+30,true),comment=view.getUint16(cursor+32,true),offset=view.getUint32(cursor+42,true);
    if(cursor+46+nameLength+extra+comment>start+centralSize)throw Error("文档目录损坏");
    const name=decoder.decode(bytes.subarray(cursor+46,cursor+46+nameLength));
    if(entries.has(name))throw Error("文档包含重复文件，无法预览");
    entries.set(name,{flags,method,compressed,size,offset,crc:view.getUint32(cursor+16,true)});cursor+=46+nameLength+extra+comment;
  }
  return async(path:string,optional=false):Promise<string>=>{
    const entry=entries.get(path);
    if(!entry){if(optional)return "";throw Error("缺少文档正文，无法预览");}
    if(entry.flags&1)throw Error("加密文档无法在线预览，请下载原件查看");
    if(entry.size>MAX_XML||total+entry.size>MAX_TOTAL)throw Error("文档内容过大，请下载原文件查看");
    const offset=entry.offset;
    if(offset+30>start||view.getUint32(offset,true)!==0x04034b50)throw Error("文档数据损坏");
    const from=offset+30+view.getUint16(offset+26,true)+view.getUint16(offset+28,true);
    if(from+entry.compressed>start)throw Error("文档数据损坏");
    let output:Uint8Array;
    const compressed=bytes.slice(from,from+entry.compressed);
    if(entry.method===0)output=compressed;
    else if(entry.method===8){
      const reader=new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
      const chunks:Uint8Array[]=[];let length=0;
      try {for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>MAX_XML||length>entry.size)throw Error("文档解压大小异常");chunks.push(value);}}
      catch(error){await reader.cancel().catch(()=>{});throw error;}
      output=new Uint8Array(length);let at=0;for(const chunk of chunks){output.set(chunk,at);at+=chunk.length;}
    }else throw Error("此文档压缩格式不受支持，请下载原件查看");
    if(output.length!==entry.size||crc32(output)!==entry.crc)throw Error("文档内容不完整");
    total+=output.length;return decoder.decode(output);
  };
}
function xml(value:string) {
  if(/<!DOCTYPE|<!ENTITY/i.test(value))throw Error("文档包含不支持的 XML 声明");
  const document=new DOMParser().parseFromString(value,"application/xml");
  if(document.getElementsByTagName("parsererror").length)throw Error("文档内容损坏，无法预览");
  return document;
}
function elements(node:Document|Element,name:string) {return Array.from(node.getElementsByTagNameNS("*",name));}
function wordText(node:Element) {return elements(node,"t").map(item=>item.textContent??"").join("");}
function column(reference:string) {let value=0;for(const letter of reference.match(/^[A-Z]+/i)?.[0].toUpperCase()??"A")value=value*26+letter.charCodeAt(0)-64;return value-1;}
export async function previewOffice(buffer:ArrayBuffer,extension:"docx"|"xlsx"):Promise<OfficePreview> {
  const read=await zipReader(buffer);let truncated=false,textLength=0;
  const clip=(text:string)=>{const left=Math.max(0,MAX_TEXT-textLength),result=text.slice(0,left);textLength+=result.length;if(result.length<text.length)truncated=true;return result;};
  if(extension==="docx") {
    const document=xml(await read("word/document.xml")),body=elements(document,"body")[0];
    if(!body)throw Error("文档缺少正文");
    const blocks:OfficeBlock[]=[];
    for(const child of Array.from(body.children)) {
      if(blocks.length>=1000||textLength>=MAX_TEXT){truncated=true;break;}
      if(child.localName==="p")blocks.push({type:"paragraph",text:clip(wordText(child))});
      else if(child.localName==="tbl") {
        const rows=elements(child,"tr");if(rows.length>200)truncated=true;
        blocks.push({type:"table",rows:rows.slice(0,200).map(row=>{
          const cells=Array.from(row.children).filter(cell=>cell.localName==="tc");if(cells.length>50)truncated=true;
          return cells.slice(0,50).map(cell=>clip(elements(cell,"p").map(wordText).join("\n")));
        })});
      }
    }
    return {kind:"word",blocks,truncated};
  }
  const workbook=xml(await read("xl/workbook.xml")),relations=xml(await read("xl/_rels/workbook.xml.rels"));
  const targets=new Map(elements(relations,"Relationship").filter(item=>item.getAttribute("TargetMode")!=="External").map(item=>[item.getAttribute("Id"),item.getAttribute("Target")??""]));
  const sharedXml=await read("xl/sharedStrings.xml",true);
  const shared=sharedXml?elements(xml(sharedXml),"si").map(wordText):[];
  const sheets: {name:string;rows:string[][]}[]=[];
  const sheetElements=elements(workbook,"sheet");if(sheetElements.length>10)truncated=true;
  for(const sheet of sheetElements.slice(0,10)) {
    if(textLength>=MAX_TEXT){truncated=true;break;}
    const target=targets.get(sheet.getAttribute("r:id")??sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id"));
    if(!target)continue;
    const path=new URL(target,"https://local.invalid/xl/").pathname.slice(1);
    if(!path.startsWith("xl/worksheets/")||path.includes("\\"))throw Error("工作表路径无效");
    const document=xml(await read(path)),allRows=elements(document,"row");if(allRows.length>200)truncated=true;
    const rows:string[][]=[];
    for(const row of allRows.slice(0,200)) {
      const values:string[]=[];
      for(const cell of elements(row,"c")) {
        const index=column(cell.getAttribute("r")??"A1");if(index>=50){truncated=true;continue;}
        const kind=cell.getAttribute("t"),value=elements(cell,"v")[0]?.textContent??"";
        values[index]=clip(kind==="s"?shared[Number(value)]??"":kind==="inlineStr"?wordText(cell):kind==="b"?(value==="1"?"是":"否"):value);
      }
      rows.push(Array.from({length:values.length},(_,index)=>values[index]??""));
    }
    sheets.push({name:sheet.getAttribute("name")??"工作表",rows});
  }
  if(!sheets.length)throw Error("文档没有可预览的工作表");
  return {kind:"excel",sheets,truncated};
}

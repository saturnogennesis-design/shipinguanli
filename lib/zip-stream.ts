type ZipEntry={name:string;open:()=>Promise<ReadableStream|null>};
const encoder=new TextEncoder();
let crcTable:Uint32Array|undefined;
function table(){if(crcTable)return crcTable;crcTable=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0;}return crcTable;}
function updateCrc(crc:number,bytes:Uint8Array){const values=table();let c=crc;for(const byte of bytes)c=values[(c^byte)&255]^(c>>>8);return c>>>0;}
function u16(view:DataView,offset:number,value:number){view.setUint16(offset,value,true);}function u32(view:DataView,offset:number,value:number){view.setUint32(offset,value>>>0,true);}
function localHeader(name:Uint8Array){const bytes=new Uint8Array(30+name.length),view=new DataView(bytes.buffer);u32(view,0,0x04034b50);u16(view,4,20);u16(view,6,0x0808);u16(view,8,0);u16(view,26,name.length);bytes.set(name,30);return bytes;}
function descriptor(crc:number,size:number){const bytes=new Uint8Array(16),view=new DataView(bytes.buffer);u32(view,0,0x08074b50);u32(view,4,crc);u32(view,8,size);u32(view,12,size);return bytes;}
function central(name:Uint8Array,crc:number,size:number,offset:number){const bytes=new Uint8Array(46+name.length),view=new DataView(bytes.buffer);u32(view,0,0x02014b50);u16(view,4,20);u16(view,6,20);u16(view,8,0x0808);u16(view,10,0);u32(view,16,crc);u32(view,20,size);u32(view,24,size);u16(view,28,name.length);u32(view,42,offset);bytes.set(name,46);return bytes;}
function end(count:number,size:number,offset:number){const bytes=new Uint8Array(22),view=new DataView(bytes.buffer);u32(view,0,0x06054b50);u16(view,8,count);u16(view,10,count);u32(view,12,size);u32(view,16,offset);return bytes;}

export function zipStream(entries:ZipEntry[]){
 async function* chunks(){
  const records:Array<{name:Uint8Array;crc:number;size:number;offset:number}>=[];let offset=0;
  for(const entry of entries){
   const body=await entry.open();if(!body)continue;
   const name=encoder.encode(entry.name),header=localHeader(name),start=offset;
   if(name.length>65535||records.length>=65535)throw Error('ZIP32目录过大，请减少下载数量');
   offset+=header.length;let crc=0xffffffff,size=0;const reader=body.getReader();let finished=false;
   try{yield header;for(;;){const {done,value}=await reader.read();if(done){finished=true;break;}if(size+value.byteLength>0xffffffff||offset+value.byteLength>0xffffffff)throw Error('ZIP32文件过大，请分批下载');crc=updateCrc(crc,value);size+=value.byteLength;offset+=value.byteLength;yield value;}}
   finally{if(!finished)await reader.cancel().catch(()=>{});reader.releaseLock();}
   crc=(crc^0xffffffff)>>>0;const tail=descriptor(crc,size);offset+=tail.length;yield tail;records.push({name,crc,size,offset:start});
  }
  const centralOffset=offset;for(const record of records){const bytes=central(record.name,record.crc,record.size,record.offset);offset+=bytes.length;yield bytes;}yield end(records.length,offset-centralOffset,centralOffset);
 }
 const iterator=chunks();return new ReadableStream<Uint8Array>({async pull(controller){try{const next=await iterator.next();if(next.done)controller.close();else controller.enqueue(next.value);}catch(error){controller.error(error);}},async cancel(){await iterator.return();}});
}

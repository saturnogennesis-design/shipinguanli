export const MAX_REPORT_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_REPORT_ATTACHMENTS = 10;
const documentTypes: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  pdf: "application/pdf",
};
const imageTypes: Record<string, string> = {jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",gif:"image/gif"};
export function reportFileType(name: string, templateCode: string) {
  const extension = name.toLowerCase().split(".").pop() ?? "";
  const mimeType = templateCode === "RPT-DAILY" ? documentTypes[extension] : templateCode === "RPT-SPOKEN-COPY" ? imageTypes[extension] : undefined;
  return mimeType ? {extension,mimeType} : null;
}
export function canEditReportAttachments(report: {submitterUserId:number;recipientUserId:number|null;status:string;templateCode:string}, user: {id:number;canReceive:boolean;canCreate:boolean}) {
  return (report.templateCode === "RPT-DAILY" && report.status === "draft" && report.submitterUserId === user.id && user.canCreate);
}
export function matchesReportSignature(extension: string, bytes: Uint8Array) {
  const starts = (...values:number[]) => values.every((value,index)=>bytes[index]===value);
  if(extension === "docx" || extension === "xlsx") return starts(0x50,0x4b,0x03,0x04);
  if(extension === "doc" || extension === "xls") return starts(0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1);
  if(extension === "pdf") return starts(0x25,0x50,0x44,0x46,0x2d);
  if(extension === "png") return starts(137,80,78,71,13,10,26,10);
  if(extension === "jpg" || extension === "jpeg") return starts(255,216,255);
  if(extension === "gif") return new TextDecoder().decode(bytes.slice(0,6)).match(/^GIF8[79]a$/) !== null;
  return extension === "webp" && new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP";
}

export function reportAttachmentName(name:string) {
  const clean=name.replace(/[\\/\x00-\x1f\x7f]/g,"_");
  if(clean.length<=160)return clean;
  const dot=clean.lastIndexOf(".");
  const suffix=dot>=0?clean.slice(dot):"";
  return clean.slice(0,Math.max(1,160-suffix.length))+suffix;
}

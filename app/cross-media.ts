export function crossMedia(id:number,project:number,thumb=false){return `/api/cross-records/files/${id}?projectId=${project}${thumb?'&thumb=1':''}`;}

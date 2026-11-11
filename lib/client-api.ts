export class ProjectApiError extends Error {
 constructor(message:string,public readonly details:Record<string,unknown>){super(message);this.name='ProjectApiError';}
}
// Retry reads only. Never repeat writes after a truncated acknowledgement.
export async function requestProjectJson(url:string,body?:unknown,method='POST'){
 const verb=body===undefined?'GET':method.toUpperCase(),read=verb==='GET';
 for(let attempt=0;attempt<(read?2:1);attempt++){
  let response:Response,raw:string;
  try{response=await fetch(url,body===undefined?{cache:'no-store'}:{method:verb,headers:{'content-type':'application/json'},body:JSON.stringify(body)});raw=await response.text();}
  catch(error){if(error instanceof Error&&error.name==='AbortError')throw error;if(read&&attempt===0)continue;throw new ProjectApiError(`连接服务器失败（${url}），请确认主机已启动后重试`,{url,network:true});}
  if(response.status===204&&!read)return {};
  let data;
  try{data=JSON.parse(raw.replace(/^\uFEFF/,''));if(data===null||typeof data!=='object')throw Error('invalid response');}
  catch{if(read&&attempt===0&&![401,403].includes(response.status))continue;const message=response.status===401?'登录已失效，请重新登录':response.status===403?'没有访问权限':!response.ok?`服务器返回错误（HTTP ${response.status}）`:raw.trim()?'接口返回内容不完整或格式异常':'接口返回空内容';throw new ProjectApiError(`${message}（${url}），请重试`,{url,status:response.status,invalidResponse:true});}
  if(!response.ok){if(read&&attempt===0&&[502,503,504].includes(response.status))continue;throw new ProjectApiError(typeof data.error==='string'?data.error:`读取失败（HTTP ${response.status}，${url}）`,{...data,url,status:response.status});}
  return data;
 }
 throw new ProjectApiError('读取失败，请重试',{url});
}

'use client';
import {createRoot} from 'react-dom/client';
import {CenterDialog} from './communication-center';
let active=false;
/** One confirmation at a time; callers await an explicit decision before writing. */
export function confirmAction(message:string):Promise<boolean>{
 if(typeof document==='undefined'||active)return Promise.resolve(false);
 active=true;
 return new Promise(resolve=>{const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let settled=false;const close=(answer:boolean)=>{if(settled)return;settled=true;root.unmount();host.remove();active=false;resolve(answer);};const dangerous=/删除|回收站|取消授权|放弃/.test(message);
 root.render(<CenterDialog compact title={dangerous?'请确认操作':'操作确认'} onClose={()=>close(false)}><div className="confirmation-message">{message.split(/\n+/).filter(Boolean).map((line,i)=><p key={i}>{line}</p>)}</div><footer><button onClick={()=>close(false)}>取消</button><button className={dangerous?'danger-button':'primary-button'} onClick={()=>close(true)}>确认继续</button></footer></CenterDialog>);
 });
}

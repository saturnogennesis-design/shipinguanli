"use client";
export type LampTarget={name:string;lamp_text?:string;lamp_color?:string};
export function lampText(target:LampTarget){return target.lamp_text?.trim()||target.name.slice(0,2)||'目标';}
export function lampColor(target:LampTarget){return /^#[0-9a-f]{6}$/i.test(target.lamp_color??'')?target.lamp_color!:'#2ca576';}
function textColor(color:string){const values=[1,3,5].map(index=>parseInt(color.slice(index,index+2),16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722>.42?'#172033':'#ffffff';}
export function PublishingLamp({target,lit=false,disabled=false,onClick,label}:{target:LampTarget;lit?:boolean;disabled?:boolean;onClick?:()=>void;label?:string}){
 const color=lit?lampColor(target):'#c9ced6';
 return <button type="button" className={`publishing-lamp ${lit?'lit':''}`} aria-label={label??target.name+'：'+(lit?'已发布':'未发布')} aria-pressed={lit} disabled={disabled} onClick={onClick} title={target.name+' · '+(lit?'已点亮':'未点亮')}><span className="publishing-lamp-face" style={{backgroundColor:color,color:lit?textColor(color):'#ffffff'}}><span>{lampText(target)}</span></span></button>;
}

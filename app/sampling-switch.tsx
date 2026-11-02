"use client";
export function SamplingSwitch({sampled,disabled=false,busy=false,onChange}:{sampled:boolean;disabled?:boolean;busy?:boolean;onChange?:(value:boolean)=>void}){
 return <button type="button" role="switch" aria-label="是否打样" aria-checked={sampled} aria-busy={busy||undefined} disabled={disabled||busy||!onChange} className="sampling-switch" onClick={e=>{e.stopPropagation();onChange?.(!sampled);}} title={disabled?'是否打样（只读）':'切换是否打样'}><span className="sampling-track" aria-hidden="true"><i/></span><span>{sampled?'已打样':'未打样'}</span></button>;
}

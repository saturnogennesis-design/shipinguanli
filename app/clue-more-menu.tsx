'use client';
import {useState,type ReactNode} from 'react';
import {CenterDialog} from './communication-center';
export function ClueMoreMenu({title,children}:{title:string;children:ReactNode}){const [open,setOpen]=useState(false);return <><button className="clue-more-button" aria-label={'更多操作：'+title} aria-haspopup="dialog" onClick={()=>setOpen(true)}>更多 <span aria-hidden="true">⋯</span></button>{open?<CenterDialog title="线索操作" onClose={()=>setOpen(false)}><div className="clue-more-dialog"><p>{title}</p>{children}</div></CenterDialog>:null}</>;}

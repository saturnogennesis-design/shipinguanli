"use client";
import {useEffect,useRef,useState} from 'react';
type Rail={element:HTMLElement;left:number;width:number;scrollWidth:number};
// One visible horizontal control follows the active wide table, including in dialogs.
export function ViewportTables(){
 const [rail,setRail]=useState<Rail|null>(null);const bar=useRef<HTMLDivElement>(null),active=useRef<HTMLElement|null>(null);
 useEffect(()=>{
  let frame=0;const observed=new Set<Element>();
  const selectors='.table-wrap,.communication-list,.expanded-content-list,.report-document-table,.recommendation-dialog-list';
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
  const resize=new ResizeObserver(schedule);
  function update(){frame=0;
   const tables=Array.from(document.querySelectorAll<HTMLElement>(selectors));
   const dialogs=Array.from(document.querySelectorAll<HTMLElement>('[role=dialog],.modal,.dashboard-preview,.recommendation-dialog,.permission-drawer')).filter(el=>el.getBoundingClientRect().height>0);const topDialog=dialogs.at(-1);
   let best:Rail|null=null,bestArea=0;
   for(const element of tables){if(!observed.has(element)){observed.add(element);resize.observe(element);if(element.firstElementChild){resize.observe(element.firstElementChild);observed.add(element.firstElementChild);}}
    const rect=element.getBoundingClientRect();const height=Math.max(160,window.innerHeight-Math.max(rect.top,100)-32);
    const next=`${Math.floor(height)}px`;if(element.style.getPropertyValue('--table-window-height')!==next)element.style.setProperty('--table-window-height',next);
    if(element.scrollWidth<=element.clientWidth+2||rect.width===0||rect.bottom<100||rect.top>window.innerHeight-45||(topDialog&&!topDialog.contains(element)))continue;
    const left=Math.max(8,rect.left),width=Math.min(window.innerWidth-8,rect.right)-left;const area=width*Math.max(0,Math.min(window.innerHeight-36,rect.bottom)-Math.max(rect.top,90));
    if(area>bestArea){bestArea=area;best={element,left,width,scrollWidth:element.scrollWidth};}
   }
   for(const element of observed)if(!element.isConnected){resize.unobserve(element);observed.delete(element);}
   active.current=best?.element??null;
   setRail(old=>old?.element===best?.element&&old?.left===best?.left&&old?.width===best?.width&&old?.scrollWidth===best?.scrollWidth?old:best);
   if(bar.current&&best&&Math.abs(bar.current.scrollLeft-best.element.scrollLeft)>1)bar.current.scrollLeft=best.element.scrollLeft;
  }
  const mutation=new MutationObserver(schedule);mutation.observe(document.querySelector('.project-workspace')??document.body,{childList:true,subtree:true});
  window.addEventListener('resize',schedule);document.addEventListener('scroll',schedule,true);schedule();
  return()=>{cancelAnimationFrame(frame);resize.disconnect();mutation.disconnect();window.removeEventListener('resize',schedule);document.removeEventListener('scroll',schedule,true);};
 },[]);
 useEffect(()=>{if(bar.current&&rail)bar.current.scrollLeft=rail.element.scrollLeft;},[rail]);
 // Native overflow regions need keyboard focus so arrow keys can scroll without a mouse.
 // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
 return rail?<div className="viewport-table-rail" style={{left:rail.left,width:rail.width}}><small>左右滚动表格</small><div ref={bar} tabIndex={0} role="region" aria-label="当前表格横向滚动" onScroll={event=>{if(active.current)active.current.scrollLeft=event.currentTarget.scrollLeft;}}><div style={{width:rail.scrollWidth,height:1}}/></div></div>:null;
}

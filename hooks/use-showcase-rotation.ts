"use client";
import {useEffect,useState,useSyncExternalStore,type RefObject} from 'react';

export const SHOWCASE_CYCLE_MS=7500;
function subscribeBrowserState(notify:()=>void){
 const media=window.matchMedia('(prefers-reduced-motion: reduce)');
 media.addEventListener('change',notify);document.addEventListener('visibilitychange',notify);
 return()=>{media.removeEventListener('change',notify);document.removeEventListener('visibilitychange',notify);};
}
const browserState=()=>Number(window.matchMedia('(prefers-reduced-motion: reduce)').matches)+2*Number(document.hidden);
const serverState=()=>1;
export function useShowcaseRotation(count:number,root:RefObject<HTMLElement|null>){
  const [index,setIndex]=useState(0),[paused,setPaused]=useState(false);
  const [hovered,setHovered]=useState(false),[focused,setFocused]=useState(false);
  const browser=useSyncExternalStore(subscribeBrowserState,browserState,serverState);
  const reduced=!!(browser&1),hidden=!!(browser&2),[visible,setVisible]=useState(true);
  useEffect(()=>{
    const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>setVisible(entries[0]?.isIntersecting??false),{threshold:0.2});
    if(observer&&root.current)observer.observe(root.current);
    return()=>observer?.disconnect();
  },[root]);
  const running=count>1&&!paused&&!hovered&&!focused&&!reduced&&visible&&!hidden;
  useEffect(()=>{
    if(!running)return;
    const timer=setTimeout(()=>setIndex(current=>(current+1)%count),SHOWCASE_CYCLE_MS);
    return()=>clearTimeout(timer);
  },[running,index,count]);
  function select(next:number){setPaused(true);setIndex(((next%count)+count)%count);}
  function step(direction:number){setPaused(true);setIndex(current=>((current+direction)%count+count)%count);}
  return {index,paused,running,reduced,setHovered,setFocused,select,step,toggle:()=>setPaused(value=>!value)};
}

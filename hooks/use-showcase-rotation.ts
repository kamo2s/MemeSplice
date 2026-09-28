"use client";
import {useEffect,useRef,useState} from 'react';

export const SHOWCASE_CYCLE_MS=7500;
export function useShowcaseRotation(count:number){
  const root=useRef<HTMLElement|null>(null);
  const [index,setIndex]=useState(0),[paused,setPaused]=useState(false);
  const [hovered,setHovered]=useState(false),[focused,setFocused]=useState(false);
  const [reduced,setReduced]=useState(true),[visible,setVisible]=useState(false),[hidden,setHidden]=useState(false);
  useEffect(()=>{
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion=()=>setReduced(media.matches),visibility=()=>setHidden(document.hidden);
    motion();visibility();media.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility);
    const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>setVisible(entries[0]?.isIntersecting??false),{threshold:0.2});
    if(observer&&root.current)observer.observe(root.current);else setVisible(true);
    return()=>{media.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);observer?.disconnect();};
  },[]);
  const running=count>1&&!paused&&!hovered&&!focused&&!reduced&&visible&&!hidden;
  useEffect(()=>{
    if(!running)return;
    const timer=setTimeout(()=>setIndex(current=>(current+1)%count),SHOWCASE_CYCLE_MS);
    return()=>clearTimeout(timer);
  },[running,index,count]);
  function select(next:number){setPaused(true);setIndex(((next%count)+count)%count);}
  function step(direction:number){setPaused(true);setIndex(current=>((current+direction)%count+count)%count);}
  return {root,index,paused,running,reduced,setHovered,setFocused,select,step,toggle:()=>setPaused(value=>!value)};
}

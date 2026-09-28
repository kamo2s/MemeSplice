"use client";
import {useEffect,useId,useRef} from "react";
import styles from "./chamber.module.css";

// Shared hero / generation visual. Animation never initiates a generation request.
export function Chamber({active=false,status="READY TO SPLICE"}:{active?:boolean;status?:string}){
  const root=useRef<HTMLDivElement>(null),id=useId().replace(/:/g,"");
  useEffect(()=>{
    const element=root.current;if(!element)return;
    let visible=true;
    const update=()=>{element.dataset.paused=String(!visible||document.hidden);};
    const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;update();});
    observer.observe(element);document.addEventListener('visibilitychange',update);update();
    return()=>{observer.disconnect();document.removeEventListener('visibilitychange',update);};
  },[]);
  return <div ref={root} className={`dna-fusion ${styles.root} ${active?styles.active:''}`} role="img" aria-label={`DNA ${active?'splicing in progress':'helix'}: ${status}`}>
    <div className={styles.stage} aria-hidden="true">
      <div className={styles.aura}/><div className={styles.halo}/>
      <svg className={styles.energy} viewBox="0 0 400 360" fill="none">
        <defs><linearGradient id={`${id}-energy`} x1="0" x2="400" gradientUnits="userSpaceOnUse"><stop stopColor="#ca51ff" stopOpacity="0"/><stop offset=".2" stopColor="#db64ff"/><stop offset=".5" stopColor="#a579ff"/><stop offset=".8" stopColor="#699bff"/><stop offset="1" stopColor="#568fff" stopOpacity="0"/></linearGradient></defs>
        <path className={styles.waveGlow} d="M0 184C45 139 53 228 96 183S147 174 200 184S248 136 290 182S351 145 400 177" stroke={`url(#${id}-energy)`}/>
        <path className={styles.wave} d="M0 184C45 139 53 228 96 183S147 174 200 184S248 136 290 182S351 145 400 177" stroke={`url(#${id}-energy)`}/>
        <path className={styles.waveSecondary} d="M0 194C44 156 58 219 99 195S157 158 200 191S254 151 297 193S365 158 400 190" stroke={`url(#${id}-energy)`}/>
      </svg>
      <div className={styles.artwork}><img src="/images/lab/dna-fusion.webp" alt="" width={640} height={960} decoding="async" draggable={false}/></div>
      <div className={`${styles.orbit} ${styles.orbitOne}`}><i/></div>
      <div className={`${styles.orbit} ${styles.orbitTwo}`}><i/></div>
      <div className={`${styles.orbit} ${styles.orbitThree}`}><i/></div>
      <div className={styles.sparks}>{Array.from({length:6},(_,i)=><i key={i}/>)}</div>
    </div>
    <div className={styles.status}><span/>{status}<span/></div>
    <div className={styles.indicator} aria-hidden="true"><i/><i/><i/></div>
  </div>;
}

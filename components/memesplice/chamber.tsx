"use client";
import {useEffect,useId,useRef} from "react";
import styles from "./chamber.module.css";

export function Chamber({active=false,status="READY TO SPLICE"}:{active?:boolean;status?:string}){
  const id=useId().replace(/:/g,""),canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const element=canvas.current;if(!element)return;
    const ctx=element.getContext("2d");if(!ctx)return;
    const motion=window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame=0,visible=true,last=0,phase=0;
    const width=110,height=220,ratio=Math.min(window.devicePixelRatio||1,2);
    element.width=width*ratio;element.height=height*ratio;ctx.scale(ratio,ratio);
    function draw(time:number){
      if(!ctx)return;
      const dt=last?Math.min(time-last,50):0;last=time;
      if(!motion.matches)phase+=dt*(active?.0011:.00035);
      ctx.clearRect(0,0,width,height);
      const glow=ctx.createRadialGradient(55,110,3,55,110,92);glow.addColorStop(0,active?'#a658f52b':'#9751d915');glow.addColorStop(1,'#7037ad00');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
      const points=Array.from({length:65},(_,i)=>{
        const angle=i/64*Math.PI*4+phase;return {y:13+i*3,x:55+Math.sin(angle)*29,z:Math.cos(angle),other:55-Math.sin(angle)*29};
      });
      // Back-facing bonds are quieter; highlights move with the helix, not its container.
      for(let i=0;i<points.length;i+=3){const p=points[i];ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.other,p.y);ctx.strokeStyle=`rgba(208,162,255,${.16+Math.abs(p.z)*.26})`;ctx.lineWidth=1;ctx.stroke();}
      const segments=[];for(let side=0;side<2;side++)for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];segments.push({x1:side?a.other:a.x,x2:side?b.other:b.x,y1:a.y,y2:b.y,z:side?-b.z:b.z});}
      segments.sort((a,b)=>a.z-b.z);
      for(const s of segments){ctx.beginPath();ctx.moveTo(s.x1,s.y1);ctx.lineTo(s.x2,s.y2);ctx.lineCap='round';ctx.lineWidth=1.7+(s.z+1)*.65;ctx.strokeStyle=`rgba(${s.z>0?'237,203,255':'163,104,215'},${.42+(s.z+1)*.27})`;ctx.shadowColor='#c47aff';ctx.shadowBlur=s.z>0?(active?9:5):0;ctx.stroke();}
      ctx.shadowBlur=0;
      for(let i=0;i<(active?25:11);i++){const y=((i*43+phase*17)%206)+7,x=55+Math.sin(i*8.3+phase*.35)*(33+i%15);ctx.fillStyle=`rgba(212,164,255,${.12+(Math.sin(phase+i)+1)*.15})`;ctx.beginPath();ctx.arc(x,y,i%4===0?1:.55,0,Math.PI*2);ctx.fill();}
      if(active){const y=motion.matches?110:20+(Math.sin(phase*.8)+1)*90;const beam=ctx.createLinearGradient(4,y,106,y);beam.addColorStop(0,'#b77dff00');beam.addColorStop(.5,'#efccffcc');beam.addColorStop(1,'#b77dff00');ctx.fillStyle=beam;ctx.shadowColor='#c782ff';ctx.shadowBlur=12;ctx.fillRect(4,y,102,1);ctx.shadowBlur=0;}
      if(visible&&!document.hidden&&!motion.matches)frame=requestAnimationFrame(draw);
    }
    function restart(){cancelAnimationFrame(frame);last=0;if(visible&&!document.hidden)draw(performance.now());}
    const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;restart();});observer.observe(element);
    motion.addEventListener('change',restart);document.addEventListener('visibilitychange',restart);restart();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();motion.removeEventListener('change',restart);document.removeEventListener('visibilitychange',restart);};
  },[active]);
  return <div className={`chamber ${styles.root} ${active?styles.active:''}`} role="img" aria-label={`${active?'DNA mutation in progress':'DNA mutation chamber'}: ${status}`}>
    <div className={styles.instrument} aria-hidden="true">
      <div className={styles.aura}/><div className={`${styles.feed} ${styles.feedLeft}`}/><div className={`${styles.feed} ${styles.feedRight}`}/>
      <svg className={styles.shell} viewBox="0 0 180 292" fill="none">
        <defs>
          <linearGradient id={`${id}-metal`} x1="10" y1="0" x2="171" y2="0" gradientUnits="userSpaceOnUse"><stop stopColor="#151321"/><stop offset=".12" stopColor="#595360"/><stop offset=".21" stopColor="#211d31"/><stop offset=".5" stopColor="#0c0b17"/><stop offset=".8" stopColor="#282039"/><stop offset=".91" stopColor="#5d536b"/><stop offset="1" stopColor="#15121e"/></linearGradient>
          <linearGradient id={`${id}-glass`} x1="26" y1="0" x2="154" y2="0" gradientUnits="userSpaceOnUse"><stop stopColor="#ca91ff" stopOpacity=".25"/><stop offset=".09" stopColor="#9456ca" stopOpacity=".04"/><stop offset=".43" stopColor="#b271ec" stopOpacity=".08"/><stop offset=".84" stopColor="#190f30" stopOpacity=".1"/><stop offset=".97" stopColor="#e4bdff" stopOpacity=".21"/><stop offset="1" stopColor="#b878ed" stopOpacity=".35"/></linearGradient>
          <radialGradient id={`${id}-pool`}><stop stopColor="#f5d8ff"/><stop offset=".28" stopColor="#c581ff" stopOpacity=".8"/><stop offset="1" stopColor="#7133b8" stopOpacity="0"/></radialGradient>
          <linearGradient id={`${id}-beam`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#b868ff" stopOpacity=".25"/><stop offset="1" stopColor="#9f55ec" stopOpacity="0"/></linearGradient>
        </defs>
        <ellipse cx="90" cy="278" rx="85" ry="12" fill={`url(#${id}-pool)`} opacity=".35"/>
        <path d="M25 39 Q90 20 155 39 V229 Q90 249 25 229Z" fill={`url(#${id}-glass)`} stroke="#9c69be" strokeOpacity=".5"/>
        <path d="M30 46V226M150 46V226" stroke="#e4b8ff" strokeOpacity=".43"/>
        <path d="M35 52V218M145 52V218" stroke="#d5a7fb" strokeOpacity=".11" strokeWidth="3"/>
        <path d="M65 44H115L137 205H43Z" fill={`url(#${id}-beam)`}/>
        <ellipse cx="90" cy="46" rx="63" ry="10" stroke="#cb8bff" strokeWidth="1.4" className={styles.ring}/>
        <ellipse cx="90" cy="46" rx="28" ry="7" fill={`url(#${id}-pool)`}/>
        <ellipse cx="90" cy="228" rx="65" ry="13" fill={`url(#${id}-pool)`} opacity=".7"/>
        <ellipse cx="90" cy="227" rx="62" ry="9" stroke="#b977ec" strokeWidth="1.2" className={styles.ring}/>
        {Array.from({length:12},(_,i)=><path key={i} d={`M37 ${70+i*12}h${i%3===0?6:3} M143 ${70+i*12}h-${i%3===0?6:3}`} stroke="#cca0ec" strokeOpacity=".32" strokeWidth=".6"/>)}
        <text x="133" y="81" fill="#a888be" fontSize="5" fontFamily="monospace" textAnchor="middle">GEN</text><text x="133" y="90" fill="#d4b3ec" fontSize="7" fontFamily="monospace" textAnchor="middle">01</text>
        <ellipse cx="90" cy="19" rx="68" ry="12" fill="#151020" stroke="#735886" strokeWidth=".8"/>
        <path d="M12 23Q90 1 168 23V38Q90 61 12 38Z" fill={`url(#${id}-metal)`} stroke="#66536f" strokeWidth=".7"/>
        <ellipse cx="90" cy="23" rx="78" ry="12" fill="#191523" stroke="#7e698d" strokeWidth=".8"/>
        <path d="M17 25Q90 5 162 25" stroke="#aaa0b8" strokeOpacity=".3"/>
        <path d="M14 37Q90 58 166 37" stroke="#090813" strokeWidth="3"/>
        <path d="M22 42Q90 60 158 42" stroke="#c385f3" strokeOpacity=".7"/>
        <path d="M9 239Q90 216 171 239V268Q90 293 9 268Z" fill={`url(#${id}-metal)`} stroke="#756080" strokeWidth=".8"/>
        <ellipse cx="90" cy="239" rx="81" ry="13" fill="#21182f" stroke="#ad78cf" strokeWidth=".7"/>
        <ellipse cx="90" cy="236" rx="68" ry="9" fill="#20142e" stroke="#d5a1f5" strokeOpacity=".75"/>
        <ellipse cx="90" cy="235" rx="64" ry="8" fill={`url(#${id}-pool)`}/>
        <path d="M10 246Q90 266 170 246M11 269Q90 291 169 269" stroke="#090912" strokeWidth="2"/>
        <text x="90" y="261" fill="#debbfa" textAnchor="middle" fontSize="7" letterSpacing="1.4" fontFamily="sans-serif">MUTATION LAB</text>
        <text x="90" y="272" fill="#9980ad" textAnchor="middle" fontSize="5" letterSpacing="2.6" fontFamily="monospace">SP — 001</text>
      </svg>
      <canvas ref={canvas} className={styles.helix}/>
    </div>
    <div className={styles.status}><span/>{status}</div>
  </div>;
}

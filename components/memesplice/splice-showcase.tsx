"use client";
import {useRef,type CSSProperties} from 'react';
import {ArrowRight,ChevronLeft,ChevronRight,Dna,Pause,Play,Plus,Sparkles} from 'lucide-react';
import {showcaseItems} from '@/lib/showcase/repository';
import type {Coin} from '@/lib/memesplice/types';
import {SHOWCASE_CYCLE_MS,useShowcaseRotation} from '@/hooks/use-showcase-rotation';
import {LabBackdrop} from './lab-backdrop';
import styles from './splice-showcase.module.css';

export function SpliceShowcase({onTry,onMakeOwn,disabled=false}:{onTry:(parents:[Coin,Coin])=>void;onMakeOwn:()=>void;disabled?:boolean}){
  const rotation=useShowcaseRotation(showcaseItems.length),touch=useRef<{x:number;y:number}|null>(null);
  const item=showcaseItems[rotation.index];
  return <section id="splice-showcase" ref={rotation.root} className={`${styles.section} container lab-scene`} aria-labelledby="showcase-title" aria-roledescription="carousel"
    onPointerEnter={event=>{if(event.pointerType==='mouse')rotation.setHovered(true);}} onPointerLeave={event=>{if(event.pointerType==='mouse')rotation.setHovered(false);}}
    onFocusCapture={()=>rotation.setFocused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))rotation.setFocused(false);}}>
    <LabBackdrop scene="showcase"/>
    <div className={`section-heading ${styles.heading}`}><div><div className="eyebrow"><Dna size={14}/> THE SPLICE SHOWCASE</div><h2 id="showcase-title">Born in the Lab</h2><p>Two familiar memes. One unexpected offspring.</p></div><span className={styles.prepared}><span/> Prepared creations</span></div>
    <div className={styles.panel} data-showcase-id={item.id} data-rotating={rotation.running} data-reduced-motion={rotation.reduced} style={{'--showcase-cycle':`${SHOWCASE_CYCLE_MS}ms`} as CSSProperties}>
      <div className={`${styles.stage} ${rotation.running?styles.animated:''}`} key={item.id} role="group" aria-roledescription="slide" aria-label={`${rotation.index+1} of ${showcaseItems.length}: ${item.parentA.ticker} and ${item.parentB.ticker} create ${item.offspring.name}`}
        onTouchStart={event=>{const point=event.touches[0];touch.current={x:point.clientX,y:point.clientY};}}
        onTouchEnd={event=>{const start=touch.current;touch.current=null;const end=event.changedTouches[0];if(start&&Math.abs(end.clientX-start.x)>48&&Math.abs(end.clientX-start.x)>Math.abs(end.clientY-start.y)*1.3)rotation.step(end.clientX<start.x?1:-1);}}
        onTouchCancel={()=>{touch.current=null;}}>
        <div className={styles.parents}>
          {[item.parentA,item.parentB].map((parent,i)=><div key={parent.id} className={styles.parentGroup}>{i===1&&<Plus className={styles.plus} size={18} aria-hidden="true"/>}<div className={styles.parent}><small>PARENT {i===0?'A':'B'}</small><img src={parent.image.url!} alt={parent.name} width={112} height={112} draggable={false}/><b>{parent.ticker}</b><span>{parent.name}</span></div></div>)}
        </div>
        <div className={styles.bridge} aria-hidden="true"><span className={styles.energy}/><div className={styles.core}><Dna size={30}/></div><span className={styles.energy}/><span className={styles.coreLabel}>MEME DNA</span></div>
        <article className={styles.result} aria-label={`Prepared offspring ${item.offspring.name}`}><div className={styles.resultArt}><img src={item.offspring.image} alt={item.offspring.name} width={240} height={240} draggable={false}/><span><Sparkles size={11}/> OFFSPRING</span></div><div className={styles.resultCopy}><small>A NEW MEME IDENTITY</small><h3>{item.offspring.name}</h3><span className={styles.ticker}>${item.offspring.ticker}</span><p>{item.offspring.tagline}</p><span className={styles.lineage}>{item.parentA.ticker} <Plus size={11}/> {item.parentB.ticker}</span></div></article>
      </div>
      <div className={styles.footer}><div className={styles.controls}>
        <button type="button" className={styles.control} aria-label="Previous splice example" onClick={()=>rotation.step(-1)}><ChevronLeft size={17}/></button>
        <div className={styles.dots} aria-label="Choose a splice example">{showcaseItems.map((example,i)=><button type="button" key={example.id} className={styles.dot} aria-label={`Show ${example.parentA.ticker} × ${example.parentB.ticker}`} aria-current={i===rotation.index?'true':undefined} onClick={()=>rotation.select(i)}><span/></button>)}</div>
        <button type="button" className={styles.control} aria-label="Next splice example" onClick={()=>rotation.step(1)}><ChevronRight size={17}/></button>
        {!rotation.reduced&&<button type="button" className={styles.control} aria-label={rotation.paused?'Play showcase':'Pause showcase'} onClick={rotation.toggle}>{rotation.paused?<Play size={14}/>:<Pause size={14}/>}</button>}
        <span className={styles.counter}>{String(rotation.index+1).padStart(2,'0')} / {String(showcaseItems.length).padStart(2,'0')}</span>
      </div><div className={styles.actions}><button type="button" className={`btn btn-ghost ${styles.makeOwn}`} onClick={onMakeOwn}>Make your own <ArrowRight size={14}/></button><button type="button" className="btn btn-secondary" disabled={disabled} onClick={()=>onTry([item.parentA,item.parentB])}>Try this splice <Dna size={15}/></button></div></div>
      <div className={styles.progress} aria-hidden="true"><span key={`${item.id}-${rotation.running}`} className={rotation.running?styles.progressRunning:''}/></div>
    </div>
    <span className="sr-only" aria-live={rotation.running?'off':'polite'}>{item.parentA.ticker} plus {item.parentB.ticker}: {item.offspring.name}. Prepared example {rotation.index+1} of {showcaseItems.length}.</span>
  </section>;
}

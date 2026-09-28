import {Check,Dna,FlaskConical,Pencil,ArrowUpRight} from 'lucide-react';
import type {Offspring} from '@/lib/memesplice/types';
import {Artwork} from './artwork';
import styles from './offspring-card.module.css';
export function OffspringCard({offspring:o,selected,dimmed,onSelect}:{offspring:Offspring;selected:boolean;dimmed:boolean;onSelect:()=>void}){
 return <div className={`${styles.layout} ${dimmed?styles.dimmed:''}`}>
  <aside className={styles.parents} aria-label="Parent DNA and inherited traits">
   <div className={styles.label}><Dna size={15}/> PARENT DNA</div><p className={styles.caption}>A blend of two unique memecoins.</p>
   <div className={styles.pair}>{o.parents.map((parent,i)=><div key={`${parent.id}-${i}`}><Artwork image={parent.image} name={parent.name}/><b>{parent.name}</b><small>${parent.ticker}</small></div>)}<span>×</span></div>
   <div className={styles.status}><div className={styles.label}><FlaskConical size={12}/>{o.source==='instant'?'PREPARED SPLICE':'GENERATION COMPLETE'}</div>{['Parent traits combined','Offspring ready to explore'].map(text=><p key={text}><Check size={12}/>{text}<span>✓</span></p>)}</div>
   <div className={styles.label}>INHERITED HIGHLIGHTS</div>
   <div className={styles.inherited}>{o.parents.map((parent,i)=><div key={`${parent.id}-${i}`}><b>{parent.ticker}</b><p>{o.inheritedTraits[i]}</p></div>)}</div>
   <p className={styles.parentNote}>Two originals. A new identity.</p>
  </aside>
  <article className={`${styles.card} ${selected?styles.selected:''}`} aria-label={`${o.name} offspring`}>
   <header className={styles.header}><span>{o.status==='launched'?'LAUNCHED':'DRAFT'} · GEN {o.generation}</span><button onClick={onSelect} aria-label={o.status==='launched'?'View launch':'Edit offspring'}>${o.ticker}{o.status==='launched'?<ArrowUpRight size={12}/>:<Pencil size={12}/>}</button></header>
   <div className={styles.identity}>
    <div className={styles.portrait}><Artwork image={o.image} name={o.name}/></div>
    <div className={styles.copy}><h3>{o.name}</h3><p className={styles.tagline}>{o.tagline}</p><div className={styles.traits}>{o.personalityTraits.map(trait=><span key={trait}>{trait}</span>)}</div><p className={styles.lore}>{o.lore}</p></div>
   </div>
   <div className={styles.composition}><div className={styles.compositionHeading}><span>DNA COMPOSITION</span><span>{o.mutationInfluence}% mutation</span></div><div className={styles.bar} aria-label={`${o.parents[0].ticker} ${o.parentAInfluence}%, ${o.parents[1].ticker} ${o.parentBInfluence}%, mutation ${o.mutationInfluence}%`}><span style={{width:`${o.parentAInfluence}%`}}/><span style={{width:`${o.mutationInfluence}%`}}/><span style={{width:`${o.parentBInfluence}%`}}/></div><div className={styles.percentages}><span>{o.parents[0].ticker} <b>{o.parentAInfluence}%</b></span><span>{o.parents[1].ticker} <b>{o.parentBInfluence}%</b></span></div></div>
   {o.status==='launched'&&o.launch?.network==='mainnet-beta'&&<a className={styles.launch} href={`https://pump.fun/coin/${o.launch.mint}`} target="_blank" rel="noopener noreferrer">{o.launch.mint.slice(0,6)}…{o.launch.mint.slice(-6)} · View on Pump <ArrowUpRight size={12}/></a>}
  </article>
 </div>;
}

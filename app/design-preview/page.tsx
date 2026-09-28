"use client";
import Link from 'next/link';
import {useState} from 'react';
import {LabBackdrop,type BackgroundVariation} from '@/components/memesplice/lab-backdrop';
import {OffspringCard} from '@/components/memesplice/offspring-card';
import {DraftEditor} from '@/components/memesplice/draft-editor';
import {instantPairs} from '@/lib/generation/instant-splices';
const choices:[BackgroundVariation,string][]=[['minimal','01 · Minimal'],['balanced','02 · Balanced'],['rich','03 · Richer']];
export default function DesignPreview(){
 const [variant,setVariant]=useState<BackgroundVariation>('balanced'),[offspring,setOffspring]=useState(instantPairs[0].pool[0]),[editing,setEditing]=useState(false);
 return <main className="background-preview"><header className="background-preview-nav"><Link href="/#offspring">← Back to Splice</Link><div className="background-choices" aria-label="Background variations">{choices.map(([value,label])=><button key={value} aria-pressed={variant===value} onClick={()=>setVariant(value)}>{label}{value==='balanced'?' · Recommended':''}</button>)}</div></header><p className="background-preview-note">Background study · {variant==='minimal'?'Quiet light, barely visible texture.':variant==='balanced'?'Soft violet framing, faint DNA lines, subtle depth.':'Stronger DNA silhouettes, blooms and blueprint texture.'}</p>
 <section className="section offspring-section lab-scene"><LabBackdrop variant={variant} scene="result"/><div className="container"><div className="section-heading"><div className="eyebrow">MEET YOUR OFFSPRING</div><h2>One offspring. <span>A new identity.</span></h2><p>Your offspring is ready. Explore its identity and inherited traits.</p><span className="draft-state">Prepared example · Draft offspring</span></div><div className="draft-boundary">Only a launched, verified child joins the public Family Tree and Explore.</div><OffspringCard offspring={offspring} selected dimmed={false} onSelect={()=>setEditing(true)}/><p className="offspring-lifecycle">Create → edit your draft → launch → become an official child.</p></div></section>
 <DraftEditor open={editing} offspring={offspring} onClose={()=>setEditing(false)} onSave={updated=>{setOffspring(updated);setEditing(false);}}/>
 </main>;
}

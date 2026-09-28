"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Artwork } from "./artwork";
import type { Offspring } from "@/lib/memesplice/types";

import {IDENTITY_LIMITS,nameBytes,offspringName,offspringTicker,offspringLore} from '@/lib/memesplice/identity';

type DraftEditorProps={open:boolean;offspring:Offspring;onClose:()=>void;onSave:(updated:Offspring)=>void};
export function DraftEditor({open,...props}:DraftEditorProps){
  // Keep Radix mounted through the closed state; the form resets when its portal reopens.
  return <Dialog open={open} onOpenChange={value=>{if(!value)props.onClose();}}><DialogContent className="lab-dialog draft-dialog"><DraftFields {...props}/></DialogContent></Dialog>;
}
function DraftFields({offspring,onClose,onSave}:Omit<DraftEditorProps,"open">){
  const [name, setName] = useState(offspring.name);
  const [ticker, setTicker] = useState(offspring.ticker);
  const [lore, setLore] = useState(offspring.lore);
  const [attempted, setAttempted] = useState(false);

  const errors = { name: !offspringName.safeParse(name).success, ticker: !offspringTicker.safeParse(ticker).success, lore: !offspringLore.safeParse(lore).success };
  function save(e: React.FormEvent) {
    e.preventDefault(); setAttempted(true);
    if (Object.values(errors).some(Boolean)) return;
    onSave({ ...offspring, name: name.trim(), ticker, lore: lore.trim(), status: "draft", launchedAt: null, descendants: 0 });
  }
  return <>
      <div className="draft-editor-heading"><Artwork image={offspring.image} name={offspring.name}/><span className="eyebrow">DRAFT OFFSPRING · GEN {offspring.generation}</span></div>
      <DialogTitle>Make it your own.</DialogTitle>
      <DialogDescription>Edit your selected draft before launch. Changes stay in this page session.</DialogDescription>
      <form className="draft-form" onSubmit={save} noValidate>
        <div className="draft-field-row"><div><label htmlFor="draft-name">Name</label><Input id="draft-name" value={name} maxLength={IDENTITY_LIMITS.nameBytes} onChange={e=>setName(e.target.value)} aria-invalid={attempted&&errors.name} aria-describedby={attempted&&errors.name?"name-error":undefined}/>{attempted&&errors.name&&<small id="name-error" className="field-error">Enter a name using at most 32 bytes ({nameBytes(name)} used).</small>}</div>
        <div><label htmlFor="draft-ticker">Ticker</label><Input id="draft-ticker" value={ticker} maxLength={IDENTITY_LIMITS.ticker} onChange={e=>setTicker(e.target.value.toUpperCase())} aria-invalid={attempted&&errors.ticker} aria-describedby="ticker-help"/><small id="ticker-help" className={attempted&&errors.ticker?"field-error":"field-hint"}>1–13 letters or numbers, without $.</small></div></div>
        <div><label htmlFor="draft-lore">Lore <span>{lore.length}/{IDENTITY_LIMITS.lore}</span></label><Textarea id="draft-lore" value={lore} maxLength={IDENTITY_LIMITS.lore} rows={4} onChange={e=>setLore(e.target.value)} aria-invalid={attempted&&errors.lore} aria-describedby={attempted&&errors.lore?"lore-error":undefined}/>{attempted&&errors.lore&&<small id="lore-error" className="field-error">Add an origin story of 1-600 characters.</small>}</div>
        <p className="field-hint">Want a new image and identity? Save or close this draft, then choose Mutate Again. It uses a new custom generation.</p>
        <div className="draft-editor-actions"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" type="submit"><Check size={16}/> Save Draft</button></div>
      </form>
  </>;
}

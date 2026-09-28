"use client";
import { useState, useEffect, useRef } from "react";
import { ArrowRight, ArrowUpRight, FlaskConical, Dna, Sparkles, Shuffle, Search, Menu, X, Wallet, GitBranch, Layers3, Check, Link2, Compass, Rocket, Flame, Plus, Clock3, ChevronRight, CircleHelp, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LabBackdrop } from "@/components/memesplice/lab-backdrop";
import { Artwork } from "@/components/memesplice/artwork";
import { Chamber } from "@/components/memesplice/chamber";
import { CoinPicker } from "@/components/memesplice/coin-picker";
import { HeaderCoinSearch } from "@/components/memesplice/header-coin-search";
import { OffspringCard } from "@/components/memesplice/offspring-card";
import { DraftEditor } from "@/components/memesplice/draft-editor";
import { FamilyTree } from "@/components/memesplice/family-tree";
import { SpliceShowcase } from "@/components/memesplice/splice-showcase";
import {instantPairs,chooseInstant,findInstantPair,type InstantPair} from "@/lib/generation/instant-splices";
import {useGenerationJob} from "@/hooks/use-generation-job";
import {useLiveLineage} from "@/hooks/use-live-lineage";
import {useWallet} from '@solana/wallet-adapter-react';
import {WalletDialog} from '@/components/memesplice/wallet-dialog';
import {LaunchDialog} from '@/components/memesplice/launch-dialog';
import { popularCoins } from "@/lib/tokens/catalog";
import { sameParent } from "@/lib/tokens/client";
import type { Coin, Offspring } from "@/lib/memesplice/types";

import { resourceContent } from "@/lib/resource-content";

const navigation = [["home","Home"],["how-it-works","How It Works"],["create","Create"],["family-tree","Family Tree"],["explore","Explore"]];
const filters = ["Newest","Most Remixed","Gen 2+"];
const loadingMessages = ["Analyzing traits…","Splicing DNA…","Creating offspring…","Finalizing offspring…"];
const features = [
  [FlaskConical,"AI-Powered Splicing","Combine visual and cultural traits from both parent memes."],
  [Layers3,"One Unique Offspring","Two parents become one new identity."],
  [Rocket,"Create & Launch","Refine your offspring and take it onchain."],
  [Link2,"Permanent Lineage","Every official offspring remembers its parents."],
  [Compass,"Explore Generations","Discover new offspring and evolving bloodlines."],
] as const;
const steps = [
  [Search,"Choose two memecoins","Search by name, ticker, CA, suggested pair, or Surprise Me."],
  [Dna,"Create their offspring","Load a prepared Instant Splice or queue one custom offspring."],
  [Sparkles,"Make it yours","Explore the offspring’s traits, edit its draft, or Mutate Again."],
  [Rocket,"Launch it","Launch the selected child on Solana and register its lineage."],
] as const;
export default function Home() {
  const wallet=useWallet();
  const [launchAfterWallet,setLaunchAfterWallet]=useState(false);
  const [parents,setParents] = useState<[Coin|null,Coin|null]>(instantPairs[0].parents);
  const [offspring,setOffspring] = useState<Offspring|null>(instantPairs[0].pool[0]);
  const [hasGenerated,setHasGenerated] = useState(false);
  
  const [error,setError] = useState("");
  const [picker,setPicker] = useState(false);
  const [initialQuery,setInitialQuery] = useState("");
  const [editing,setEditing] = useState(false);
  const [pendingParent,setPendingParent]=useState<Coin|null>(null);
  const [instantStep,setInstantStep]=useState<number|null>(null);
  const instantTimer=useRef<ReturnType<typeof setInterval>|null>(null);
  useEffect(()=>()=>{if(instantTimer.current)clearInterval(instantTimer.current);},[]);
  const [target,setTarget] = useState<0|1>(0);
  const [active,setActive] = useState("home");
  const [mobileMenu,setMobileMenu] = useState(false);
  const [modal,setModal] = useState<string|null>(null);
  const [detail,setDetail] = useState<Offspring|null>(null);
  const [exploreFilter,setExploreFilter] = useState("Newest");
  const [notice,setNotice] = useState("");
  const chosen = offspring;
  const queue=useGenerationJob(child=>{setOffspring(child);setParents(child.parents);setHasGenerated(true);scrollTo("offspring");});
  const loading=queue.active||instantStep!==null;
  const loadingStep=instantStep??Math.max(0,["ANALYZING","SPLICING","GENERATING","FINALIZING"].indexOf(queue.job?.status??""));
  const loadingLabel=instantStep!==null?["Loading parent traits…","Splicing the preview…","Revealing your offspring…","Prepared splice ready…"][instantStep]:queue.submitting?"Joining queue…":queue.job?.status==="QUEUED"?"Mutation queued":loadingMessages[loadingStep];
  const ready = parents[0] && parents[1] && !sameParent(parents[0],parents[1]);

  useEffect(()=>{
    // Use the section at the reading line so tall sections remain active while scrolling.
    const sections=["home","how-it-works","create","offspring","family-tree","explore"];
    let scheduled=false;
    function update(){scheduled=false;let current="home";for(const id of sections){const el=document.getElementById(id);if(el&&el.getBoundingClientRect().top<=160)current=id;}setActive(current==="offspring"?"create":current);}
    function onScroll(){if(!scheduled){scheduled=true;requestAnimationFrame(update);}}
    window.addEventListener("scroll",onScroll,{passive:true});update();
    return ()=>window.removeEventListener("scroll",onScroll);
  },[]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(""),3600);return ()=>clearTimeout(t);},[notice]);
  function scrollTo(id:string){setMobileMenu(false);setActive(id==="offspring"?"create":id);document.getElementById(id)?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});}
  function changeParents(next:[Coin|null,Coin|null]){if(loading)return;if(sameParent(next[0],next[1])){setNotice("Choose two different memecoins to splice.");return;}queue.clearError();setParents(next);setOffspring(null);setHasGenerated(false);setEditing(false);setError("");}
  function focusCreation(){scrollTo("create");document.getElementById("create")?.focus({preventScroll:true});}
  function instant(pair:InstantPair){
    if(loading||instantTimer.current)return;
    queue.clearError();const child=chooseInstant(pair,offspring?.id);
    setParents(pair.parents);setOffspring(null);setEditing(false);setHasGenerated(false);setError("");
    setInstantStep(0);scrollTo("create");let step=0;
    instantTimer.current=setInterval(()=>{
      step++;
      if(step<4){setInstantStep(step);return;}
      clearInterval(instantTimer.current!);instantTimer.current=null;setInstantStep(null);
      setOffspring(child);setHasGenerated(true);setNotice("Prepared Instant Splice revealed. No new AI request.");scrollTo("offspring");
    },650);
  }
  function surprise(){
    if(loading)return;
    const a=popularCoins[Math.floor(Math.random()*popularCoins.length)];
    const options=popularCoins.filter(coin=>coin.id!==a.id);
    const b=options[Math.floor(Math.random()*options.length)];
    changeParents([a,b]);setNotice(`${a.ticker} × ${b.ticker} selected. Generate when you’re ready.`);
  }
  function openPicker(slot:0|1,query=""){setTarget(slot);setInitialQuery(query);setPicker(true);}
  function removeParent(slot:0|1){changeParents(slot===0?[null,parents[1]]:[parents[0],null]);}
  const preparedPair=findInstantPair(parents);
  function beginGeneration(){if(!ready){scrollTo("create");openPicker(parents[0]?1:0);return;}scrollTo("create");void generate();}
  async function generate(){if(!parents[0]||!parents[1]||loading||instantTimer.current)return;setError("");if(preparedPair){instant(preparedPair);return;}await queue.generate([parents[0],parents[1]]);}
  const lineage=useLiveLineage();
  const exploreData=lineage.offspring;
  const recentBirth=exploreData[0];
  function filtered(tab:string){const list=[...exploreData];if(tab==="Gen 2+")return list.filter(o=>o.generation>=2);if(tab==="Most Remixed")return list.sort((a,b)=>b.descendants-a.descendants);return list.sort((a,b)=>(b.launchedAt??"").localeCompare(a.launchedAt??""));}
  function parentCard(slot:0|1){const p=parents[slot];return <div className={`parent-card parent-${slot} ${p?"filled":"empty"}`}><div className="parent-card-label"><span>PARENT {slot===0?"A":"B"}</span>{p&&<button className="icon-btn" disabled={loading} onClick={()=>changeParents(slot===0?[null,parents[1]]:[parents[0],null])} aria-label={`Remove parent ${slot===0?"A":"B"}`}><X size={14}/></button>}</div><button className="parent-image-btn" disabled={loading} onClick={()=>openPicker(slot)} aria-label={`Change parent ${slot===0?"A":"B"}`}>{p?<Artwork image={p.image} name={p.name}/>:<span className="empty-parent"><Plus size={32}/><span>Choose parent</span></span>}</button><div className="parent-info"><div><b>{p?.name??"Your next meme"}</b><small>{p?`$${p.ticker}`:"Not selected"}</small></div><button disabled={loading} onClick={()=>openPicker(slot)} aria-label={`Search parent ${slot===0?"A":"B"}`}><Shuffle size={14}/></button></div></div>;}
  function workspaceParent(slot:0|1){const p=parents[slot];return <div className={`workspace-parent workspace-parent-${slot}`}>
    <div className="workspace-parent-label"><span>PARENT {slot===0?"A":"B"}</span>{p&&<button className="icon-btn" disabled={loading} onClick={()=>removeParent(slot)} aria-label={`Remove Parent ${slot===0?"A":"B"} in workspace`}><X size={16}/></button>}</div>
    <button className="workspace-parent-main" disabled={loading} onClick={()=>openPicker(slot)} aria-label={`Choose or change Parent ${slot===0?"A":"B"}`}>
      {p?<Artwork image={p.image} name={p.name}/>:<span className="workspace-empty-icon"><Plus size={24}/></span>}
      <span><b>{p?.name??"Choose a memecoin"}</b><small>{p?`${p.ticker}`:"Name, ticker, or contract address"}</small></span><span className="change-label">{p?"Change":"Search"}<Search size={14}/></span>
    </button></div>;}
  return <>
    <a href="#create" className="skip-link">Skip to creation lab</a>
    <header className="site-header"><div className="header-inner"><a href="#home" className="brand header-wordmark" onClick={e=>{e.preventDefault();scrollTo("home");}}><img src="/images/brand/splice-wordmark.png" alt="Splice" width={132} height={48}/></a><nav className="desktop-nav" aria-label="Main navigation">{navigation.map(([id,label])=><a key={id} href={`#${id}`} className={active===id?"active":""} aria-current={active===id?"location":undefined} onClick={e=>{e.preventDefault();scrollTo(id);}}>{label}</a>)}</nav><div className="header-actions"><HeaderCoinSearch onOpenPicker={query=>openPicker(0,query)} onChoose={coin=>setPendingParent(coin)}/><button className="btn btn-wallet" onClick={()=>{setLaunchAfterWallet(false);setModal("wallet");}}><Wallet size={15}/><span>{wallet.publicKey?`${wallet.publicKey.toBase58().slice(0,4)}…${wallet.publicKey.toBase58().slice(-4)}`:"Connect Wallet"}</span></button><button className="icon-btn mobile-menu-toggle" aria-label={mobileMenu?"Close menu":"Open menu"} aria-expanded={mobileMenu} onClick={()=>setMobileMenu(!mobileMenu)}>{mobileMenu?<X/>:<Menu/>}</button></div></div>{mobileMenu&&<nav className="mobile-nav" aria-label="Mobile navigation">{navigation.map(([id,label])=><a key={id} href={`#${id}`} onClick={e=>{e.preventDefault();scrollTo(id);}}>{label}<ChevronRight size={16}/></a>)}</nav>}</header>
    <main>
      <section id="home" className="hero lab-scene"><LabBackdrop scene="hero"/><div className="container hero-content">
        <div className="hero-copy"><div className="eyebrow"><Dna size={16}/> AI MEMECOIN GENETICS LAB</div>
          <h1>Splice any two<br/>memecoins.<span>Create new offspring.</span></h1>
          <p className="hero-description">Splice combines two existing memecoins into one unique offspring with artwork, a name, lore, and traits. Make it yours, launch it, and start a new lineage.</p>
          <div className="hero-cta"><button className="btn btn-secondary" disabled={loading} onClick={surprise}><Shuffle size={16}/> Surprise Me</button></div>
          <p className="hero-points">One unique offspring <span>•</span> Inherited traits <span>•</span> A new lineage</p>
          <p className="hero-demo-note">Custom AI generations create saved drafts. Connect your wallet to review a Pump launch.</p>
        </div>
        <div className={`hero-lab ${loading?"lab-active":""}`}>
          <div className="lab-coordinate">TWO PARENTS <span>ONE NEW MEME BLOODLINE</span></div>
          <div className="lab-assembly">{parentCard(0)}<span className="lab-connector connector-a"><Plus size={15}/></span><Chamber active={loading} status={loading?loadingLabel.toUpperCase():"READY TO SPLICE"}/><span className="lab-connector connector-b"><Plus size={15}/></span>{parentCard(1)}</div>

          <div className="lab-action"><button className="btn btn-primary generate-btn" disabled={!ready||loading} onClick={beginGeneration}><Dna size={18}/>{loading?loadingLabel:"Generate Offspring"}{!loading&&<ArrowRight size={17}/>}</button><button className="btn btn-secondary hero-lab-surprise" disabled={loading} onClick={surprise}><Shuffle size={16}/> Surprise Me</button></div>
        </div>
      </div></section>
      <SpliceShowcase disabled={loading} onTry={next=>{changeParents(next);focusCreation();}} onMakeOwn={focusCreation}/>
      <section className="pairings-section"><div className="container"><div className="section-heading compact"><div><h2><Flame size={21}/> Try a popular splice</h2><p>Prepared offspring. Instant discovery. No new AI request.</p></div><button className="btn btn-ghost" disabled={loading} onClick={()=>{surprise();focusCreation();}}><Shuffle size={16}/> Surprise Me</button></div><div className="pairings">{instantPairs.map(p=>{const [a,b]=p.parents;const picked=parents[0]?.id===a.id&&parents[1]?.id===b.id;return <button key={p.id} className={`pair-card ${picked?"active":""}`} aria-label={`Select ${a.ticker} and ${b.ticker}`} aria-pressed={picked} disabled={loading} onClick={()=>instant(p)}><div className="pair-portraits"><Artwork image={a.image} name={a.name}/><span>×</span><Artwork image={b.image} name={b.name}/></div><b>{a.ticker} <span>×</span> {b.ticker}</b><small>Instant · {p.category}</small></button>})}</div></div></section>
      <section className="feature-strip"><div className="container features">{features.map(([Icon,title,copy])=><div className="feature" key={title}><Icon/><h3>{title}</h3><p>{copy}</p></div>)}</div></section>
      <section id="how-it-works" className="section container"><div className="section-heading"><div><div className="eyebrow">THE PROCESS</div><h2>A new species of meme.<br className="mobile-break"/> In four simple steps.</h2><p>Two parents. One offspring. A new meme.</p></div><span className="section-number">01 / THE METHOD</span></div><p className="phase-note">Try an Instant Splice or generate a custom offspring. Verified mainnet launches establish official lineage.</p><div className="steps">{steps.map(([Icon,title,copy],i)=><article key={title} className="step"><div className="step-top"><span>0{i+1}</span><Icon size={24}/></div><h3>{title}</h3><p>{copy}</p>{i<3&&<ArrowRight className="step-arrow" size={16}/>}</article>)}</div></section>
      <section id="create" tabIndex={-1} className="create-section section"><div className="container">
        <div className="section-heading"><div><div className="eyebrow"><FlaskConical size={14}/> THE CREATION LAB</div><h2>Create Your Offspring</h2><p>Choose two parents and let the mutation begin.</p></div><button className="btn btn-ghost" disabled={loading} onClick={surprise}><Shuffle size={16}/> Surprise Me</button></div>
        <div className={`workspace ${loading?"workspace-splicing":""}`}><div className="workspace-top">{workspaceParent(0)}<Plus className="workspace-plus" size={20}/>{workspaceParent(1)}<button className="btn btn-primary workspace-generate" disabled={!ready||loading} onClick={generate}><Dna size={18}/>{loading?loadingLabel:"Generate Offspring"}</button></div>
          {loading?<div className="generation-loading"><Chamber active={instantStep!==null||!!queue.job&&queue.job.status!=="QUEUED"} status={instantStep!==null?loadingLabel.toUpperCase():queue.job?.status==="QUEUED"?"IN QUEUE":loadingMessages[loadingStep].toUpperCase()}/><div><h3>{loadingLabel}</h3><p>{instantStep!==null?"Revealing a prepared pairing. No new AI generation or custom quota used.":queue.job?.status==="QUEUED"?queue.job.paused?"The lab is at capacity. Your place is saved.":`You are ${queue.job.position?`#${queue.job.position} in line`:"joining the queue"}. Estimated wait: ${queue.job.estimatedWaitSeconds?queue.job.estimatedWaitSeconds<60?"less than a minute":`about ${Math.ceil(queue.job.estimatedWaitSeconds/60)} minutes`:"a few minutes"}. Timing may vary.`:"Combining two identities into one new offspring."}</p>{queue.connection&&<p role="status">{queue.connection}</p>}<div className="generation-progress" role="progressbar" aria-label="Offspring generation" aria-valuemin={0} aria-valuemax={100} aria-valuenow={instantStep===null&&(queue.submitting||queue.job?.status==="QUEUED")?undefined:(loadingStep+1)*25}><span style={{width:`${instantStep===null&&(queue.submitting||queue.job?.status==="QUEUED")?0:(loadingStep+1)*25}%`}}/></div></div></div>:<div className="workspace-guidance"><Dna size={18}/><p>{ready?<><b>{parents[0]?.ticker} × {parents[1]?.ticker}</b>{preparedPair?" has a prepared Instant Splice. Generate reveals it without a new AI request; Mutate Again creates a fresh version.":" is ready for a custom mutation."}</>:"Choose two different memecoins. Search by name or ticker, or paste a contract address."}</p></div>}
          <div className="workspace-footer"><span>2 parents → 1 offspring → make it yours</span><span>Instant or custom · No transaction required</span></div>
        </div>
        <div aria-live="polite" className="sr-only">{loading?loadingLabel:hasGenerated?"Generation complete. Your draft offspring is ready.":notice}</div>
        {(error||queue.error)&&<p role="alert" className="error-message">{error||queue.error}</p>}
      </div></section>
      <section id="offspring" className="section offspring-section lab-scene"><LabBackdrop scene="result"/><div className="container">
        <div className="section-heading"><div><div className="eyebrow">MEET YOUR OFFSPRING</div><h2>One offspring. <span>A new identity.</span></h2><p>{offspring?.source==="instant"?"Prepared in advance. An Instant Splice, with no new AI request.":hasGenerated?"Your offspring is ready. Explore its identity and inherited traits.":"Choose an Instant Splice or request a custom mutation."}</p></div><span className="draft-state">{offspring?.source==="instant"?"Instant Splice · Prepared":offspring?.status==="launched"?"Launched":"Draft Offspring"}</span></div>
        <div className="draft-boundary"><FlaskConical size={17}/><p>Generated offspring are drafts. Only a launched, verified child joins the public Family Tree and Explore.</p></div>
        {offspring?<div className="offspring-grid single-offspring" key={offspring.id}><OffspringCard offspring={offspring} selected={true} dimmed={false} onSelect={()=>offspring.status==="launched"?setModal("launch"):setEditing(true)}/></div>:<div className="empty-results"><Dna size={38}/><h3>{loading?"Your offspring is taking shape.":"Your next splice starts above."}</h3><p>{loading?"One new identity will appear when the mutation is complete.":"Choose an Instant Splice or request a custom mutation."}</p></div>}

        {chosen&&<div className="selection-bar"><div><Artwork image={chosen.image} name={chosen.name}/><span><small>{chosen.status==="launched"?"LAUNCHED":"SELECTED DRAFT"} · GEN {chosen.generation}</small><b>{chosen.name} <em>${chosen.ticker}</em></b></span></div><div className="selection-actions"><button className="btn btn-secondary" disabled={loading} onClick={()=>{if(chosen){setParents(chosen.parents);scrollTo("create");void queue.generate(chosen.parents,chosen.source==="custom"?chosen.id:null,chosen.source==="instant"?chosen.id:null);}}}><Dna size={16}/> Mutate Again</button><button className="btn btn-secondary" disabled={chosen.status==="launched"} onClick={()=>setEditing(true)}><Pencil size={16}/> Edit Draft</button><button className="btn btn-primary" onClick={()=>{if(!wallet.publicKey&&chosen.generationJobId){setLaunchAfterWallet(true);setModal("wallet");}else setModal("launch");}}>{chosen.status==="launched"?"View Launch":"Launch on Pump"} <Rocket size={17}/></button></div></div>}
        <p className="offspring-lifecycle">Create → edit your draft → launch → become an official child.</p>
      </div></section>
      <section id="family-tree" className="section container lab-scene"><LabBackdrop scene="lineage"/>
        <div className="section-heading"><div><div className="eyebrow"><GitBranch size={14}/> MORE THAN A MEME GENERATOR</div><h2>Every launched offspring<br/>keeps its lineage.</h2><p>Children can become parents, creating new generations and entire meme bloodlines.</p></div><span className="section-number">THE FAMILY TREE</span></div>
        <FamilyTree offspring={exploreData} nodes={lineage.nodes} loading={lineage.loading} error={lineage.error}/>
        {recentBirth&&<div className="birth-activity"><span className="activity-label"><Clock3 size={15}/> RECENT BIRTH</span><div><span>New birth · {recentBirth.launchedAt?new Date(recentBirth.launchedAt).toLocaleString():"Verified"}</span><p><b>{recentBirth.name}</b> was born from <b>{recentBirth.parents.map(p=>p.name).join(" × ")}</b></p></div><span className="subtle-badge">Verified launch</span></div>}
      </section>
      <section id="explore" className="section explore-section lab-scene"><LabBackdrop scene="lineage"/><div className="container"><div className="section-heading"><div><div className="eyebrow">FRESH FROM THE LAB</div><h2>Meet the Next Generation</h2><p>Discover new births, trending lineages, and the most remixed parents.</p></div><span className="subtle-badge"><Compass size={13}/> Verified mainnet offspring</span></div>{lineage.loading&&<p className="phase-note">Loading verified offspring…</p>}{lineage.error&&<p role="alert" className="error-message">{lineage.error}</p>}<Tabs value={exploreFilter} onValueChange={setExploreFilter}><div className="tabs-scroll"><TabsList className="explore-tabs">{filters.map(f=><TabsTrigger key={f} value={f}>{f}</TabsTrigger>)}</TabsList></div>{filters.map(tab=><TabsContent value={tab} key={tab}>{!lineage.loading&&!lineage.error&&filtered(tab).length===0&&<p className="phase-note">No verified offspring in this view yet.</p>}<div className="explore-grid">{filtered(tab).map(o=><button className="explore-card" key={o.id} onClick={()=>setDetail(o)}><div className="explore-portrait"><Artwork image={o.image} name={o.name}/><span>GEN {o.generation}</span><ArrowUpRight size={17}/></div><div className="explore-info"><h3>{o.name}</h3><span>${o.ticker}</span><p className="explore-parents">{o.parents[0].name} <span>×</span> {o.parents[1].name}</p><small><GitBranch size={13}/>{o.descendants} descendants</small><span className="official-status">Verified offspring</span></div></button>)}</div></TabsContent>)}</Tabs></div></section>
      <section className="container final-cta"><div className="cta-dna"><Dna/></div><div><div className="eyebrow">START A NEW LINEAGE</div><h2>Create the Next<br/><span>Generation of Memes</span></h2><p>Pick two parents. See what they become.</p></div><div className="final-actions"><button className="btn btn-primary" disabled={loading} onClick={beginGeneration}>Generate Offspring <Dna size={17}/></button><button className="btn btn-secondary" disabled={loading} onClick={()=>{surprise();focusCreation();}}><Shuffle size={16}/> Surprise Me</button></div></section>
    </main>
    <footer className="container footer"><div className="footer-brand"><a className="brand footer-wordmark" href="#home"><img src="/images/brand/splice-wordmark.png" alt="Splice" width={132} height={48}/></a><p>The internet&apos;s next generation<br/>starts with a little chemistry.</p><span className="demo-label">INSTANT SPLICES · CUSTOM AI GENERATION</span></div><div><h3>Product</h3>{navigation.map(([id,label])=><a key={id} href={`#${id}`} onClick={e=>{e.preventDefault();scrollTo(id);}}>{label}</a>)}</div><div><h3>Resources</h3>{["Docs","FAQ","Terms","Privacy"].map(r=><button key={r} onClick={()=>setModal(r)}>{r}</button>)}</div><div><h3>Community</h3><a href="https://x.com/SpliceMemes" target="_blank" rel="noopener noreferrer">X<ArrowUpRight size={12}/></a></div><div className="footer-bottom"><span>© 2026 Splice. Made for the next generation.</span><span>Powered by imagination. Built for Solana.</span></div></footer>
    <CoinPicker initialQuery={initialQuery} open={picker} onClose={()=>setPicker(false)} target={target} onTarget={setTarget} parents={parents} onChoose={coin=>{changeParents(target===0?[coin,parents[1]]:[parents[0],coin]);setPicker(false);setNotice(`${coin.name} selected as Parent ${target===0?"A":"B"}.`);}}/>
    {chosen&&<DraftEditor key={chosen.id} open={editing} offspring={chosen} onClose={()=>setEditing(false)} onSave={updated=>{setOffspring(updated);setEditing(false);setNotice("Draft saved. Your changes are ready to preview.");}}/>}
    <Dialog open={!!pendingParent} onOpenChange={open=>{if(!open)setPendingParent(null);}}><DialogContent className="lab-dialog"><DialogTitle>Choose a parent slot</DialogTitle><DialogDescription>Where should {pendingParent?.name} go? Your other parent stays in place.</DialogDescription>{pendingParent&&<><Artwork image={pendingParent.image} name={pendingParent.name} className="detail-artwork"/><div className="parent-target">{([0,1] as const).map(slot=><button key={slot} disabled={loading||sameParent(pendingParent,parents[slot===0?1:0])} onClick={()=>{changeParents(slot===0?[pendingParent,parents[1]]:[parents[0],pendingParent]);setPendingParent(null);}}>Parent {slot===0?"A":"B"}<span>{sameParent(pendingParent,parents[slot===0?1:0])?"Already in the other slot":`Replace ${parents[slot]?.ticker??"empty slot"}`}</span></button>)}</div></>}</DialogContent></Dialog>
    <WalletDialog open={modal==="wallet"} onClose={()=>setModal(null)} onConnected={()=>setModal(launchAfterWallet?"launch":null)}/>
    {chosen&&<LaunchDialog key={chosen.id} offspring={chosen} open={modal==="launch"} onClose={()=>setModal(null)} onConnect={()=>{setLaunchAfterWallet(true);setModal("wallet");}} onVerified={setOffspring}/>}
    <Dialog open={!!modal&&modal!=="wallet"&&modal!=="launch"} onOpenChange={v=>{if(!v)setModal(null);}}><DialogContent className="lab-dialog resource-dialog"><div className="modal-symbol"><CircleHelp/></div><DialogTitle>{modal}</DialogTitle><DialogDescription>{resourceContent[modal??""]?.intro}</DialogDescription><div className="resource-sections">{resourceContent[modal??""]?.sections.map(section=><section key={section.title}><h3>{section.title}</h3><p>{section.text}</p></section>)}<section><h3>Useful links & contact</h3><div className="resource-links"><a href="https://x.com/SpliceMemes" target="_blank" rel="noopener noreferrer">Contact Splice ↗</a><a href="https://pump.fun/docs/fees" target="_blank" rel="noopener noreferrer">Pump fees ↗</a><a href="https://pump.fun/docs/mayhem-mode-disclaimer" target="_blank" rel="noopener noreferrer">Pump Mayhem disclosure ↗</a></div></section></div><button className="btn btn-primary full-width" onClick={()=>setModal(null)}>Back to the lab <ArrowRight size={16}/></button></DialogContent></Dialog>
    <Dialog open={!!detail} onOpenChange={v=>{if(!v)setDetail(null);}}><DialogContent className="lab-dialog">{detail&&<><Artwork image={detail.image} name={detail.name} className="detail-artwork"/><div className="eyebrow">VERIFIED OFFSPRING · GEN {detail.generation}</div><DialogTitle>{detail.name} <span className="muted">${detail.ticker}</span></DialogTitle><DialogDescription>{detail.lore}</DialogDescription><div className="trait-tags">{detail.personalityTraits.map(t=><span key={t}>{t}</span>)}</div><div className="detail-parents"><span>Parents</span><b>{detail.parents.map(p=>p.name).join(" × ")}</b></div><div className="detail-parents"><span>Descendants</span><b>{detail.descendants}</b></div><div className="detail-parents"><span>Verified launch</span><b>{detail.launchedAt?new Date(detail.launchedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}):"Not launched"}</b></div>{detail.launch&&<a className="btn btn-secondary" href={`https://pump.fun/coin/${detail.launch.mint}`} target="_blank" rel="noopener noreferrer">View on Pump.fun <ArrowUpRight size={16}/></a>}<button className="btn btn-primary" onClick={()=>{changeParents(detail.parents);setDetail(null);scrollTo("create");}}>Try these parents <Dna size={17}/></button></>}</DialogContent></Dialog>
    {notice&&<div className="toast" role="status"><Check size={16}/>{notice}</div>}
  </>;
}






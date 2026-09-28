"use client";
import { useState } from "react";
import { GitBranch, ArrowUpRight, X } from "lucide-react";
import {layoutFamily,FAMILY_NODE_WIDTH,FAMILY_NODE_HEIGHT} from "@/lib/memesplice/family-layout";
import type { LineageNode, Offspring } from "@/lib/memesplice/types";
import { Artwork } from "./artwork";

const generations = [
  ["Gen 0", "External parents", "Existing tokens outside Splice."],
  ["Gen 1", "First offspring", "Children of two original parents."],
  ["Gen 2", "A new generation", "At least one parent is a Splice child."],
  ["Gen 3+", "Future descendants", "Children become parents. The family grows."],
];
export function FamilyTree({offspring,nodes:graph,loading,error}:{offspring:Offspring[];nodes:LineageNode[];loading:boolean;error:string}) {
  const [selected, setSelected] = useState<LineageNode | null>(null);
  const layout=layoutFamily(graph,offspring);
  const family=offspring.length>0;
  return <>
    <div className="generation-guide">{generations.map(([gen,title,copy])=><div key={gen}><span>{gen}</span><h3>{title}</h3><p>{copy}</p></div>)}</div>
    <div className="family-panel">
      <div className="family-toolbar"><span><GitBranch size={15}/> The shared family tree</span><span className="subtle-badge">{graph.length} tokens · Verified mainnet</span></div>
      {loading&&<p className="phase-note">Loading verified lineages…</p>}{error&&<p role="alert" className="error-message">{error}</p>}
      {!loading&&!error&&!family&&<p className="phase-note">No verified launches yet. Completed drafts appear here only after a verified mainnet launch.</p>}
      {family&&<><p className="family-navigation-note">All parents and offspring, together. Scroll in any direction to explore. Select a token for its lineage.</p>
        <div className="family-graph-scroll" tabIndex={0} role="region" aria-label="All token families, scroll horizontally and vertically">
          <div className="family-graph-canvas" style={{width:layout.width,height:layout.height}}>
            {layout.columns.map((column,i)=><span className="family-generation-label" key={column.generation} style={{left:24+i*340}}>GEN {column.generation}<small>{column.nodes.length} tokens</small></span>)}
            <svg width={layout.width} height={layout.height} className="family-graph-lines" aria-hidden="true">{layout.edges.map(edge=>{
              const a=layout.byId.get(edge.from)!,b=layout.byId.get(edge.to)!;
              const x1=a.x+FAMILY_NODE_WIDTH,y1=a.y+FAMILY_NODE_HEIGHT/2,x2=b.x,y2=b.y+FAMILY_NODE_HEIGHT/2;
              return <path key={`${edge.from}:${edge.to}`} className={selected&&(selected.id===edge.from||selected.id===edge.to)?"highlighted":""} d={`M${x1} ${y1} C${x1+56} ${y1},${x2-56} ${y2},${x2} ${y2}`}/>;
            })}</svg>
            {layout.positions.map(({node:n,x,y})=><button key={n.id} className={`family-graph-node ${selected?.id===n.id?"active":""}`} style={{left:x,top:y,width:FAMILY_NODE_WIDTH,height:FAMILY_NODE_HEIGHT}} aria-label={`View ${n.name} lineage`} aria-pressed={selected?.id===n.id} onClick={()=>setSelected(n)}>
              <Artwork image={n.image} name={n.name}/><span><small>{n.status==="external"?"EXTERNAL PARENT":"VERIFIED OFFSPRING"}</small><b>{n.name}</b><em>${n.ticker}</em></span><ArrowUpRight size={14}/>
            </button>)}
          </div>
        </div></>}
      <div className="future-lineage"><GitBranch size={16}/><span><b>Every verified launch preserves its parents.</b> Future descendants appear here once verified.</span></div>
      {selected ? <section className="lineage-detail-panel" aria-label={`${selected.name} lineage details`}>
        <div className="lineage-detail-heading"><Artwork image={selected.image} name={selected.name}/><div><h3>{selected.name} <span>${selected.ticker}</span></h3><p>Gen {selected.generation} · {selected.status === "official" ? "Verified offspring" : "External parent"}</p></div><button className="icon-btn" onClick={()=>setSelected(null)} aria-label="Close lineage detail"><X size={17}/></button></div>
        <p className="lineage-description">{selected.description}</p>
        <dl className="lineage-facts"><div><dt>Parents</dt><dd>{selected.parents.length ? selected.parents.join(" × ") : "External origin"}</dd></div><div><dt>Children</dt><dd>{selected.children.length ? selected.children.join(", ") : "No children yet"}</dd></div><div><dt>Descendants</dt><dd>{selected.descendants}</dd></div><div><dt>Birth / verified launch</dt><dd>{selected.launchedAt ? new Date(selected.launchedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}) : "Not born on Splice"}</dd></div></dl>
        <div className="lineage-traits"><span>Inherited traits</span><div className="trait-tags">{selected.traits.map(trait=><span key={trait}>{trait}</span>)}</div></div>
      </section> : <div className="tree-hint">Select a token to see its parents, descendants, and inherited traits.</div>}
    </div>
    <p className="lineage-disclaimer">Live verified mainnet launches. Generated drafts and failed attempts never enter this tree.</p>
  </>;
}

"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Combobox, ComboboxInput, ComboboxList, ComboboxItem } from "@/components/ui/combobox";
import { useTokenSelection } from "@/hooks/use-token-selection";
import { useTokenSearch } from "@/hooks/use-token-search";
import { popularCoins } from "@/lib/tokens/catalog";
import { sameParent } from "@/lib/tokens/client";
import type { Coin } from "@/lib/memesplice/types";
import { Artwork } from "./artwork";
import { TokenSearchStatus } from "./token-search-status";
export function CoinPicker({ open, onClose, target, onTarget, parents, onChoose, initialQuery = "" }: { open: boolean; onClose: () => void; target: 0 | 1; onTarget: (target: 0 | 1) => void; parents: [Coin | null, Coin | null]; onChoose: (coin: Coin) => void; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [previous, setPrevious] = useState({open,initialQuery});
  const [selectionError, setSelectionError] = useState("");
  if(previous.open!==open||previous.initialQuery!==initialQuery){setPrevious({open,initialQuery});if(open){setQuery(initialQuery);setSelectionError("");}}
  const search = useTokenSearch(query, open), other = parents[target === 0 ? 1 : 0];
  const verification=useTokenSelection(`${open}:${query}:${target}:${other?.contractAddress}`,coin=>{onChoose(coin);setQuery("");});
  return <Dialog open={open} onOpenChange={value => { if (!value) { onClose(); setQuery(""); } }}><DialogContent className="lab-dialog coin-dialog" onOpenAutoFocus={e=>{e.preventDefault();document.getElementById("coin-search-input")?.focus();}}>
    <span className="eyebrow"><Search size={14}/> PARENT SELECTION</span><DialogTitle>Every great meme starts somewhere.</DialogTitle><DialogDescription>Choose a Solana token by name, ticker, or mint address.</DialogDescription>
    <div className="parent-target" aria-label="Choose parent slot">{([0,1] as const).map(i => <button key={i} className={target===i ? "active" : ""} onClick={() => { onTarget(i); setSelectionError(""); }} aria-pressed={target===i}>Parent {i===0?"A":"B"}<span>{parents[i]?.ticker ?? "Not selected"}</span></button>)}</div>
    {!query.trim()&&<p className="suggested-coins-label">Popular Solana parents</p>}
    {/* Inline results stay inside Radix's modal scroll boundary. */}
    <Combobox inline open={open} modal={false} autoHighlight value={null} items={query.trim()?search.coins:popularCoins} filter={null} inputValue={query}
      onInputValueChange={(value,details) => { if (details.reason === "input-change" || details.reason === "input-clear") { setQuery(value); setSelectionError(""); } }}
      onValueChange={(coin: Coin | null, details) => { if (!coin) return; if (sameParent(coin, other)) { details.cancel(); setSelectionError("Choose two different memecoins to splice."); return; } details.cancel();void verification.select(coin); }} itemToStringLabel={(coin: Coin) => coin.name}>
      <ComboboxInput id="coin-search-input" placeholder="Search memecoin, ticker, or paste CA" aria-label="Search memecoin, ticker, or paste CA" aria-busy={search.status === "loading"} className="coin-search-field" showTrigger={false} onKeyDown={event=>{if(event.key==="Escape"){onClose();setQuery("");}}}/>
      <ComboboxList className="parent-coin-list" aria-label="Available parent coins">{(coin: Coin) => <ComboboxItem key={coin.id} value={coin} className="coin-result"><Artwork image={coin.image} name={coin.name}/><span><b>{coin.name}</b><small>${coin.ticker} · {coin.contractAddress.slice(0,4)}…{coin.contractAddress.slice(-4)}</small></span><span className="coin-cap">{sameParent(coin,other) ? "Already selected" : coin.marketCap}</span></ComboboxItem>}</ComboboxList>
    </Combobox>
    {selectionError ? <p className="search-empty" role="alert">{selectionError}</p> : verification.verificationError ? <p className="search-empty" role="alert">{verification.verificationError}</p> : query.trim()||verification.verifying ? <TokenSearchStatus {...search} status={verification.verifying?"loading":search.status} message={verification.verifying?"Verifying token…":search.message}/>:null}
    <p className="fine-print">Solana tokens · Names can repeat; check the mint address.</p>
  </DialogContent></Dialog>;
}


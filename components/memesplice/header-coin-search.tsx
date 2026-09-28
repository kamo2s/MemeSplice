"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem } from "@/components/ui/combobox";
import { useTokenSelection } from "@/hooks/use-token-selection";
import { useTokenSearch } from "@/hooks/use-token-search";
import type { Coin } from "@/lib/memesplice/types";
import { Artwork } from "./artwork";
import { TokenSearchStatus } from "./token-search-status";

export function HeaderCoinSearch({ onChoose, onOpenPicker }: { onChoose: (coin: Coin) => void; onOpenPicker: (query: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const search = useTokenSearch(query, open);
  const verification=useTokenSelection(`${open}:${query}`,coin=>{onChoose(coin);setQuery("");setOpen(false);});
  return <div className="header-search" role="search">
    <Combobox items={search.coins} filter={null} value={null} inputValue={query} open={open} modal={false} autoHighlight
      onOpenChange={next=>setOpen(next && !!query.trim())}
      onInputValueChange={(value,details)=>{if(details.reason==="input-change"||details.reason==="input-clear"){setQuery(value);setOpen(!!value.trim());}}}
      onValueChange={(coin: Coin|null,details)=>{if(!coin)return;details.cancel();void verification.select(coin);}}
      itemToStringLabel={(coin: Coin)=>coin.name}>
      <ComboboxInput className="header-search-field" aria-label="Search memecoin, ticker, or paste CA" placeholder="Search memecoin, ticker, or paste CA" aria-busy={search.status === "loading"} showTrigger={false}
        onFocus={()=>{if(query.trim())setOpen(true);}}>
        <button type="button" className="header-search-button" aria-label="Search coins" onClick={()=>{setOpen(false);onOpenPicker(query);}}><Search size={16}/></button>
      </ComboboxInput>
      <ComboboxContent className="coin-results header-search-results" align="end">
        <div className="search-results-caption">Choose a token<span>Solana tokens</span></div>
        {verification.verificationError ? <p className="search-empty" role="alert">{verification.verificationError}</p> : <TokenSearchStatus {...search} status={verification.verifying?"loading":search.status} message={verification.verifying?"Verifying token…":search.message}/>}
        <ComboboxList className="header-coin-list" aria-label="Memecoin search results">{(coin: Coin)=><ComboboxItem key={coin.id} value={coin} className="coin-result">
          <Artwork image={coin.image} name={coin.name}/><span><b>{coin.name}</b><small>${coin.ticker} · {coin.contractAddress.slice(0,4)}…{coin.contractAddress.slice(-4)}</small></span><span className="coin-cap">{coin.marketCap}</span>
        </ComboboxItem>}</ComboboxList>
      </ComboboxContent>
    </Combobox>
  </div>;
}


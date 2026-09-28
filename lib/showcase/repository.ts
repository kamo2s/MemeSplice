import prepared from './prepared.json';
import {popularCoin} from '../tokens/catalog';
import type {Coin} from '../memesplice/types';

export type ShowcaseItem = {
  id:string;
  prepared:true;
  parentA:Coin;
  parentB:Coin;
  offspring:{name:string;ticker:string;tagline:string;image:string};
  provenance:{generationJobId:string;conceptPromptVersion:string;imagePromptVersion:string}|{source:string;promptFile:string};
};

// Build-time editorial snapshots. No database, token lookup, queue or provider code.
// Artwork is served locally so repeat views also avoid Storage/API lookups.
export const showcaseItems:ShowcaseItem[]=prepared.map(item=>{
  const parentA=popularCoin(item.parentTickers[0]),parentB=popularCoin(item.parentTickers[1]);
  if(item.prepared!==true||!parentA||!parentB||parentA.id===parentB.id||
    !/^\/images\/(?:showcase|instant)\/[a-z0-9-]+\.webp$/.test(item.offspring.image)||
    ![parentA,parentB].every(parent=>parent.image.url?.startsWith('/images/tokens/')))
    throw new Error('Showcase entries require prepared local artwork and two known parents.');
  return {id:item.id,prepared:true,parentA,parentB,offspring:item.offspring,provenance:item.provenance};
});

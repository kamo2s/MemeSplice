import type {Offspring,Coin} from "../memesplice/types";
import {popularCoin} from "../tokens/catalog";
import prepared from "./instant-prepared.json";
// Editorial snapshots with pair-specific artwork. Loading one never calls AI or the queue.
export type InstantPair={id:string;parents:[Coin,Coin];category:string;pool:Offspring[]};
export const instantPairs:InstantPair[]=prepared.map(item=>{
  const parents:[Coin,Coin]=[popularCoin(item.a),popularCoin(item.b)];
  return {id:`${item.a}-${item.b}`,parents,category:item.category,pool:[{
    id:`instant-${item.a}-${item.b}-0`,name:item.name,ticker:item.ticker,
    image:{atlas:"offspring",index:0,url:item.image},tagline:item.tagline,lore:item.lore,
    personalityTraits:item.traits,parentAInfluence:45,parentBInfluence:45,mutationInfluence:10,
    generation:1,recommended:false,parents,descendants:0,
    inheritedTraits:[item.inherited[0],item.inherited[1]],status:"draft",interpretation:"balanced",launchedAt:null,source:"instant",
  }]};
});
export function chooseInstant(pair:InstantPair,previousId?:string,random=Math.random):Offspring{
  const available=pair.pool.filter(child=>child.id!==previousId);const pool=available.length?available:pair.pool;
  return structuredClone(pool[Math.min(pool.length-1,Math.floor(random()*pool.length))]);
}
// Match mint addresses, not display names or provider-specific IDs. Parent order is irrelevant.
export function findInstantPair(parents:readonly (Coin|null)[]):InstantPair|undefined{
  const [a,b]=parents.map(parent=>parent?.contractAddress);
  if(!a||!b)return undefined;
  return instantPairs.find(pair=>{
    const [x,y]=pair.parents.map(parent=>parent.contractAddress);
    return (a===x&&b===y)||(a===y&&b===x);
  });
}

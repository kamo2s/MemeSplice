import type { MemeSpliceToken } from "./types";
import type { Coin } from "../memesplice/types";
import nativeArtwork from "./native-artwork.json";
import type { TokenImageSource } from "./image-sources";
// Native files are pinned from verified metadata/DEX; provenance: TOKEN-ARTWORK.md.
const rows = [
  ["bonk","Bonk","BONK","DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",1,"underdog energy"],
  ["wif","dogwifhat","WIF","EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",2,"effortless style"],
  ["popcat","Popcat","POPCAT","7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",5,"boundless curiosity"],
  ["fartcoin","Fartcoin","FARTCOIN","9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump",6,"unfiltered mischief"],
  ["mew","cat in a dogs world","MEW","MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5",0,"white fur and mischievous narrow eyes"],
  ["pnut","Peanut the Squirrel","PNUT","2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump",0,"fluffy squirrel tail and peanut paws"],
  ["moodeng","Moo Deng","MOODENG","ED5nyyWEzpPPiWimP8vYm7sD7TD3LAt3Q3gRTWHzPJBY",0,"round pygmy hippo snout and pink cheeks"],
  ["bome","BOOK OF MEME","BOME","ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82",0,"surreal frog illustration"],
  ["trump","OFFICIAL TRUMP","TRUMP","6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",0,"raised fist and formal suit"],
  ["giga","GIGACHAD","GIGA","63LfDmNb3MQ8mw9MtZ2To9bEA2M71kZUUGq5tiJxcqj9",0,"confident smile and muscular silhouette"],
] as const;
export const popularTokens: MemeSpliceToken[]=rows.map(([,name,ticker,mint])=>{
  const image = (nativeArtwork as Record<string,TokenImageSource>)[mint];
  return {mintAddress:mint,name,ticker,imageUrl:image?.url??null,imageSources:image?[image]:[],priceUsd:null,marketCapUsd:null,decimals:null};
});
export const popularCoins: Coin[]=rows.map(([,name,ticker,mint,index,trait],i)=>({id:mint,name,ticker,contractAddress:mint,image:{atlas:"parents",index,url:popularTokens[i].imageSources?.[0]?.displayUrl??null},trait,marketCap:"",generation:0,token:popularTokens[i]}));
export const popularCoin=(ticker:string)=>popularCoins.find(coin=>coin.ticker===ticker)!;
export const normalizeSearch=(input:string)=>input.trim().replace(/^\$\s*/,"").replace(/\s+/g," ").toLowerCase();
export function catalogSearch(input:string) { const q=normalizeSearch(input);return popularTokens.filter(token=>token.name.toLowerCase().includes(q)||token.ticker.toLowerCase().includes(q)).slice(0,5); }

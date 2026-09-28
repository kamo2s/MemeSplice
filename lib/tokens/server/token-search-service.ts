import { TokenServiceError } from "../errors";
import type { MemeSpliceToken, TokenDiscoveryProvider, TokenMetadataProvider, TokenSearchResponse } from "../types";
import { classifyQuery,isSolanaAddress } from "../validation";
import { catalogSearch,normalizeSearch, popularTokens } from "../catalog";
import { AsyncCache } from "./cache";
import { imagesForToken, orderedImages, type TokenImageSource } from "../image-sources";
type Cache = {get<T>(kind:string,key:string,ttl:number,loader:()=>Promise<T>):Promise<T>;peek?<T>(kind:string,key:string):Promise<T|undefined>;put?<T>(kind:string,key:string,ttl:number,value:T):Promise<void>};
export class MemoryTokenCache implements Cache {
  private caches=new Map<string,AsyncCache<unknown>>();
  get<T>(kind:string,key:string,ttl:number,loader:()=>Promise<T>):Promise<T>{if(!this.caches.has(kind))this.caches.set(kind,new AsyncCache(ttl,500));return this.caches.get(kind)!.get(key,loader) as Promise<T>;}
  async peek<T>(kind:string,key:string){return this.caches.get(kind)?.peek(key) as T|undefined;}
  async put<T>(kind:string,key:string,ttl:number,value:T){if(!this.caches.has(kind))this.caches.set(kind,new AsyncCache(ttl,500));this.caches.get(kind)!.put(key,value);}
}
export class TokenSearchService {
  constructor(private readonly metadata:TokenMetadataProvider,private readonly discovery:TokenDiscoveryProvider,private readonly cache:Cache=new MemoryTokenCache(),private readonly permit:(identity:string)=>Promise<void>=async()=>{},private readonly usableArtwork:(token:MemeSpliceToken)=>boolean=token=>imagesForToken(token).length>0){}
  async search(input:string,identity="local"):Promise<TokenSearchResponse>{
    const query=classifyQuery(input);
    if(query.kind==="invalid")throw new TokenServiceError("INVALID_QUERY",query.message!,400);
    if(query.kind==="empty")return {tokens:[]};
    if(query.kind==="mint"){try{return {tokens:[await this.verify(query.query,identity)]};}catch(error){if(error instanceof TokenServiceError&&error.code==="NOT_FOUND")return {tokens:[]};throw error;}}
    const local=catalogSearch(query.query);
    if(local.length)return {tokens:local};
    const normalized=normalizeSearch(query.query);
    if(normalized.length<3)return {tokens:[],warning:"Type at least 3 characters to search beyond popular tokens."};
    const result = await this.cache.get("discovery-images-v2",normalized,600000,async()=>{
      await this.permit("discovery:"+identity);
      const candidates=await this.discovery.search(normalized);
      return {tokens:candidates.slice(0,5).map(candidate=>({...candidate,decimals:null}))};
    });
    // Remember provider artwork separately from verification, so later server-side
    // parent references retain discovery images too. Hints are never trusted for identity.
    await Promise.all(result.tokens.map(async token=>{
      const images=imagesForToken(token);
      await this.cache.put?.("discovery-artwork",token.mintAddress,86400000,images).catch(()=>{});
    }));
    return result;
  }
  async verify(mint:string,identity="local"):Promise<MemeSpliceToken>{
    if(!isSolanaAddress(mint))throw new TokenServiceError("INVALID_QUERY","Invalid Solana mint address.",400);
    const verified = await this.cache.get("verified-images-v3",mint,86400000,async()=>{
      const token=await this.metadata.getToken(mint);
      if(!token)throw new TokenServiceError("NOT_FOUND","Token not found.",404);
      return token;
    });
    let discovered=await this.cache.peek?.<TokenImageSource[]>("discovery-artwork",mint).catch(()=>undefined);
    const catalog=popularTokens.find(token=>token.mintAddress===mint);
    if(discovered===undefined && !catalog){
      try{
        const fallback=await this.cache.get("mint-artwork",mint,86400000,async()=>{
          await this.permit("discovery:"+identity);
          const candidate=await this.discovery.getMarketData(mint);
          return candidate?imagesForToken({...candidate,decimals:null}):[];
        });
        discovered=fallback;
      }catch{ /* Artwork discovery cannot invalidate verified identity. */ }
    }
    const imageSources=orderedImages(imagesForToken(verified,"helius"),discovered,catalog?.imageSources);
    return {...verified,imageSources,imageUrl:imageSources[0]?.url??null};
  }
  async searchWithArtwork(input:string,identity="local"):Promise<TokenSearchResponse>{
    const result=await this.search(input,identity);
    if(classifyQuery(input).kind!=="text" || catalogSearch(input).length)return result;
    // Discovery uses native DEX artwork; selection still verifies identity through Helius.
    // Helius failures leave DEX results usable; upstream 429 cooldowns still apply.
    const tokens=await Promise.all(result.tokens.map(async candidate=>{
      if(this.usableArtwork(candidate))return candidate;
      try { const verified=await this.verify(candidate.mintAddress,identity);
        const imageSources=orderedImages(verified.imageSources,imagesForToken(candidate));
        return {...candidate,imageSources,imageUrl:imageSources[0]?.url??null,metadataUri:verified.metadataUri};
      } catch { return candidate; }
    }));
    return {...result,tokens};
  }
}


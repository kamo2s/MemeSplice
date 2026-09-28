import "server-only";
import { database,hasDatabase } from "../../server/supabase";
import { AsyncCache } from "./cache";
import { TokenServiceError } from "../errors";
// Cache infrastructure is optional. Never catch the provider loader in this helper.
async function optional<T>(operation:string,run:()=>Promise<T>):Promise<T|undefined>{
  try{return await run();}catch{console.warn('[token-cache]',JSON.stringify({operation,outcome:'fallback'}));return undefined;}
}
const cacheDatabase=<T>(path:string,init:RequestInit={})=>database<T>(path,{...init,signal:AbortSignal.timeout(1000)});
export interface TokenCache { get<T>(kind:string,key:string,ttl:number,load:()=>Promise<T>):Promise<T>; }
export class SharedTokenCache implements TokenCache {
  private memory=new Map<string,AsyncCache<unknown>>();
  async peek<T>(kind:string,key:string):Promise<T|undefined> {
    const memory=this.memory.get(kind)?.peek(key);if(memory!==undefined)return memory as T;
    if(!hasDatabase())return undefined;
    const rows=await optional('read',()=>cacheDatabase<{value:T}[]>(`token_cache?kind=eq.${kind}&key=eq.${encodeURIComponent(key)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=value`));
    return rows?.[0]?.value;
  }
  async put<T>(kind:string,key:string,ttl:number,value:T) {
    if(!this.memory.has(kind))this.memory.set(kind,new AsyncCache(ttl,500));
    this.memory.get(kind)!.put(key,value);
    if(hasDatabase())await optional('write',()=>cacheDatabase("token_cache?on_conflict=kind,key",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({kind,key,value,expires_at:new Date(Date.now()+ttl).toISOString()})}));
  }
  async get<T>(kind:string,key:string,ttl:number,load:()=>Promise<T>):Promise<T> {
    if(!this.memory.has(kind))this.memory.set(kind,new AsyncCache(ttl,500));
    return this.memory.get(kind)!.get(key,async()=>{
      if(!hasDatabase())return load();
      const read=()=>optional('read',()=>cacheDatabase<{value:T}[]>(`token_cache?kind=eq.${kind}&key=eq.${encodeURIComponent(key)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=value`));
      const cached=await read();if(cached?.[0])return cached[0].value;
      const acquired=await optional('lease',()=>cacheDatabase<string|null>('rpc/splice_cache_lease',{method:'POST',body:JSON.stringify({p_kind:kind,p_key:key})}));
      if(acquired===null){
        const deadline=Date.now()+25000;let unavailable=false;
        while(Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,500));const found=await read();if(found?.[0])return found[0].value;if(found===undefined){unavailable=true;break;}}
        if(!unavailable)throw new TokenServiceError("BUSY","Search is busy right now. Try a popular token or paste its contract address.",429,15);
      }
      try {
        const value=await load();
        await optional('write',()=>cacheDatabase("token_cache?on_conflict=kind,key",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({kind,key,value,expires_at:new Date(Date.now()+ttl).toISOString()})}));
        return value;
      }finally{if(acquired)await optional('release',()=>cacheDatabase(`token_fetch_leases?kind=eq.${kind}&key=eq.${encodeURIComponent(key)}&lease_token=eq.${acquired}`,{method:"DELETE"}));}
    }) as Promise<T>;
  }
}
const attempts=new Map<string,number[]>();
const cooldowns=new Map<string,number>();
export async function withProviderCooldown<T>(provider:string,load:()=>Promise<T>):Promise<T>{
  let until=cooldowns.get(provider)??0;
  if(hasDatabase()){const rows=await optional('cooldown-read',()=>cacheDatabase<{value:{until:number}}[]>(`token_cache?kind=eq.cooldown&key=eq.${provider}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=value`));until=Math.max(until,rows?.[0]?.value.until??0);}
  if(until>Date.now())throw new TokenServiceError("BUSY","Search is busy right now. Try a popular token or paste its contract address.",429,Math.ceil((until-Date.now())/1000));
  try{return await load();}catch(error){
    if(error instanceof TokenServiceError&&error.status===429){const expires=Date.now()+(error.retryAfter??60)*1000;cooldowns.set(provider,expires);
      if(hasDatabase())await optional('cooldown-write',()=>cacheDatabase("token_cache?on_conflict=kind,key",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({kind:"cooldown",key:provider,value:{until:expires},expires_at:new Date(expires).toISOString()})}));
    }throw error;
  }
}
export async function discoveryPermit(identity:string) {
  // Keep a local ceiling during healthy operation too; outages cannot reset it.
  {
    const now=Date.now(),recent=(attempts.get(identity)??[]).filter(time=>time>now-60000);
    if(attempts.size>=1000)for(const [key,values] of attempts)if(values.every(time=>time<=now-60000))attempts.delete(key);
    if(recent.length>=10)throw new TokenServiceError("BUSY","Too many searches. Please wait a moment and try again.",429,60);
    if(attempts.size>=1000&&!attempts.has(identity))throw new TokenServiceError("BUSY","Search is busy right now. Try a popular token or paste its contract address.",429,60);
    attempts.set(identity,[...recent,now]);
  }
  if(hasDatabase()){
    const allowed=await optional('search-permit',()=>cacheDatabase<boolean>('rpc/splice_search_permit',{method:'POST',body:JSON.stringify({p_identity:identity})}));
    if(allowed===false)throw new TokenServiceError("BUSY","Too many searches. Please wait a moment and try again.",429,60);
  }
}

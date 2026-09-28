import 'server-only';
import {database,rpc} from '../../server/supabase';
import type {AIStore} from './store';
import type {Concept,ParentProfile,ProviderResult} from '../types';
import {instantPairs} from '../../generation/instant-splices';
import {pricingVersion} from '../pricing';
export class SupabaseAIStore implements AIStore{
 constructor(private id:string,private lease:string,private previousId?:string|null,private previousInstantId?:string|null){}
 begin(config:unknown){return rpc<boolean>('splice_ai_begin',{p_id:this.id,p_lease:this.lease,p_config:config});}
 reserve(stage:string,model:string){return rpc<boolean>('splice_ai_reserve',{p_id:this.id,p_lease:this.lease,p_stage:stage,p_model:model});}
 async recordCall(stage:string,result:Omit<ProviderResult<unknown>,'value'>|null,cost:number|null,error?:string){await database(`ai_calls?job_id=eq.${this.id}&stage=eq.${stage}`,{method:'PATCH',body:JSON.stringify({state:error?'FAILED':'COMPLETE',usage:result?.usage??null,request_id:result?.requestId??null,response_id:result?.responseId??null,estimated_usd:cost,pricing_version:pricingVersion,error_category:error??null,completed_at:new Date().toISOString()})});}
 async recordRun(patch:Record<string,unknown>){await database(`ai_runs?job_id=eq.${this.id}`,{method:'PATCH',body:JSON.stringify(patch)});}
 async profile(mint:string,fingerprint:string,version:string){const rows=await database<{traits:unknown}[]>(`parent_analysis_cache?mint_address=eq.${mint}&source_fingerprint=eq.${fingerprint}&analysis_version=eq.${encodeURIComponent(version)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=traits`);return rows[0]?.traits??null;}
 async saveProfile(mint:string,fingerprint:string,version:string,traits:ParentProfile){await database('parent_analysis_cache?on_conflict=mint_address,source_fingerprint,analysis_version',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({mint_address:mint,source_fingerprint:fingerprint,analysis_version:version,traits,analyzed_at:new Date().toISOString(),expires_at:new Date(Date.now()+30*86400000).toISOString()})});}
 lockProfile(key:string){return rpc<string|null>('splice_cache_lease',{p_kind:'ai-parent',p_key:key});}
 async unlockProfile(key:string,token:string){await database(`token_fetch_leases?kind=eq.ai-parent&key=eq.${key}&lease_token=eq.${token}`,{method:'DELETE'});}
 async previous(){if(this.previousInstantId){const child=instantPairs.flatMap(pair=>pair.pool).find(child=>child.id===this.previousInstantId);if(child)return {name:child.name,ticker:child.ticker,lore:child.lore,tagline:child.tagline,traits:child.personalityTraits};}if(!this.previousId)return null;const rows=await database<{concept:Concept|null}[]>(`ai_runs?job_id=eq.${this.previousId}&select=concept`);return rows[0]?.concept??null;}
 async upload(bytes:Buffer){
  const base=process.env.SUPABASE_URL!.replace(/\/$/,''),path=`custom/${this.id}/offspring.webp`;
  const response=await fetch(`${base}/storage/v1/object/offspring/${path}`,{method:'POST',headers:{apikey:process.env.SUPABASE_SECRET_KEY!,'Content-Type':'image/webp','x-upsert':'false'},body:new Uint8Array(bytes),signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!response.ok)throw new Error('STORAGE_FAILED');
  return `${base}/storage/v1/object/public/offspring/${path}`;
 }
 async pause(reason:string,seconds:number){await rpc('splice_ai_pause',{p_reason:reason,p_seconds:seconds});}
}

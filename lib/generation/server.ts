import "server-only";
import {database,rpc,BackendError} from "../server/supabase";
import {verifyToken} from "../tokens/server";
import {tokenToCoin} from "../tokens/client";
import {realGenerationProvider as generationProvider} from "../ai/generation-provider";
import type {ClaimedJob,JobView} from "./types";
import {instantPairs} from "./instant-splices";
import type {QueueBackend} from "./worker";
export async function enqueueGeneration(sessionId:string,ip:string,requestId:string,a:string,b:string,previousId:string|null=null,smoke=false,previousInstantId:string|null=null){
  if(!generationProvider.available)throw new BackendError("AI_NOT_CONNECTED","Custom generation is not connected yet. Try an Instant Splice.");
  const settings=await database<{enabled:boolean}[]>("generation_settings?id=eq.true&select=enabled");
  if(!smoke&&!settings[0]?.enabled)throw new BackendError("CAPACITY","The mutation lab is at capacity. Try an Instant Splice or check back later.",429);
  if(previousInstantId&&!instantPairs.some(pair=>pair.pool.some(child=>child.id===previousInstantId)&&pair.parents[0].contractAddress===a&&pair.parents[1].contractAddress===b))throw new BackendError('INVALID_PREVIOUS','Previous offspring does not match these parents.',400);
  const parents=await Promise.all([verifyToken(a,ip),verifyToken(b,ip)]);
  const result=await rpc<{id?:string;error?:string}>("splice_enqueue_ai",{p_session:sessionId,p_ip:ip,p_request:requestId,p_a:a,p_b:b,p_parents:parents.map(tokenToCoin),p_previous:previousId,p_smoke:smoke,p_instant:previousInstantId});
  if(result.error)throw new BackendError(result.error,result.error==="USER_LIMIT"?"You've reached your mutation limit for now. Try again later.":['PROVIDER_PAUSED','WORKER_UNAVAILABLE'].includes(result.error)?"The mutation lab is temporarily cooling down. Your options are still safe.":"The mutation lab is at capacity. Try an Instant Splice or check back later.",429);
  return result;
}
export const getJob=(id:string,sessionId:string)=>rpc<JobView|null>("splice_job_status",{p_id:id,p_session:sessionId});
export const queueBackend:QueueBackend={
  claim:()=>rpc<ClaimedJob|null>("splice_claim"),
  update:async(job,status,result,error)=>{
    if(status==='COMPLETE')return rpc<boolean>('splice_complete_ai',{p_id:job.id,p_lease:job.lease_token,p_result:result,p_path:`custom/${job.id}/offspring.webp`});
    const updated=await rpc<boolean>("splice_update",{p_id:job.id,p_lease:job.lease_token,p_status:status,p_result:result??null,p_error:error??null});
    // Preserve a more specific pipeline failure; fill in diagnostics when final persistence fails.
    if(updated&&status==='FAILED')await database(`ai_runs?job_id=eq.${job.id}&completed_at=is.null`,{method:'PATCH',body:JSON.stringify({failure_stage:'WORKER_FINALIZATION',error_category:error??'GENERATION_FAILED',completed_at:new Date().toISOString()})}).catch(()=>{console.error('[ai] final failure diagnostics unavailable',job.id);});
    return updated;
  },
};
export async function parentAnalysis(mint:string,fingerprint:string,version:string){
  const rows=await database<{traits:unknown}[]>(`parent_analysis_cache?mint_address=eq.${encodeURIComponent(mint)}&source_fingerprint=eq.${encodeURIComponent(fingerprint)}&analysis_version=eq.${encodeURIComponent(version)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=traits`);return rows[0]?.traits??null;
}
export const saveParentAnalysis=(mint:string,fingerprint:string,version:string,traits:unknown)=>database("parent_analysis_cache?on_conflict=mint_address,source_fingerprint,analysis_version",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({mint_address:mint,source_fingerprint:fingerprint,analysis_version:version,traits,analyzed_at:new Date().toISOString(),expires_at:new Date(Date.now()+30*86400000).toISOString()})});

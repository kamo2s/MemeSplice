import type {GenerationProvider} from "./provider";
import {lowCostPolicy} from "./provider";
import type {ClaimedJob} from "./types";
import {z} from "zod";
const resultSchema=z.object({name:z.string().min(1).max(100),ticker:z.string().min(1).max(32),tagline:z.string().min(1).max(300),lore:z.string().min(1).max(2000),
  image:z.object({atlas:z.enum(["parents","offspring"]),index:z.number().int().min(0).max(11),url:z.string().url().optional().nullable(),hue:z.number().optional()}),
  personalityTraits:z.array(z.string().min(1)).min(1).max(8),inheritedTraits:z.tuple([z.string(),z.string()]),
  parentAInfluence:z.number().min(0).max(100),parentBInfluence:z.number().min(0).max(100),mutationInfluence:z.number().min(0).max(100),
  interpretation:z.enum(["balanced","parent-a","parent-b"]),parents:z.tuple([z.object({contractAddress:z.string()}),z.object({contractAddress:z.string()})])});
export interface QueueBackend {claim():Promise<ClaimedJob|null>;update(job:ClaimedJob,status:string,result?:unknown,error?:string):Promise<boolean>}
export async function runGenerationWorker(backend:QueueBackend,provider:GenerationProvider){
  if(!provider.available)return {started:false,reason:"AI_NOT_CONNECTED"};
  const job=await backend.claim();if(!job)return {started:false,reason:"WAITING"};
  try{
    const result=await provider.generate(job.parents,{jobId:job.id,leaseToken:job.lease_token,previousJobId:job.previous_job_id,previousInstantId:job.previous_instant_id,policy:lowCostPolicy,onStage:async stage=>{if(!await backend.update(job,stage))throw new Error("LEASE_LOST");}});
    resultSchema.parse(result);
    if(Array.isArray(result)||!result||result.parents?.length!==2||result.parents[0].contractAddress!==job.parent_a_mint||result.parents[1].contractAddress!==job.parent_b_mint||result.parentAInfluence+result.parentBInfluence+result.mutationInfluence!==100)throw new Error("INVALID_RESULT");
    if(!await backend.update(job,"COMPLETE",{...result,id:job.id,parents:job.parents,generation:Math.max(job.parents[0].generation??0,job.parents[1].generation??0)+1,descendants:0,recommended:false,source:"custom",status:"draft",launchedAt:null}))throw new Error("LEASE_LOST");
    return {started:true,status:"COMPLETE"};
  }catch{await backend.update(job,"FAILED",undefined,"GENERATION_FAILED");return {started:true,status:"FAILED"};}
}

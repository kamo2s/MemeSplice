import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {database,rpc} from '@/lib/server/supabase';
import {enqueueGeneration,queueBackend} from '@/lib/generation/server';
import {realGenerationProvider} from '@/lib/ai/generation-provider';
import {runGenerationWorker} from '@/lib/generation/worker';
import type {ClaimedJob} from '@/lib/generation/types';
import {isSolanaAddress} from '@/lib/tokens/validation';
export const runtime='nodejs';
export const maxDuration=480;
function authorized(request:Request){const key=process.env.GENERATION_WORKER_SECRET,provided=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';return process.env.AI_SMOKE_TESTS_ENABLED==='true'&&!!key&&key.length>=32&&Buffer.byteLength(provided)===Buffer.byteLength(key)&&timingSafeEqual(Buffer.from(provided),Buffer.from(key));}
export async function GET(request:Request){
 if(!authorized(request))return new Response(null,{status:404});
 try{const id=new URL(request.url).searchParams.get('id');
 if(id){z.string().uuid().parse(id);const rows=await database<{id:string;status:string;result:unknown}[]>(`generation_jobs?id=eq.${id}&is_smoke=eq.true&select=id,status,result`);return Response.json(rows[0]??null,{headers:{'Cache-Control':'no-store'}});}
 const settings=await database('generation_settings?select=enabled,max_worker_concurrency,max_per_hour,max_per_day,user_per_hour,ai_paused_until,ai_pause_reason,smoke_max_jobs');
 return Response.json({available:realGenerationProvider.available,settings},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'SMOKE_BACKEND_UNAVAILABLE'},{status:503});}
}
const input=z.discriminatedUnion('action',[
 z.object({action:z.literal('enqueue'),sessionId:z.string().uuid(),requestId:z.string().uuid(),parentA:z.string().refine(isSolanaAddress),parentB:z.string().refine(isSolanaAddress),previousJobId:z.string().uuid().nullable().optional()}).strict(),
 z.object({action:z.literal('run'),id:z.string().uuid()}).strict()
]);
export async function POST(request:Request){
 if(!authorized(request))return new Response(null,{status:404});
 try{const raw=await request.text();if(raw.length>1500)return new Response(null,{status:400});const body=input.parse(JSON.parse(raw));
 if(body.action==='enqueue')return Response.json(await enqueueGeneration('smoke:'+body.sessionId,'manual-smoke',body.requestId,body.parentA,body.parentB,body.previousJobId??null,true));
 return Response.json(await runGenerationWorker({...queueBackend,claim:()=>rpc<ClaimedJob|null>('splice_claim_ai',{p_smoke_id:body.id})},realGenerationProvider));
 }catch{return Response.json({error:'SMOKE_FAILED_CHECK_SERVER_AND_AI_RECORDS'},{status:503});}
}

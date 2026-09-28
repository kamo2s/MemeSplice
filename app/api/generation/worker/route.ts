import {timingSafeEqual} from "node:crypto";
import {runGenerationWorker} from "@/lib/generation/worker";
import {queueBackend} from "@/lib/generation/server";
import {realGenerationProvider as generationProvider} from "@/lib/ai/generation-provider";
import {rpc} from "@/lib/server/supabase";
export const runtime="nodejs";
export const maxDuration=480;
function authorized(request:Request){
  const key=process.env.GENERATION_WORKER_SECRET,provided=request.headers.get("authorization")?.replace(/^Bearer /,"")??"";
  return !!key&&key.length>=32&&Buffer.byteLength(provided)===Buffer.byteLength(key)&&timingSafeEqual(Buffer.from(provided),Buffer.from(key));
}
export async function GET(request:Request){
  if(!authorized(request))return new Response(null,{status:401});
  if(!generationProvider.available)return Response.json({available:false},{status:503});
  try{return Response.json({available:true,...await rpc<Record<string,unknown>>('splice_worker_heartbeat')},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'WORKER_UNAVAILABLE'},{status:503});}
}
export async function POST(request:Request){
  if(!authorized(request))return new Response(null,{status:401});
  try{return Response.json(await runGenerationWorker(queueBackend,generationProvider),{headers:{"Cache-Control":"no-store"}});}catch{return Response.json({error:"WORKER_UNAVAILABLE"},{status:503});}
}

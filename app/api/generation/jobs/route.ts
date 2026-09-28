import {z} from "zod";
import {enqueueGeneration} from "@/lib/generation/server";
import {realGenerationProvider as generationProvider} from "@/lib/ai/generation-provider";
import {BackendError,database} from "@/lib/server/supabase";
import {session,callerHash,requireSameOrigin} from "@/lib/server/identity";
import {isSolanaAddress} from "@/lib/tokens/validation";
export const runtime="nodejs";
const schema=z.object({requestId:z.string().uuid(),parentA:z.string().refine(isSolanaAddress),parentB:z.string().refine(isSolanaAddress),previousJobId:z.string().uuid().nullable().optional(),previousInstantId:z.string().max(100).nullable().optional()}).strict().refine(value=>value.parentA!==value.parentB);
export async function POST(request:Request){
  try{
    requireSameOrigin(request);
    if(!generationProvider.available)throw new BackendError("AI_NOT_CONNECTED","Custom generation is not connected yet. Try an Instant Splice.");
    const text=await request.text();if(text.length>1000)throw new BackendError("INVALID_INPUT","Choose two different Solana tokens.",400);
    const parsed=schema.safeParse(JSON.parse(text));if(!parsed.success)throw new BackendError("INVALID_INPUT","Choose two different Solana tokens.",400);
    const identity=session(request);if(!identity)throw new BackendError('SESSION_REQUIRED','Please retry to establish your queue session.',401);
    const job=await enqueueGeneration(identity.id,callerHash(request),parsed.data.requestId,parsed.data.parentA,parsed.data.parentB,parsed.data.previousJobId??null,false,parsed.data.previousInstantId??null);
    return Response.json(job,{status:202,headers:{"Cache-Control":"no-store",...(identity.cookie?{"Set-Cookie":identity.cookie}:{})}});
  }catch(error){const safe=error instanceof BackendError?error:new BackendError("UNAVAILABLE","Custom generation is temporarily unavailable. Try an Instant Splice.");return Response.json({error:{code:safe.code,message:safe.message}},{status:safe.status,headers:{"Cache-Control":"no-store"}});}
}
export async function GET(request:Request){
  const identity=session(request);if(!identity)return new Response(null,{status:401});
  const id=z.string().uuid().safeParse(new URL(request.url).searchParams.get('requestId'));if(!id.success)return new Response(null,{status:400});
  try{const rows=await database<{id:string}[]>(`generation_jobs?session_id=eq.${identity.id}&request_id=eq.${id.data}&select=id`);return Response.json(rows[0]??null,{headers:{'Cache-Control':'no-store'}});}catch{return new Response(null,{status:503});}
}

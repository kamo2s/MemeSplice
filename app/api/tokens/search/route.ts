import { publicTokenError } from "@/lib/tokens/errors";
import { searchTokens } from "@/lib/tokens/server";
import { callerHash } from "@/lib/server/identity";
import { classifyQuery } from "@/lib/tokens/validation";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  try{
    const query=new URL(request.url).searchParams.get("q")??"";
    const result=await searchTokens(query,callerHash(request));
    return Response.json(result,{headers:{"Cache-Control":classifyQuery(query).kind==="mint"?"public, max-age=60, s-maxage=600":"public, max-age=60, s-maxage=600, stale-while-revalidate=300","X-Content-Type-Options":"nosniff"}});
  }catch(error){const safe=publicTokenError(error);return Response.json({error:{code:safe.code,message:safe.message}},{status:safe.status,headers:{"Cache-Control":"no-store",...(safe.retryAfter?{"Retry-After":String(safe.retryAfter)}:{})}});}
}


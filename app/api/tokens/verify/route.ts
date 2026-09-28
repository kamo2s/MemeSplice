import { verifyToken } from "@/lib/tokens/server";
import { publicTokenError } from "@/lib/tokens/errors";
import {callerHash} from "@/lib/server/identity";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  try{return Response.json({tokens:[await verifyToken(new URL(request.url).searchParams.get("mint")??"",callerHash(request))]},{headers:{"Cache-Control":"public, max-age=60, s-maxage=86400"}});}
  catch(error){const safe=publicTokenError(error);return Response.json({error:{code:safe.code,message:safe.message}},{status:safe.status,headers:{"Cache-Control":"no-store",...(safe.retryAfter?{"Retry-After":String(safe.retryAfter)}:{})}});}
}

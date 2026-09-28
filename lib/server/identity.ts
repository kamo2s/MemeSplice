import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { BackendError } from "./supabase";
const cookieName="splice_session";
function secret() { const key=process.env.SESSION_SECRET; if(!key||key.length<32)throw new BackendError("NOT_CONFIGURED","The mutation lab is not configured yet. Try an Instant Splice.");return key; }
function sign(value:string) { return createHmac("sha256",secret()).update(value).digest("hex"); }
export function session(request:Request,create=false) {
  const value=request.headers.get("cookie")?.split(";").map(part=>part.trim()).find(part=>part.startsWith(`${cookieName}=`))?.slice(cookieName.length+1);
  const [id,signature]=value?.split(".")??[];
  if(id&&/^[a-f0-9-]{36}$/.test(id)&&signature&&/^[a-f0-9]{64}$/.test(signature)&&timingSafeEqual(Buffer.from(signature),Buffer.from(sign(id))))return {id,cookie:null};
  if(!create)return null;
  const newId=randomUUID();return {id:newId,cookie:`${cookieName}=${newId}.${sign(newId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${new URL(request.url).protocol==="https:"?"; Secure":""}`};
}
export function callerHash(request:Request) {
  // Configure only a header overwritten by your trusted ingress. Ignore arbitrary forwarded headers.
  const header=process.env.TRUSTED_CLIENT_IP_HEADER;
  const address=header?request.headers.get(header)?.split(",")[0].trim():null;
  return createHmac("sha256",process.env.SESSION_SECRET||"local-search-only").update(address||"unidentified-shared-client").digest("hex");
}
export function requireSameOrigin(request:Request) {
  const origin=request.headers.get("origin");
  if(origin!==new URL(request.url).origin)throw new BackendError("FORBIDDEN","This request could not be verified.",403);
}

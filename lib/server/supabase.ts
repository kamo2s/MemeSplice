import "server-only";
export class BackendError extends Error {
  constructor(public code: string, message: string, public status=503) { super(message); }
}
export const hasDatabase = () => !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SECRET_KEY;
export async function database<T>(path: string, init: RequestInit={}): Promise<T> {
  if (!hasDatabase()) throw new BackendError("NOT_CONFIGURED", "The mutation lab is not connected yet. Try an Instant Splice.");
  const url=process.env.SUPABASE_URL!;
  if (!url.startsWith("https://")) throw new BackendError("NOT_CONFIGURED","The mutation lab is not configured correctly.");
  try {
    const response=await fetch(`${url.replace(/\/$/,"")}/rest/v1/${path}`,{...init,cache:"no-store",signal:init.signal??AbortSignal.timeout(12000),headers:{apikey:process.env.SUPABASE_SECRET_KEY!,"Content-Type":"application/json",...init.headers}});
    if (!response.ok) {
      const details=await response.json().catch(()=>null) as {code?:unknown}|null;
      console.warn('[supabase]',JSON.stringify({operation:path.split('?')[0],status:response.status,code:typeof details?.code==='string'&&/^[A-Z0-9]+$/.test(details.code)?details.code:undefined}));
      throw new BackendError("BACKEND_UNAVAILABLE","The mutation lab is temporarily unavailable. Try an Instant Splice.");
    }
    // PostgREST return=minimal inserts succeed with 201 and an empty body;
    // updates/deletes usually return 204. Neither response requires JSON.
    const body=await response.text();
    return body.trim()?JSON.parse(body) as T:undefined as T;
  } catch(error) { if(error instanceof BackendError)throw error;throw new BackendError("BACKEND_UNAVAILABLE","The mutation lab is temporarily unavailable. Try an Instant Splice."); }
}
export const rpc=<T>(name:string,args:Record<string,unknown>={})=>database<T>(`rpc/${name}`,{method:"POST",body:JSON.stringify(args)});

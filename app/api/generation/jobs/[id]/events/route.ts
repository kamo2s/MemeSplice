import {session} from "@/lib/server/identity";
import {getJob} from "@/lib/generation/server";
import type {JobView} from "@/lib/generation/types";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  if(!/^[\da-f-]{36}$/i.test(id))return new Response(null,{status:400});
  let identity;try{identity=session(request);}catch{return new Response(null,{status:503});}
  if(!identity)return new Response(null,{status:401});
  let first:JobView|null;
  try{first=await getJob(id,identity.id);}catch{return new Response(null,{status:503});}
  if(!first)return new Response(null,{status:404});
  const sessionId=identity.id,encoder=new TextEncoder();let stopped=false,timer:ReturnType<typeof setTimeout>|undefined;
  const stream=new ReadableStream({
    start(controller){
      const start=Date.now();let last="";
      const close=()=>{if(stopped)return;stopped=true;if(timer)clearTimeout(timer);request.signal.removeEventListener("abort",close);try{controller.close();}catch{}};
      request.signal.addEventListener("abort",close,{once:true});
      const emit=async(job:JobView|null=first)=>{
        if(stopped)return;
        try{
          const current=job??await getJob(id,sessionId);if(!current){close();return;}
          const json=JSON.stringify(current);
          if(json!==last){controller.enqueue(encoder.encode(`data: ${json}\n\n`));last=json;}else controller.enqueue(encoder.encode(": heartbeat\n\n"));
          if(["COMPLETE","FAILED"].includes(current.status)||Date.now()-start>50000){close();return;}
          timer=setTimeout(()=>void emit(null),2000);
        }catch{close();}
      };
      controller.enqueue(encoder.encode("retry: 3000\n\n"));void emit();
    },
    cancel(){stopped=true;if(timer)clearTimeout(timer);},
  });
  return new Response(stream,{headers:{"Content-Type":"text/event-stream","Cache-Control":"private, no-store","X-Accel-Buffering":"no"}});
}

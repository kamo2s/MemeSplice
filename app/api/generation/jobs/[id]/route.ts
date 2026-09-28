import {session} from "@/lib/server/identity";
import {getJob} from "@/lib/generation/server";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const identity=session(request);if(!identity)return new Response(null,{status:401});
    const {id}=await params;if(!/^[\da-f-]{36}$/i.test(id))return new Response(null,{status:400});
    const job=await getJob(id,identity.id);return Response.json(job,{status:job?200:404,headers:{"Cache-Control":"private, no-store"}});
  }catch{return Response.json({error:"QUEUE_UNAVAILABLE"},{status:503,headers:{"Cache-Control":"no-store"}});}
}

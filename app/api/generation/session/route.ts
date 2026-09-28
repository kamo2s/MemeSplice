import {requireSameOrigin,session} from '@/lib/server/identity';
export const runtime='nodejs';
export async function POST(request:Request){
 try{requireSameOrigin(request);const identity=session(request,true)!;return new Response(null,{status:204,headers:{'Cache-Control':'no-store',...(identity.cookie?{'Set-Cookie':identity.cookie}:{})}});}catch{return new Response(null,{status:403});}
}

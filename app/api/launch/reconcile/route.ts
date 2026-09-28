import {workerAuthorized} from '@/lib/server/worker-auth';
import {reconcileLaunchBatch} from '@/lib/launch/reconciliation';
import {z} from 'zod';
export const runtime='nodejs';
export const maxDuration=480;
export async function POST(request:Request){
 if(!workerAuthorized(request))return new Response(null,{status:401});
 const cursor=z.string().uuid().nullable().safeParse(new URL(request.url).searchParams.get('after'));
 if(!cursor.success)return new Response(null,{status:400});
 try{return Response.json(await reconcileLaunchBatch(cursor.data),{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({error:'RECONCILIATION_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store'}});}
}

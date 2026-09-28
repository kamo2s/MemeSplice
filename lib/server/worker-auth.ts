import 'server-only';
import {timingSafeEqual} from 'node:crypto';

export function workerAuthorized(request:Request){
 const key=process.env.GENERATION_WORKER_SECRET;
 const provided=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
 return !!key&&key.length>=32&&Buffer.byteLength(provided)===Buffer.byteLength(key)&&timingSafeEqual(Buffer.from(provided),Buffer.from(key));
}

import 'server-only';
import {z} from 'zod';
import {database} from '../server/supabase';
import {LaunchError} from './validation';
import type {Offspring} from '../memesplice/types';
// Operator-scoped, local-only read-only rehearsal. It grants no launch ownership,
// copies no browser session, and has no prepare/submit/broadcast capability.
export async function walletCheckContext(request:Request){
 if(!['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname)||process.env.PUMP_LAUNCH_ENABLED!=='false'||process.env.PUMP_MAINNET_LAUNCH_ENABLED!=='false')throw new LaunchError('NOT_READY',403);
 const id=z.string().uuid().parse(process.env.PUMP_WALLET_CHECK_OFFSPRING_ID);
 const child=(await database<{id:string;generation_job_id:string;result:Offspring}[]>(`offspring?id=eq.${id}&select=id,generation_job_id,result`))[0];
 if(!child)throw new LaunchError('NOT_OWNED',404);
 const job=(await database<{session_id:string}[]>(`generation_jobs?id=eq.${child.generation_job_id}&status=eq.COMPLETE&select=session_id`))[0];
 if(!job)throw new LaunchError('NOT_OWNED',404);
 return {session:job.session_id,offspring:{...child.result,id:child.id,generationJobId:child.generation_job_id}};
}

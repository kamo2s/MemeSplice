import 'server-only';
import {z} from 'zod';
import {database} from '../server/supabase';
import {launchConfig} from './config';
import {reconcile,type LaunchRow} from './server';

// No preparation, signing, pinning or submission. Continue checking even when
// new launches are disabled. Keyset pagination prevents stuck rows starving others.
export async function reconcileLaunchBatch(after:string|null=null){
 if(after!==null)z.string().uuid().parse(after);
 const network=launchConfig().network;
 const rows=await database<LaunchRow[]>(`offspring_launches?network=eq.${network}&status=in.(AWAITING_SIGNATURE,SUBMITTED,CONFIRMING,CONFIRMED)&order=id.asc&limit=3${after?`&id=gt.${after}`:''}`);
 const results=await Promise.allSettled(rows.map(row=>reconcile(row)));
 return {
  checked:rows.length,
  verified:results.filter(r=>r.status==='fulfilled'&&r.value.status==='VERIFIED').length,
  failed:results.filter(r=>r.status==='fulfilled'&&r.value.status==='FAILED').length,
  errors:results.filter(r=>r.status==='rejected').length,
  nextCursor:rows.length===3?rows[rows.length-1].id:null,
 };
}

import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {setup} from './database-fixture.mjs';
const migration=await readFile(new URL('../supabase/migrations/202609270004_pump_launch.sql',import.meta.url),'utf8')+await readFile(new URL('../supabase/migrations/202609270005_launch_settings.sql',import.meta.url),'utf8');
const identity={name:'Moon Pup',symbol:'MPUP',description:'A curious offspring.'};
async function child(db,session='owner',a='parent-a',b='parent-b'){
 const id=randomUUID();await db.query("insert into generation_jobs(id,session_id,ip_hash,request_id,parent_a_mint,parent_b_mint,parents,status,result) values($1,$2,'ip',$3,$4,$5,'[{},{}]','COMPLETE','{}')",[id,session,randomUUID(),a,b]);
 await db.query("insert into offspring(id,generation_job_id,parent_a_mint,parent_b_mint,generation_number,image_storage_path,result) values($1,$1,$2,$3,1,$4,'{}')",[id,a,b,id+'.webp']);return id;
}
const begin=async(db,id,session='owner',mint=randomUUID(),network='mainnet-beta')=>(await db.query('select splice_begin_launch($1,$2,$3,$4,$5,$6) value',[session,id,'wallet',mint,network,identity])).rows[0].value;
test('additive migration: ownership, completed jobs, duplicate/refresh protection, leases, verified lineage and RLS',async()=>{
 const db=await setup();try{
 const before=(await db.query('select * from generation_settings')).rows;await db.exec(migration);assert.deepEqual((await db.query('select * from generation_settings')).rows,before);
 const id=await child(db);await assert.rejects(begin(db,id,'other'),/NOT_OWNED/);await assert.rejects(begin(db,randomUUID()),/NOT_OWNED/);
 const first=await begin(db,id);assert.equal(first.status,'PREPARING');assert.equal((await begin(db,id)).id,first.id);
 const parallel=await Promise.all([begin(db,id),begin(db,id)]);assert.ok(parallel.every(r=>r.id===first.id));
 assert.equal((await db.query('select count(*)::int n from offspring_launches')).rows[0].n,1);
 const token=randomUUID();assert.equal((await db.query('select * from splice_launch_lease($1,$2)',[id,token])).rows.length,1);assert.equal((await db.query('select * from splice_launch_lease($1,$2)',[id,randomUUID()])).rows.length,0);
 await db.exec("update offspring_launch_assets set lease_until=now()-interval '1 second'");assert.equal((await db.query('select * from splice_launch_lease($1,$2)',[id,randomUUID()])).rows.length,1);
 await assert.rejects(db.query('select splice_verify_launch($1,$2)',[first.id,'sig']),/INVALID_LAUNCH/);
 await db.query("update offspring_launches set status='SUBMITTED',transaction_signature='sig' where id=$1",[first.id]);
 assert.equal((await begin(db,id)).status,'SUBMITTED');assert.equal((await db.query('select status from offspring where id=$1',[id])).rows[0].status,'draft');
 await db.query('select splice_verify_launch($1,$2)',[first.id,'sig']);await db.query('select splice_verify_launch($1,$2)',[first.id,'sig']);
 assert.equal((await begin(db,id)).status,'VERIFIED');assert.equal((await db.query('select status from offspring where id=$1',[id])).rows[0].status,'launched');
 assert.equal((await db.query('select count(*)::int n from offspring_lineage')).rows[0].n,1);
 const second=await child(db,'owner',first.mint_address,'external');const next=await begin(db,second);await db.query("update offspring_launches set status='SUBMITTED',transaction_signature='sig2' where id=$1",[next.id]);await db.query('select splice_verify_launch($1,$2)',[next.id,'sig2']);assert.equal((await db.query('select generation_number from offspring_lineage where offspring_id=$1',[second])).rows[0].generation_number,2);
 const dev=await child(db);const devLaunch=await begin(db,dev,'owner',randomUUID(),'devnet');await db.query("update offspring_launches set status='SUBMITTED',transaction_signature='devsig' where id=$1",[devLaunch.id]);await db.query('select splice_verify_launch($1,$2)',[devLaunch.id,'devsig']);assert.equal((await db.query('select status from offspring where id=$1',[dev])).rows[0].status,'draft');assert.equal((await db.query('select count(*)::int n from offspring_lineage')).rows[0].n,2);
 await db.exec('set role anon');for(const query of ['select * from offspring_launches','select * from offspring_launch_assets','select * from offspring_lineage',`select splice_verify_launch('${first.id}','sig')`])await assert.rejects(db.exec(query),/permission denied/);
 await db.exec('reset role;set role authenticated');await assert.rejects(db.exec(`select splice_verify_launch('${first.id}','sig')`),/permission denied/);
 }finally{await db.close();}
});
test('failed attempts can retry; mint and signature stay unique and incomplete generation is blocked',async()=>{
 const db=await setup();try{await db.exec(migration);const id=await child(db);await db.query("update generation_jobs set status='FAILED' where id=$1",[id]);await assert.rejects(begin(db,id),/NOT_OWNED/);await db.query("update generation_jobs set status='COMPLETE' where id=$1",[id]);const l=await begin(db,id);await db.query("update offspring_launches set status='FAILED' where id=$1",[l.id]);const next=await begin(db,id);assert.notEqual(l.id,next.id);const another=await child(db);await assert.rejects(begin(db,another,'owner',l.mint_address),/duplicate key/);const cols=(await db.query("select column_name from information_schema.columns where table_name like 'offspring_launch%' ")).rows.map(r=>r.column_name);assert.ok(!cols.some(c=>/secret|private|seed/.test(c)));}finally{await db.close();}
});
test('launch settings persist, validate, and freeze with the prepared message through submission and retry',async()=>{
 const db=await setup();try{
  await db.exec(migration);const id=await child(db),l=await begin(db,id);
  await assert.rejects(db.query('update offspring_launches set holder_reward=true where id=$1',[l.id]),/holder_reward_ack_required/);
  for(const assignment of ['initial_buy_lamports=-1','initial_buy_lamports=999999','initial_buy_lamports=10000000001',"quote_asset='USDC'",'cashback=true','slippage_bps=500'])await assert.rejects(db.query('update offspring_launches set '+assignment+' where id=$1',[l.id]),/check constraint/);
  await db.query("update offspring_launches set initial_buy_lamports=100000000,holder_reward=true,holder_reward_acknowledged=true,estimated_wallet_cost_lamports=120000000,max_wallet_cost_lamports=122000000,status='AWAITING_SIGNATURE',message_base64='exact-message' where id=$1",[l.id]);
  assert.equal((await begin(db,id)).initial_buy_lamports,100000000);
  for(const status of ['AWAITING_SIGNATURE','SUBMITTED','CONFIRMING','CONFIRMED','FAILED']){
   await db.query('update offspring_launches set status=$1,transaction_signature=coalesce(transaction_signature,$2) where id=$3',[status,'same-signature',l.id]);
   for(const assignment of ['initial_buy_lamports=0','holder_reward=false','mayhem_mode=true',"message_base64='different'","mint_address='different'","status='PREPARING'","transaction_signature='different'"])await assert.rejects(db.query('update offspring_launches set '+assignment+' where id=$1',[l.id]),/FROZEN|INVALID_STATE/);
  }
  const next=await begin(db,id);assert.notEqual(next.id,l.id);assert.equal(next.initial_buy_lamports,0);
 }finally{await db.close();}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setup} from './database-fixture.mjs';
test('admin browser bypasses only personal quota; other sessions and shared safeguards remain protected',async()=>{
 const db=await setup();try{
  await db.exec(await readFile(new URL('../supabase/migrations/202609270006_admin_generation_sessions.sql',import.meta.url),'utf8'));
  await db.exec("update generation_settings set enabled=true,worker_seen_at=now(); insert into generation_admin_sessions(session_id,label) values('owner','test owner')");
  for(let i=0;i<3;i++)await db.query("insert into generation_jobs(session_id,ip_hash,request_id,parent_a_mint,parent_b_mint,parents,status) values('owner','shared-ip',$1,'a','b','[{},{}]','COMPLETE')",[randomUUID()]);
  const enqueue=async(session)=>(await db.query("select splice_enqueue_ai($1,'shared-ip',$2,'a','b','[{},{}]') result",[session,randomUUID()])).rows[0].result;
  assert.equal((await enqueue('visitor')).error,'USER_LIMIT');
  const first=await enqueue('owner');assert.ok(first.id);
  assert.equal((await enqueue('owner')).id,first.id);
  await db.query("update generation_jobs set status='COMPLETE' where id=$1",[first.id]);
  await db.exec("update generation_settings set enabled=false");assert.equal((await enqueue('owner')).error,'DISABLED');
  await db.exec("update generation_settings set enabled=true,ai_paused_until=now()+interval '1 minute'");assert.equal((await enqueue('owner')).error,'PROVIDER_PAUSED');
  await db.exec("update generation_settings set ai_paused_until='-infinity',max_queued=1; insert into generation_jobs(session_id,ip_hash,request_id,parent_a_mint,parent_b_mint,parents) values('waiting','other',gen_random_uuid(),'a','b','[{},{}]')");assert.equal((await enqueue('owner')).error,'CAPACITY');
  await db.exec("update generation_jobs set status='COMPLETE' where status='QUEUED'; update generation_admin_sessions set expires_at=now()-interval '1 second'");assert.equal((await enqueue('owner')).error,'USER_LIMIT');
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.exec('select * from generation_admin_sessions'),/permission denied/);await assert.rejects(db.exec("insert into generation_admin_sessions(session_id,label) values('attacker','no')"),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});

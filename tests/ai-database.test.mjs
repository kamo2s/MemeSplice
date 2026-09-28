import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';
async function setup(){const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');for(const name of ['202609270001_cost_controls.sql','202609270002_ai_generation.sql','202609270003_public_ai_launch.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));return db;}
const a='parent-a',b='parent-b',parents=[{contractAddress:a,generation:0},{contractAddress:b,generation:0}];
const rpc=async(db,sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const enqueue=(db,session='session',previous=null,smoke=true)=>rpc(db,'select splice_enqueue_ai($1,$1,$2,$3,$4,$5,$6,$7)',[session,randomUUID(),a,b,JSON.stringify(parents),previous,smoke]);
test('Phase 2B migration keeps public disabled, smoke uses existing quotas and strict paid-call reservations',async()=>{
 const db=await setup();try{
 assert.equal((await enqueue(db,'public',null,false)).error,'DISABLED');const {id}=await enqueue(db);assert.ok(id);assert.equal(await rpc(db,'select splice_claim()'),null);
 const job=await rpc(db,'select splice_claim_ai($1)',[id]);assert.equal(job.status,'ANALYZING');assert.equal(await rpc(db,'select splice_claim_ai($1)',[id]),null);
 assert.equal(await rpc(db,'select splice_ai_begin($1,$2,$3)',[id,job.lease_token,'{}']),true);assert.equal(await rpc(db,'select splice_ai_begin($1,$2,$3)',[id,job.lease_token,'{}']),false);
 assert.equal(await rpc(db,'select splice_ai_reserve($1,$2,$3,$4)',[id,job.lease_token,'image','model']),false);
 assert.equal(await rpc(db,'select splice_ai_reserve($1,$2,$3,$4)',[id,randomUUID(),'parent_a','model']),false);
 assert.equal(await rpc(db,'select splice_ai_reserve($1,$2,$3,$4)',[id,job.lease_token,'parent_a','model']),true);assert.equal(await rpc(db,'select splice_ai_reserve($1,$2,$3,$4)',[id,job.lease_token,'parent_a','model']),false);
 for(const stage of ['SPLICING','GENERATING'])assert.equal(await rpc(db,'select splice_update($1,$2,$3)',[id,job.lease_token,stage]),true);
 assert.equal(await rpc(db,'select splice_ai_reserve($1,$2,$3,$4)',[id,job.lease_token,'image','image-model']),true);assert.equal(await rpc(db,'select splice_ai_reserve($1,$2,$3,$4)',[id,job.lease_token,'image','image-model']),false);
 await rpc(db,'select splice_update($1,$2,$3)',[id,job.lease_token,'FINALIZING']);const result={parents,generation:1,status:'draft',name:'Child',image:{url:'https://storage.example/image.webp'}};
 assert.equal(await rpc(db,'select splice_complete_ai($1,$2,$3,$4)',[id,job.lease_token,JSON.stringify(result),`custom/${id}/offspring.webp`]),true);
 assert.equal(await rpc(db,'select splice_complete_ai($1,$2,$3,$4)',[id,job.lease_token,JSON.stringify(result),`custom/${id}/offspring.webp`]),false);
 const saved=await rpc(db,'select result from offspring where id=$1',[id]);assert.equal(saved.status,'draft');assert.equal((await rpc(db,'select splice_job_status($1,$2)',[id,'session'])).status,'COMPLETE');
 const next=await enqueue(db,'session',id);assert.ok(next.id);assert.notEqual(next.id,id);assert.equal((await enqueue(db,'other',id)).error,'INVALID_PREVIOUS');
 assert.equal(await rpc(db,"select has_function_privilege('anon','splice_claim_ai(uuid)','execute')"),false);
 assert.equal(await rpc(db,"select has_table_privilege('anon','ai_calls','select')"),false);
 assert.equal(await rpc(db,'select enabled from generation_settings'),false);
 }finally{await db.close();}
});
test('smoke admission cannot bypass per-user/hour/day caps or provider pause',async()=>{
 const db=await setup();try{
 for(let i=0;i<3;i++){const job=await enqueue(db);assert.ok(job.id);await db.query("update generation_jobs set status='FAILED' where id=$1",[job.id]);}
 assert.equal((await enqueue(db)).error,'USER_LIMIT');await db.exec('update generation_settings set max_per_hour=0');assert.equal((await enqueue(db,'new')).error,'CAPACITY');await db.exec('update generation_settings set max_per_hour=3000,max_per_day=0');assert.equal((await enqueue(db,'new')).error,'CAPACITY');await db.exec('update generation_settings set max_per_day=9000');
 await rpc(db,"select splice_ai_pause('PROVIDER_AUTH',60)");assert.equal((await enqueue(db,'new')).error,'PROVIDER_PAUSED');assert.equal(await rpc(db,'select splice_claim_ai(null)'),null);
 }finally{await db.close();}
});
test('existing launch-limit regression SQL still passes on the extended schema',async()=>{
 const db=await setup();try{const notices=[];await db.exec(await readFile(new URL('../supabase/tests/launch_limits.sql',import.meta.url),'utf8'),{onNotice:n=>notices.push(n.message)});assert.equal(notices.filter(n=>n.startsWith('PASS:')).length,6);}finally{await db.close();}
});


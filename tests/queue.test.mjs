import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setup as migrated} from './database-fixture.mjs';
async function setup(){const db=await migrated();await db.exec('update generation_settings set enabled=true; select splice_worker_heartbeat();');return db;}
const a='DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',b='EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm';
const enqueue=async(db,session,ip=session,request=randomUUID())=>(await db.query('select splice_enqueue($1,$2,$3,$4,$5,$6) as value',[session,ip,request,a,b,JSON.stringify([{contractAddress:a},{contractAddress:b}])])).rows[0].value;
const claim=async db=>(await db.query('select splice_claim() as value')).rows[0].value;
const status=async(db,id,session)=>(await db.query('select splice_job_status($1,$2) as value',[id,session])).rows[0].value;
const update=async(db,job,stage,result=null)=>(await db.query('select splice_update($1,$2,$3,$4,$5) as value',[job.id,job.lease_token,stage,result?JSON.stringify(result):null,stage==='FAILED'?'TEST_FAILURE':null])).rows[0].value;
test('migration: FIFO, live position, one active job, private status, completion and idempotency',async()=>{
  const db=await setup();try{
    const request=randomUUID(),first=await enqueue(db,'one','one',request),second=await enqueue(db,'two');
    assert.equal((await enqueue(db,'one')).id,first.id);
    assert.equal((await status(db,second.id,'two')).position,2);
    assert.equal(await status(db,first.id,'two'),null);
    const job=await claim(db);assert.equal(job.id,first.id);
    assert.equal((await status(db,second.id,'two')).position,1);
    assert.equal((await claim(db)).id,second.id); // No artificial start spacing.
    assert.equal(await update(db,job,'COMPLETE',{parents:[{contractAddress:a},{contractAddress:b}]}),false);
    for(const stage of ['SPLICING','GENERATING','FINALIZING'])assert.equal(await update(db,job,stage),true);
    assert.equal(await update(db,job,'COMPLETE',[{}]),false);
    assert.equal(await update(db,job,'COMPLETE',{parents:[{contractAddress:b},{contractAddress:a}]}),false);
    assert.equal(await update(db,job,'COMPLETE',{parents:[{contractAddress:a},{contractAddress:b}],name:'One child'}),true);
    assert.equal((await status(db,first.id,'one')).status,'COMPLETE');
    assert.equal((await enqueue(db,'one','one',request)).id,first.id);
    assert.notEqual((await enqueue(db,'one')).id,first.id);
  }finally{await db.close();}
});
test('shared database allows more than 50 immediate starts; failed starts still count',async()=>{
  const db=await setup();try{
    for(let i=0;i<55;i++)await enqueue(db,'user-'+i);
    let count=0;
    for(let i=0;i<55;i++){
      const job=await claim(db);if(job){count++;await update(db,job,'FAILED');}
    }
    assert.equal(count,55);
    assert.equal((await db.query('select count(*)::int as n from generation_jobs where started_at is not null')).rows[0].n,55);
    await assert.rejects(db.exec('select max_per_minute from generation_settings')); 
  }finally{await db.close();}
});
test('concurrent claim callers share configurable worker slots and FIFO',async()=>{
  const db=await setup();try{
    await db.exec('update generation_settings set max_worker_concurrency=2');
    const first=await enqueue(db,'first');for(let i=0;i<4;i++)await enqueue(db,'rest-'+i);
    const jobs=await Promise.all(Array.from({length:8},()=>claim(db)));
    assert.equal(jobs.filter(Boolean).length,2);assert.equal(jobs.find(Boolean).id,first.id);
  }finally{await db.close();}
});
test('hour/day caps checked again at start; stale leases fail without retries or blocked queue',async()=>{
  const db=await setup();try{
    const first=await enqueue(db,'a');await enqueue(db,'b');await db.exec('update generation_settings set max_per_hour=1');
    const job=await claim(db);assert.equal(job.id,first.id);
    assert.equal(await claim(db),null);
    await db.exec('update generation_settings set max_per_hour=100,max_per_day=1');assert.equal(await claim(db),null);
    await db.exec("update generation_jobs set lease_expires_at=clock_timestamp()-interval '1 minute' where status='ANALYZING'");
    assert.equal((await status(db,first.id,'a')).status,'FAILED');
    assert.equal(await update(db,job,'SPLICING'),false);
    await db.exec('update generation_settings set max_per_day=500');assert.notEqual((await claim(db)).id,first.id);
    assert.equal((await db.query('select count(*)::int as n from generation_jobs where started_at is not null')).rows[0].n,2);
  }finally{await db.close();}
});
test('hourly session/IP abuse limits and zero capacity prevent admission',async()=>{
  const db=await setup();try{
    for(let i=0;i<3;i++){const result=await enqueue(db,'session-'+i,'same-ip');assert.ok(result.id);await db.query("update generation_jobs set status='FAILED',failed_at=clock_timestamp() where id=$1",[result.id]);}
    assert.equal((await enqueue(db,'fourth','same-ip')).error,'USER_LIMIT');
    await db.exec('update generation_settings set max_per_day=0');assert.equal((await enqueue(db,'other')).error,'CAPACITY');
    await db.exec('update generation_settings set enabled=false');assert.equal((await enqueue(db,'disabled')).error,'DISABLED');
  }finally{await db.close();}
});
test('search permits shared 10/min, fetch leases collapse misses, anonymous access denied',async()=>{
  const db=await setup();try{
    const permit=async()=>(await db.query("select splice_search_permit('client') as ok")).rows[0].ok;
    for(let i=0;i<10;i++)assert.equal(await permit(),true);assert.equal(await permit(),false);
    assert.match((await db.query("select splice_cache_lease('verified','mint') as ok")).rows[0].ok,/^[a-f0-9-]{36}$/);
    assert.equal((await db.query("select splice_cache_lease('verified','mint') as ok")).rows[0].ok,null);
    await db.exec('set role anon');await assert.rejects(db.query('select * from generation_jobs'));await assert.rejects(db.query('select splice_claim()'));
  }finally{await db.close();}
});

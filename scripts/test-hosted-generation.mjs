// Explicit hosted integration QA. Generation remains disabled throughout.
// All created rows have a unique test marker and are removed in finally.
import {randomUUID,createHmac} from 'node:crypto';
import {existsSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
if(!base?.startsWith('https://')||!key)throw new Error('Supabase is not configured.');
const app=process.env.QA_APP_URL||'http://localhost:5173';
const marker='splice-qa-'+randomUUID();
const checks=[];
async function request(path,method='GET',body,expected=200){
  const response=await fetch(base.replace(/\/$/,'')+'/rest/v1/'+path,{method,headers:{apikey:key,'Content-Type':'application/json',Prefer:'return=representation'},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  const text=await response.text();let data;try{data=text?JSON.parse(text):null;}catch{throw new Error('Unexpected Supabase response format');}
  if(response.status!==expected)throw new Error(`Supabase ${method} failed: HTTP ${response.status}; code ${typeof data?.code==='string'?data.code:'unknown'}`);
  return data;
}
const rpc=(name,body)=>request('rpc/'+name,'POST',body);
const settings=()=>request('generation_settings?select=enabled,max_worker_concurrency,max_per_hour,max_per_day,user_per_hour');
const expected={enabled:false,max_worker_concurrency:25,max_per_hour:3000,max_per_day:9000,user_per_hour:3};
const mark=name=>{checks.push({test:name,passed:true});console.log('PASS:',name);};
const a='DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',b='EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm';
const parents=[{contractAddress:a},{contractAddress:b}];
const job=(session=randomUUID(),extra={})=>({session_id:session,ip_hash:marker,request_id:randomUUID(),parent_a_mint:a,parent_b_mint:b,parents,...extra});
let reader,streamAbort;
try{
  assert.deepEqual(await settings(),[expected]);
  assert.equal((await request('generation_jobs?select=id&limit=1')).length,0,'Hosted QA requires no existing generation jobs');
  const schema=await request('');
  const tables=['generation_settings','generation_jobs','token_cache','token_fetch_leases','search_attempts','parent_analysis_cache'];
  const functions=['splice_enqueue','splice_claim','splice_update','splice_job_status','splice_cleanup','splice_search_permit','splice_cache_lease','splice_maintenance'];
  for(const name of tables)assert.ok(schema.paths['/'+name],name);
  for(const name of functions)assert.ok(schema.paths['/rpc/'+name],name);
  mark('Hosted Data API exposes all six expected tables and eight RPCs');
  const rejected=await request('generation_settings?id=eq.true','PATCH',{max_worker_concurrency:101},400);assert.equal(rejected.code,'23514');
  assert.deepEqual(await settings(),[expected]);mark('Maximum-100 worker constraint; settings remain disabled at 25 workers/3000 hour/9000 day/3 user');
  assert.deepEqual(await rpc('splice_enqueue',{p_session:randomUUID(),p_ip:marker,p_request:randomUUID(),p_a:a,p_b:b,p_parents:parents}),{error:'DISABLED'});
  assert.equal(await rpc('splice_claim',{}),null);mark('Disabled queue rejects admission and paid starts');
  const first=(await request('generation_jobs','POST',job(),201))[0];
  const second=(await request('generation_jobs','POST',job(),201))[0];
  assert.ok(first.sequence<second.sequence);
  assert.equal((await rpc('splice_job_status',{p_id:second.id,p_session:second.session_id})).position,2);
  assert.equal(await rpc('splice_job_status',{p_id:second.id,p_session:first.session_id}),null);
  assert.equal((await request('generation_jobs','POST',job(first.session_id),409)).code,'23505');
  const reused=await rpc('splice_enqueue',{p_session:first.session_id,p_ip:marker,p_request:randomUUID(),p_a:a,p_b:b,p_parents:parents});assert.equal(reused.id,first.id);assert.equal(reused.existing,true);
  mark('Hosted job inserts, sequence order, private position and one-active-session enforcement');
  const signed=second.session_id+'.'+createHmac('sha256',process.env.SESSION_SECRET).update(second.session_id).digest('hex');
  streamAbort=new AbortController();
  const timeout=setTimeout(()=>streamAbort.abort(),12000);
  try{
    const stream=await fetch(`${app}/api/generation/jobs/${second.id}/events`,{headers:{cookie:'splice_session='+signed},signal:streamAbort.signal});
    assert.equal(stream.status,200);reader=stream.body.getReader();let buffered='';
    async function nextPosition(){
      for(;;){const newline=buffered.indexOf('\n\n');if(newline>=0){const event=buffered.slice(0,newline);buffered=buffered.slice(newline+2);if(event.startsWith('data: '))return JSON.parse(event.slice(6));continue;}
        const {done,value}=await reader.read();if(done)throw new Error('SSE ended before position update');buffered+=new TextDecoder().decode(value);}
    }
    assert.equal((await nextPosition()).position,2);
    await request('generation_jobs?id=eq.'+first.id,'PATCH',{status:'FAILED',failed_at:new Date().toISOString(),error_code:'QA_ONLY'});
    assert.equal((await nextPosition()).position,1);
    mark('Real application SSE updates hosted queue position from 2 to 1');
  }finally{clearTimeout(timeout);await reader?.cancel();streamAbort.abort();}
  const expired=(await request('generation_jobs','POST',job(undefined,{status:'ANALYZING',started_at:new Date(Date.now()-120000).toISOString(),lease_token:randomUUID(),lease_expires_at:new Date(Date.now()-1000).toISOString()}),201))[0];
  assert.equal((await rpc('splice_job_status',{p_id:expired.id,p_session:expired.session_id})).error,'WORKER_TIMEOUT');
  assert.equal(await rpc('splice_update',{p_id:expired.id,p_lease:expired.lease_token,p_status:'SPLICING'}),false);
  const old=(await request('generation_jobs','POST',job(undefined,{created_at:new Date(Date.now()-25*3600000).toISOString()}),201))[0];
  assert.equal((await rpc('splice_job_status',{p_id:old.id,p_session:old.session_id})).error,'QUEUE_EXPIRED');
  mark('Hosted expired jobs, worker leases and stale update fencing');
  await request('token_cache','POST',{kind:marker,key:'shared',value:{test:true},expires_at:new Date(Date.now()+60000).toISOString()},201);
  assert.deepEqual((await request('token_cache?kind=eq.'+marker+'&key=eq.shared'))[0].value,{test:true});
  const lease=await rpc('splice_cache_lease',{p_kind:marker,p_key:'lease'});assert.ok(lease);
  assert.equal(await rpc('splice_cache_lease',{p_kind:marker,p_key:'lease'}),null);
  await request('token_fetch_leases?kind=eq.'+marker,'PATCH',{expires_at:new Date(Date.now()-1000).toISOString()});
  const replacement=await rpc('splice_cache_lease',{p_kind:marker,p_key:'lease'});assert.ok(replacement&&replacement!==lease);
  assert.deepEqual(await request('token_fetch_leases?kind=eq.'+marker+'&lease_token=eq.'+lease,'DELETE'),[]);
  for(let i=0;i<10;i++)assert.equal(await rpc('splice_search_permit',{p_identity:marker}),true);
  assert.equal(await rpc('splice_search_permit',{p_identity:marker}),false);
  mark('Hosted shared token cache, exclusive/expired/fenced leases and shared search permits');
  const worker=await fetch(app+'/api/generation/worker',{method:'POST',headers:{Authorization:'Bearer '+process.env.GENERATION_WORKER_SECRET},signal:AbortSignal.timeout(10000)});
  assert.equal(worker.status,200);assert.equal((await worker.json()).reason,'AI_NOT_CONNECTED');
  assert.deepEqual(await settings(),[expected]);mark('Real worker refuses AI work; enabled stays false');
}catch(error){console.error('FAIL:',error instanceof assert.AssertionError?'Hosted assertion failed; see the last completed check.':error.message);process.exitCode=1;}
finally{
  streamAbort?.abort();
  for(const path of ['generation_jobs?ip_hash=eq.'+marker,'token_cache?kind=eq.'+marker,'token_fetch_leases?kind=eq.'+marker,'search_attempts?identity_hash=eq.'+marker]){
    try{await request(path,'DELETE');}catch{console.error('QA cleanup failed for a marked test collection.');process.exitCode=1;}
  }
  const final=await settings();console.log('Final shared settings:',JSON.stringify(final));
  if(process.env.QA_REPORT_PATH)writeFileSync(process.env.QA_REPORT_PATH,JSON.stringify({checks,settings:final,passed:!process.exitCode},null,2));
}

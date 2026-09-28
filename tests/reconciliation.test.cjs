const {test}=require('node:test'),assert=require('node:assert/strict'),{join}=require('node:path');
const Module=require('node:module'),original=Module._load;Module._load=function(name,...args){if(name==='server-only')return {};return original.call(this,name,...args);};
const load=p=>require(join(process.env.SPLICE_PUMP_BUILD,'lib',p+'.js'));
test('background reconciliation checks existing attempts while disabled, isolates errors and pages past stuck rows',async()=>{
 const db=load('server/supabase'),config=load('launch/config'),server=load('launch/server'),worker=load('launch/reconciliation');
 const saved={db:db.database,config:config.launchConfig,reconcile:server.reconcile};const calls=[];
 const ids=[1,2,3].map(n=>`00000000-0000-4000-8000-00000000000${n}`);
 db.database=async path=>{calls.push(path);assert.match(path,/status=in.\(AWAITING_SIGNATURE,SUBMITTED,CONFIRMING,CONFIRMED\)/);assert.match(path,/network=eq.mainnet-beta/);return path.includes('&id=gt.')?[]:ids.map(id=>({id}));};
 config.launchConfig=()=>({enabled:false,network:'mainnet-beta'});
 server.reconcile=async row=>{if(row.id===ids[1])throw Error('RPC unavailable');return {...row,status:row.id===ids[0]?'VERIFIED':'SUBMITTED'};};
 try{assert.deepEqual(await worker.reconcileLaunchBatch(),{checked:3,verified:1,failed:0,errors:1,nextCursor:ids[2]});assert.equal((await worker.reconcileLaunchBatch(ids[2])).nextCursor,null);await assert.rejects(worker.reconcileLaunchBatch('bad&select=*'));assert.equal(calls.length,2);}
 finally{db.database=saved.db;config.launchConfig=saved.config;server.reconcile=saved.reconcile;}
});
test('worker authentication rejects missing, short, different and non-ASCII credentials',()=>{
 const auth=load('server/worker-auth'),old=process.env.GENERATION_WORKER_SECRET;
 try{process.env.GENERATION_WORKER_SECRET='a'.repeat(32);for(const value of ['', 'Bearer x','Bearer '+'é'.repeat(32)])assert.equal(auth.workerAuthorized(new Request('http://localhost',{headers:{authorization:value}})),false);assert.equal(auth.workerAuthorized(new Request('http://localhost',{headers:{authorization:'Bearer '+'a'.repeat(32)}})),true);process.env.GENERATION_WORKER_SECRET='short';assert.equal(auth.workerAuthorized(new Request('http://localhost',{headers:{authorization:'Bearer short'}})),false);}
 finally{if(old===undefined)delete process.env.GENERATION_WORKER_SECRET;else process.env.GENERATION_WORKER_SECRET=old;}
});

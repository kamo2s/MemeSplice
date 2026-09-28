const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
function load(file,stubs){const filename=path.resolve(file),mod=new Module(filename,module);mod.filename=filename;mod.paths=module.paths;mod.require=name=>Object.hasOwn(stubs,name)?stubs[name]:require(name);mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,filename);return mod.exports;}
class BackendError extends Error{constructor(code,message,status=503){super(message);Object.assign(this,{code,status});}}
test('public error messages separate user capacity and provider/worker cooldown without internals',async()=>{
 const codes=['USER_LIMIT','CAPACITY','PROVIDER_PAUSED','WORKER_UNAVAILABLE'];
 for(const code of codes){
  const m=load('lib/generation/server.ts',{'server-only':{},'../server/supabase':{BackendError,database:async()=>[{enabled:true}],rpc:async()=>({error:code})},'../tokens/server':{verifyToken:async()=>({})},'../tokens/server/token-images':{refreshStoredOffspring:x=>x},'../tokens/client':{tokenToCoin:x=>x},'../ai/generation-provider':{realGenerationProvider:{available:true}},'./instant-splices':{instantPairs:[]}});
  await assert.rejects(m.enqueueGeneration('session','ip','request','a','b'),e=>e.status===429&&e.message===(code==='USER_LIMIT'?"You've reached your mutation limit for now. Try again later.":code==='CAPACITY'?'The mutation lab is at capacity. Try an Instant Splice or check back later.':'The mutation lab is temporarily cooling down. Your options are still safe.'));
 }
});
test('worker health authenticates safely, publishes heartbeat only when ready, and POST uses shared worker',async()=>{
 const old=process.env.GENERATION_WORKER_SECRET;process.env.GENERATION_WORKER_SECRET='test-worker-secret-longer-than-32-characters';
 let heartbeat=0,claims=0;const provider={available:true};
 const m=load('app/api/generation/worker/route.ts',{'@/lib/server/supabase':{rpc:async name=>{assert.equal(name,'splice_worker_heartbeat');heartbeat++;return {enabled:false,paused:false,max_worker_concurrency:25,queued:0};}},'@/lib/generation/worker':{runGenerationWorker:async()=>{claims++;return {started:false,reason:'WAITING'};}},'@/lib/generation/server':{queueBackend:{}},'@/lib/ai/generation-provider':{realGenerationProvider:provider}});
 try{
 const request=key=>new Request('http://localhost/api/generation/worker',{headers:{Authorization:'Bearer '+key}});
 assert.equal((await m.GET(request('no'))).status,401);assert.equal(heartbeat,0);
 assert.equal((await m.POST(request('é'.repeat(42)))).status,401);
 const res=await m.GET(request(process.env.GENERATION_WORKER_SECRET));assert.equal((await res.json()).max_worker_concurrency,25);assert.equal(heartbeat,1);assert.equal(claims,0);
 await m.POST(request(process.env.GENERATION_WORKER_SECRET));assert.equal(claims,1);
 provider.available=false;assert.equal((await m.GET(request(process.env.GENERATION_WORKER_SECRET))).status,503);assert.equal(heartbeat,1);
 }finally{if(old===undefined)delete process.env.GENERATION_WORKER_SECRET;else process.env.GENERATION_WORKER_SECRET=old;}
});
test('real SSE route restores a completed owned result and does not call generation',async()=>{
 const id='123e4567-e89b-42d3-a456-426614174000';let reads=0;
 const m=load('app/api/generation/jobs/[id]/events/route.ts',{'@/lib/server/identity':{session:()=>({id:'owner'})},'@/lib/generation/server':{getJob:async(job,owner)=>{reads++;assert.equal(job,id);assert.equal(owner,'owner');return {id,status:'COMPLETE',result:{name:'Saved child'}};}}});
 const response=await m.GET(new Request('http://localhost/api/generation/jobs/'+id+'/events'),{params:Promise.resolve({id})});
 assert.equal(response.headers.get('Content-Type'),'text/event-stream');const text=await response.text();assert.match(text,/Saved child/);assert.match(text,/COMPLETE/);assert.equal(reads,1);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {join}=require('node:path');
const Module=require('node:module');
const load=name=>require(join(process.env.SPLICE_TEST_BUILD,'lib',name));
const original=Module._load;Module._load=function(name,...args){if(name==='server-only')return {};return original.call(this,name,...args);};
const backend=load('server/supabase.js');
const {SharedTokenCache,discoveryPermit,withProviderCooldown}=load('tokens/server/shared-cache.js');
Module._load=original;
const {TokenSearchService}=load('tokens/server/token-search-service.js');
const {DexScreenerTokenProvider}=load('tokens/providers/dexscreener-token-provider.js');
const {providerJson}=load('tokens/server/http.js');
const {settleSearchRequest}=load('tokens/search-request.js');
const mint=load('tokens/catalog.js').popularTokens[0].mintAddress;
const pair={chainId:'solana',baseToken:{address:mint,name:'Ramp',symbol:'RAMP'},info:{imageUrl:'https://images.example.com/ramp.png'}};
const token={mintAddress:mint,name:'Ramp',ticker:'RAMP',imageUrl:pair.info.imageUrl,decimals:null,marketCapUsd:null,priceUsd:null};
const dex=search=>({search,getMarketData:async()=>null});

test('DEX transient retry is coalesced, consumes one permit and no Helius for usable DEX art',async()=>{
 let calls=0,permits=0,helius=0;
 const provider=new DexScreenerTokenProvider(async()=>++calls===1?new Response('',{status:502}):Response.json({pairs:[pair]}));
 const service=new TokenSearchService({getToken:async()=>{helius++;return token;}},provider,undefined,async()=>{permits++;});
 const results=await Promise.all(['ramp',' RAMP ','$ramp'].map(q=>service.searchWithArtwork(q)));
 assert.ok(results.every(r=>r.tokens.length===1));assert.equal(calls,2);assert.equal(permits,1);assert.equal(helius,0);
 await service.verify(mint);assert.equal(helius,1);
});
test('two DEX 502 failures stop after exactly two attempts',async()=>{
 let calls=0;const provider=new DexScreenerTokenProvider(async()=>{calls++;return new Response('',{status:502});});
 await assert.rejects(provider.search('ramp'),{message:'Token search is temporarily unavailable. Please try again.'});assert.equal(calls,2);
});
test('DEX 400/401/403/404/429 do not retry; Retry-After survives',async()=>{
 for(const status of [400,401,403,404,429]){let calls=0;
 const provider=new DexScreenerTokenProvider(async()=>{calls++;return new Response('',{status,headers:{'Retry-After':'17'}});});
 await assert.rejects(provider.search('ramp'),e=>status!==429||e.status===429&&e.retryAfter===17);assert.equal(calls,1);}
});
test('503/504, connection reset and timeout recover once; malformed JSON does not retry',async()=>{
 for(const mode of [503,504,'reset','timeout']){let calls=0;
 const result=await providerJson(async(_url,init)=>{calls++;if(calls>1)return Response.json({ok:true});
 if(typeof mode==='number')return new Response('',{status:mode});
 if(mode==='reset')throw Object.assign(new Error('secret URL withheld'),{cause:{code:'ECONNRESET'}});
 return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('timeout'))));
 },'https://api.dexscreener.com/test',{},5,true);assert.equal(result.ok,true);assert.equal(calls,2);}
 let calls=0;await assert.rejects(providerJson(async()=>{calls++;return new Response('{');},'https://api.dexscreener.com/test',{},100,true),{code:'MALFORMED_RESPONSE'});assert.equal(calls,1);
});
test('shared cache read/write/lease/release outages preserve discovery and local coalescing',async()=>{
 const saved=backend.database,savedHas=backend.hasDatabase;backend.hasDatabase=()=>true;
 try{for(const failure of ['read','write','lease','release','all']){let providers=0;
 backend.database=async(path,init={})=>{const operation=path.startsWith('rpc/')?'lease':init.method==='POST'?'write':init.method==='DELETE'?'release':'read';if(failure===operation||failure==='all')throw Error('cache offline');return operation==='read'?[]:operation==='lease'?'lease-id':undefined;};
 const cache=new SharedTokenCache();const request=()=>cache.get('discovery','ramp',600000,async()=>{providers++;return {tokens:[token]};});
 const [a,b]=await Promise.all([request(),request()]);assert.deepEqual(a,b);assert.equal(providers,1);await request();assert.equal(providers,1);
 await cache.put('hints','ramp',1000,token);assert.deepEqual(await cache.peek('hints','ramp'),token);
 }}finally{backend.database=saved;backend.hasDatabase=savedHas;}
});
test('shared limiter denial stays authoritative; outage has local 10/min ceiling and cooldown survives cache failure',async()=>{
 const saved=backend.database,savedHas=backend.hasDatabase;backend.hasDatabase=()=>true;
 try{
 backend.database=async()=>false;await assert.rejects(discoveryPermit('denied'),{status:429});
 backend.database=async()=>{throw Error('offline');};for(let i=0;i<10;i++)await discoveryPermit('outage');await assert.rejects(discoveryPermit('outage'),{status:429});
 let calls=0;const {TokenServiceError}=load('tokens/errors.js');
 const run=()=>withProviderCooldown('qa-dex',async()=>{calls++;throw new TokenServiceError('BUSY','Busy',429,20);});
 await assert.rejects(run(),{status:429});await assert.rejects(run(),{status:429});assert.equal(calls,1);
 }finally{backend.database=saved;backend.hasDatabase=savedHas;}
});
test('known unusable discovery art is enriched; usable art skips Helius',async()=>{
 let calls=0;const service=new TokenSearchService({getToken:async()=>{calls++;return token;}},dex(async()=>[token]),undefined,undefined,()=>false);
 await service.searchWithArtwork('ramp');assert.equal(calls,1);await service.searchWithArtwork('ramp');assert.equal(calls,1);
});
test('cancelled old success/error cannot overwrite a newer successful query',async()=>{
 for(const outcome of ['resolve','reject']){let finish;const old=new AbortController(),latest=new AbortController();let current=true,state='loading';
 const pending=new Promise((resolve,reject)=>{finish=outcome==='resolve'?resolve:reject;});
 const stale=settleSearchRequest(()=>pending,old.signal,()=>current,()=>state='stale',()=>state='error');
 current=false;old.abort();await settleSearchRequest(async()=>['new'],latest.signal,()=>true,()=>state='success',()=>state='error');
 finish(outcome==='resolve'?[]:new Error('old failure'));await stale;assert.equal(state,'success');}
});

test('real PostgREST 201 empty insert response is successful, not a JSON parse failure',async()=>{
 const savedFetch=global.fetch,savedUrl=process.env.SUPABASE_URL,savedKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://supabase.example';process.env.SUPABASE_SECRET_KEY='test-only';
 try{for(const status of [201,204]){global.fetch=async()=>new Response(null,{status});assert.equal(await backend.database('token_cache',{method:'POST'}),undefined);}
 global.fetch=async()=>Response.json([{ok:true}]);assert.deepEqual(await backend.database('token_cache'),[{ok:true}]);
 }finally{global.fetch=savedFetch;if(savedUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=savedUrl;if(savedKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=savedKey;}
});

test('lease contention coalesces through shared cache; cache outage while waiting falls back once',async()=>{
 const saved=backend.database,savedHas=backend.hasDatabase;backend.hasDatabase=()=>true;
 try{for(const outage of [false,true]){let reads=0,loads=0;
 backend.database=async(path,init={})=>{
 if(path.startsWith('rpc/'))return null;
 if(!init.method){reads++;if(reads===1)return [];if(outage)throw Error('cache read unavailable');return [{value:{tokens:[token]}}];}
 };
 const cache=new SharedTokenCache();const result=await cache.get('discovery','ramp',600000,async()=>{loads++;return {tokens:[token]};});
 assert.equal(result.tokens.length,1);assert.equal(loads,outage?1:0);
 }}finally{backend.database=saved;backend.hasDatabase=savedHas;}
});

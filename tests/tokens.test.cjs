const {test}=require('node:test');
const assert=require('node:assert/strict');
const {join}=require('node:path');
const load=name=>require(join(process.env.SPLICE_TEST_BUILD,'lib',name));
const {isSolanaAddress,classifyQuery}=load('tokens/validation.js');
const {normalizeSearch,popularTokens}=load('tokens/catalog.js');
const {HeliusTokenProvider}=load('tokens/providers/helius-token-provider.js');
const {DexScreenerTokenProvider}=load('tokens/providers/dexscreener-token-provider.js');
const {TokenSearchService,MemoryTokenCache}=load('tokens/server/token-search-service.js');
const {providerJson}=load('tokens/server/http.js');
const {TokenServiceError}=load('tokens/errors.js');
const {tokenToCoin,sameParent}=load('tokens/client.js');
const {instantPairs,chooseInstant}=load('generation/instant-splices.js');
const {runGenerationWorker}=load('generation/worker.js');
const {generationProvider,lowCostPolicy}=load('generation/provider.js');
const token=popularTokens[0],mint=token.mintAddress;
const asset={id:mint,interface:'FungibleToken',content:{metadata:{name:'Bonk',symbol:'BONK'}},token_info:{decimals:5,price_info:{currency:'USDC',price_per_token:0.00001}}};
const unusedDiscovery={search:async()=>[],getMarketData:async()=>{throw Error('Must not enrich');}};
test('BONK casing, dollar sign and whitespace normalize; all catalog mints decode to 32 bytes',()=>{
  for(const query of ['BONK','bonk','$BONK',' BONK ',' $  BONK '])assert.equal(normalizeSearch(query),'bonk');
  for(const coin of popularTokens)assert.equal(isSolanaAddress(coin.mintAddress),true);
  for(const bad of ['1'.repeat(33),'z'.repeat(44),'0'.repeat(44)])assert.equal(isSolanaAddress(bad),false);
  assert.equal(classifyQuery(mint).kind,'mint');assert.equal(classifyQuery('0'.repeat(44)).kind,'invalid');
});
test('popular tokens and short queries cost zero provider calls',async()=>{
  let calls=0;const service=new TokenSearchService({getToken:async()=>{calls++;return token;}},{search:async()=>{calls++;return [token];},getMarketData:async()=>null});
  for(const query of ['BONK','bonk','$BONK',' BONK ','WIF','POPCAT','FARTCOIN','xy'])await service.search(query);
  assert.equal(calls,0);
});
test('normalized external discovery caches ten minutes; five candidates, no Helius fan-out',async()=>{
  let discoveries=0,helius=0,permits=0;const ttls=[];
  const memory=new MemoryTokenCache();const cache={get:(kind,key,ttl,load)=>{ttls.push([kind,ttl]);return memory.get(kind,key,ttl,load);}};
  const service=new TokenSearchService({getToken:async()=>{helius++;return token;}},{...unusedDiscovery,search:async()=>{discoveries++;return [token];}},cache,async()=>{permits++;});
  for(const query of ['OTHER','other','$OTHER',' OTHER '])assert.equal((await service.search(query)).tokens.length,1);
  assert.equal(discoveries,1);assert.equal(helius,0);assert.equal(permits,1);assert.ok(ttls.every(([,ttl])=>ttl===600000));
});
test('actual selection and direct CA use 24h verification cache; no extra DEX call',async()=>{
  let helius=0,ttlSeen=0;const memory=new MemoryTokenCache();
  const service=new TokenSearchService({getToken:async()=>{helius++;return token;}},unusedDiscovery,{get:(kind,key,ttl,load)=>{ttlSeen=ttl;return memory.get(kind,key,ttl,load);}});
  assert.equal((await service.verify(mint)).mintAddress,mint);await service.verify(mint);await service.search(mint);
  assert.equal(helius,1);assert.equal(ttlSeen,86400000);
});
test('failed verification is not cached; invalid CA makes no provider request',async()=>{
  let calls=0;const service=new TokenSearchService({getToken:async()=>{calls++;return null;}},unusedDiscovery);
  await assert.rejects(service.verify(mint),{code:'NOT_FOUND'});await assert.rejects(service.verify(mint),{code:'NOT_FOUND'});assert.equal(calls,2);
  await assert.rejects(service.verify('0'.repeat(44)),{code:'INVALID_QUERY'});assert.equal(calls,2);
  assert.deepEqual(await service.search(mint),{tokens:[]});
});
test('Helius failure does not select discovered candidate, cached/local results survive DEX failure',async()=>{
  const service=new TokenSearchService({getToken:async()=>{throw new TokenServiceError('PROVIDER_FAILURE','Unavailable');}},{...unusedDiscovery,search:async()=>{throw new TokenServiceError('BUSY','Busy',429,20);}});
  assert.equal((await service.search('BONK')).tokens.length,1);
  await assert.rejects(service.search('unlisted'),{status:429,retryAfter:20});await assert.rejects(service.verify(mint),{code:'PROVIDER_FAILURE'});
});
test('Helius request contract; missing optional metadata and non-fungible rejection',async()=>{
  const provider=new HeliusTokenProvider('not-a-real-key',async(_url,init)=>{assert.deepEqual(JSON.parse(init.body).params,{id:mint,options:{showFungible:true}});return Response.json({result:asset});});
  const result=await provider.getToken(mint);assert.equal(result.priceUsd,0.00001);assert.equal(result.marketCapUsd,null);assert.equal(result.imageUrl,null);
  const get=value=>new HeliusTokenProvider('test',async()=>Response.json(value)).getToken(mint);
  assert.equal(await get({result:{...asset,interface:'V1_NFT'}}),null);
  assert.equal(await get({error:{code:-32004}}),null);
  await assert.rejects(get({result:{}}),{code:'MALFORMED_RESPONSE'});
  await assert.rejects(get({error:{code:-32029}}),{status:429});
});
test('429 Retry-After honored, provider secrets sanitized, malformed JSON and timeout handled',async()=>{
  await assert.rejects(providerJson(async()=>new Response('',{status:429,headers:{'Retry-After':'17'}}),'https://provider'),{status:429,retryAfter:17});
  await assert.rejects(providerJson(async()=>{throw Error('api-key=secret');},'https://provider'),error=>!error.message.includes('secret'));
  await assert.rejects(providerJson(async()=>new Response('{'),'https://provider'),{code:'MALFORMED_RESPONSE'});
  await assert.rejects(providerJson((_url,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(Error('timeout')))),'https://provider',{},5),{code:'TIMEOUT'});
});
test('DEX deduplicates Solana mints and does not substitute FDV',async()=>{
  const pair={chainId:'solana',baseToken:{address:mint,name:'Bonk',symbol:'BONK'},marketCap:null,fdv:999,liquidity:{usd:100}};
  const provider=new DexScreenerTokenProvider(async()=>Response.json({pairs:[{...pair,chainId:'ethereum'},pair,pair]}));
  const results=await provider.search('bonk');assert.equal(results.length,1);assert.equal(results[0].marketCapUsd,null);
});
test('Instant pools yield exactly one prepared child with intact mint lineage and no custom calls',()=>{
  for(const pair of instantPairs){assert.ok(pair.pool.length>=1);const child=chooseInstant(pair,undefined,()=>0),next=chooseInstant(pair,child.id,()=>0);
    assert.equal(Array.isArray(child),false);if(pair.pool.length>1)assert.notEqual(next.id,child.id);else assert.equal(next.id,child.id);assert.ok(child.image.url?.startsWith("/images/"));assert.equal(child.source,'instant');assert.equal(child.parents[0].contractAddress,pair.parents[0].contractAddress);assert.equal(child.parents[1].contractAddress,pair.parents[1].contractAddress);assert.equal(child.parentAInfluence+child.parentBInfluence+child.mutationInfluence,100);}
  assert.equal(sameParent(tokenToCoin(token),tokenToCoin(token)),true);
});
test('worker reserves before provider, produces one child/image policy, completes and never retries',async()=>{
  const pair=instantPairs[0],result={...chooseInstant(pair),image:{atlas:"offspring",index:0,url:"https://storage.example.test/generated.webp"}},job={id:'job-1',lease_token:'lease',parents:pair.parents,parent_a_mint:pair.parents[0].contractAddress,parent_b_mint:pair.parents[1].contractAddress};
  let calls=0,claims=0;const transitions=[];const backend={claim:async()=>{claims++;return job;},update:async(_job,status,value)=>{transitions.push([status,value]);return true;}};
  await runGenerationWorker(backend,generationProvider);assert.equal(claims,0);
  const provider={available:true,generate:async(_parents,options)=>{calls++;assert.equal(claims,1);assert.equal(options.policy.imageCount,1);assert.equal(options.policy.imageQuality,'low');for(const s of ['SPLICING','GENERATING','FINALIZING'])await options.onStage(s);return result;}};
  assert.equal((await runGenerationWorker(backend,provider)).status,'COMPLETE');assert.equal(calls,1);assert.equal(transitions.at(-1)[1].source,'custom');
  calls=0;const bad={available:true,generate:async()=>{calls++;throw Error('provider failed');}};
  assert.equal((await runGenerationWorker(backend,bad)).status,'FAILED');assert.equal(calls,1);assert.equal(lowCostPolicy.automaticRetries,0);
});
test('worker rejects multiple offspring or changed parent lineage',async()=>{
  const pair=instantPairs[0],job={id:'j',lease_token:'t',parents:pair.parents,parent_a_mint:pair.parents[0].contractAddress,parent_b_mint:pair.parents[1].contractAddress};
  for(const result of [[chooseInstant(pair)],{...chooseInstant(pair),parents:[pair.parents[1],pair.parents[0]]}]){
    const states=[];await runGenerationWorker({claim:async()=>job,update:async(_j,s)=>{states.push(s);return true;}},{available:true,generate:async()=>result});assert.equal(states.at(-1),'FAILED');
  }
});


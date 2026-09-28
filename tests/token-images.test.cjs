const {test,mock}=require('node:test');
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {EventEmitter}=require('node:events');
const load=name=>require(join(process.env.SPLICE_TEST_BUILD,'lib',name));
const {safeImageUrl}=load('tokens/validation.js');
const {orderedImages,mergeVerifiedToken,metadataImages,imageGatewayVariants}=load('tokens/image-sources.js');
const {tokenToCoin,fetchVerifiedToken}=load('tokens/client.js');
const {popularTokens,popularCoins}=load('tokens/catalog.js');
const {TokenSearchService}=load('tokens/server/token-search-service.js');
const remote=load('tokens/server/safe-remote.js');
const delivery=load('tokens/server/token-images.js');
const mint=popularTokens[0].mintAddress;
const base={mintAddress:mint,name:'Example',ticker:'EX',imageUrl:null,decimals:6,priceUsd:null,marketCapUsd:null};
const source=(source,url)=>({source,url});

test('IPFS path, IPFS subdomain and Arweave normalize; unsafe protocols and literal/internal hosts fail',()=>{
  assert.equal(safeImageUrl('ipfs://ipfs/bafytest/image.png'),'https://ipfs.io/ipfs/bafytest/image.png');
  assert.equal(safeImageUrl('ar://transaction/image.png'),'https://arweave.net/transaction/image.png');
  assert.deepEqual(imageGatewayVariants('https://bafytest.ipfs.nftstorage.link/image.png'),['https://bafytest.ipfs.nftstorage.link/image.png','https://ipfs.io/ipfs/bafytest/image.png','https://dweb.link/ipfs/bafytest/image.png']);
  for(const bad of ['file:///x','data:image/png;base64,abc','javascript:alert(1)','http://127.0.0.1/a','http://2130706433/a','http://[::1]/a','https://localhost/a','https://a.internal/a','https://a.local/a','https://user:pass@example.com/a','https://example.com:444/a'])assert.equal(safeImageUrl(bad),null,bad);
});

test('verification preserves DEX; priority is Helius, DEX, metadata; another mint cannot donate its artwork',()=>{
  const dex={...base,imageSources:[source('dex','https://dex.example.com/d.png')]};
  const missing=mergeVerifiedToken(base,dex);assert.equal(missing.imageUrl,dex.imageSources[0].url);
  const verified={...base,imageSources:[source('metadata','https://meta.example.com/m.png'),source('helius','https://native.example.com/n.png')]};
  assert.deepEqual(mergeVerifiedToken(verified,dex).imageSources.map(i=>i.source),['helius','dex','metadata']);
  assert.equal(mergeVerifiedToken(base,{...dex,mintAddress:'different'}).imageUrl,null);
  assert.equal(orderedImages([source('dex','https://example.com/a'),source('helius','https://example.com/a')]).length,1);
});

test('selection client carries discovery sources into the selected Coin and reference token',async()=>{
  const dex={...base,imageSources:[source('dex','https://dex.example.com/d.png')]};
  const fetch=mock.method(global,'fetch',async()=>Response.json({tokens:[base]}));
  try{const selected=await fetchVerifiedToken(mint,new AbortController().signal,tokenToCoin(dex));
    assert.ok(selected.image.urls.includes(dex.imageSources[0].url));assert.ok(selected.token.imageSources.some(i=>i.source==='dex'));
  }finally{fetch.mock.restore();}
});

test('metadata-only tokens resolve JSON image fields including relative and decentralized images',async()=>{
  const parsed=metadataImages({image:'ipfs://bafytest/art.png',image_url:'../fallback.jpg',properties:{files:[{type:'image/png',uri:'ar://transaction'}]}},'https://example.com/meta/token.json');
  assert.ok(parsed.some(i=>i.url==='https://ipfs.io/ipfs/bafytest/art.png'));
  assert.ok(parsed.some(i=>i.url==='https://example.com/fallback.jpg'));
  assert.ok(parsed.some(i=>i.url==='https://arweave.net/transaction'));
  const remoteMock=mock.method(remote,'safeRemoteFile',async url=>({bytes:Buffer.from('{"image":"ipfs://bafytest/art.png"}'),mime:'application/json',url}));
  try{const token=await delivery.resolveTokenMetadata({...base,metadataUri:'https://metadata.example.com/token.json'});assert.equal(token.imageSources[0].source,'metadata');assert.equal(token.imageUrl,'https://ipfs.io/ipfs/bafytest/art.png');}
  finally{remoteMock.mock.restore();}
});

test('server verification and future parent references retain discovered artwork without another DEX request',async()=>{
  let discoveries=0;const candidate={...base,imageUrl:'https://dex.example.com/keep.png',imageSources:[source('dex','https://dex.example.com/keep.png')]};
  const service=new TokenSearchService({getToken:async()=>base},{search:async()=>{discoveries++;return [candidate]},getMarketData:async()=>{throw Error('No enrichment call');}});
  await service.search('unlisted');const result=await service.verify(mint);
  assert.ok(result.imageSources.some(i=>i.url===candidate.imageUrl));assert.equal(discoveries,1);
});

test('search artwork enrichment repairs missing DEX images, caches Helius and keeps DEX on provider failure',async()=>{
  let calls=0;const missing={...base,imageUrl:null};
  const service=new TokenSearchService({getToken:async()=>{calls++;return {...base,imageSources:[source('helius','https://native.example.com/art.png')]};}},{search:async()=>[missing],getMarketData:async()=>null});
  assert.equal((await service.searchWithArtwork('unlisted')).tokens[0].imageSources[0].source,'helius');
  await service.searchWithArtwork('unlisted');assert.equal(calls,1);
  const dex={...base,imageUrl:'https://dex.example.com/art.png'};
  const failed=new TokenSearchService({getToken:async()=>{throw Error('offline');}},{search:async()=>[dex],getMarketData:async()=>null});
  assert.equal((await failed.searchWithArtwork('unlisted')).tokens[0].imageUrl,dex.imageUrl);
});

test('direct mint lookup obtains a cached DEX fallback when no discovery history exists',async()=>{
  const other='GY9mZfyPpxXxBXBxS2hB2XjhP3kfUsywTvgveozxpump';let calls=0;
  const service=new TokenSearchService({getToken:async()=>({...base,mintAddress:other})},{search:async()=>[],getMarketData:async()=>{calls++;return {...base,mintAddress:other,imageUrl:'https://dex.example.com/direct.png'};}});
  assert.equal((await service.verify(other)).imageUrl,'https://dex.example.com/direct.png');await service.verify(other);assert.equal(calls,1);
});

test('popular parents/search share native local images, missing noncatalog images have no generated substitute',()=>{
  for(let i=0;i<popularTokens.length;i++){
    assert.ok(popularTokens[i].imageSources[0].displayUrl.startsWith('/images/tokens/'));
    assert.equal(popularCoins[i].image.url,tokenToCoin(popularTokens[i]).image.url);
  }
  const missing=tokenToCoin({...base,mintAddress:'missing-image-fixture'});assert.equal(missing.image.url,null);assert.deepEqual(missing.image.urls,[]);
});

test('proxy accepts signed provider URLs, rejects changed/unsigned URLs, and keeps native provenance',()=>{
  const signed=new URL(delivery.imageProxyUrl('https://example.com/art.png'),'http://localhost');
  assert.equal(delivery.authorizedImage(signed.searchParams.get('src'),signed.searchParams.get('sig')),true);
  assert.equal(delivery.authorizedImage('https://example.com/other.png',signed.searchParams.get('sig')),false);
  assert.equal(delivery.authorizedImage('https://example.com/art.png','x'.repeat(64)),false);
  const token=delivery.withImageDelivery({...base,imageSources:[source('helius','https://example.com/art.png')]});assert.equal(token.imageUrl,'https://example.com/art.png');assert.ok(token.imageSources[0].displayUrl.startsWith('/api/tokens/image?'));
});

test('SSRF guard rejects private, loopback, link-local, mapped IPv6 and reserved destinations',()=>{
  for(const ip of ['127.0.0.1','10.0.0.4','172.16.1.2','192.168.1.2','169.254.169.254','100.100.100.200','0.0.0.0','224.1.1.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1','2002:7f00:1::','2001:db8::1'])assert.equal(remote.isPublicAddress(ip),false,ip);
  assert.equal(remote.isPublicAddress('8.8.8.8'),true);assert.equal(remote.isPublicAddress('2606:4700:4700::1111'),true);
});

test('remote fetch pins DNS, checks redirect destinations, MIME, byte limits and signatures',async()=>{
  const png=Buffer.from([137,80,78,71,13,10,26,10,1]);let mode='valid',calls=0;
  const dns=mock.method(require('node:dns/promises'),'lookup',async host=>[{address:host==='private.example.com'?'127.0.0.1':'8.8.8.8',family:4}]);
  const http=mock.method(require('node:https'),'request',(url,options,callback)=>{
    calls++;options.lookup(url.hostname,{},(error,address)=>assert.equal(address,'8.8.8.8'));
    const request=new EventEmitter();request.end=()=>queueMicrotask(()=>{
      const response=new EventEmitter();response.destroy=()=>{};
      response.statusCode=mode==='redirect'?302:200;
      response.headers=mode==='redirect'?{location:'https://private.example.com/image.png'}:{'content-type':mode==='mime'?'text/html':'image/png'};
      callback(response);response.emit('data',mode==='bytes'?Buffer.from('not an image'):png);response.emit('end');
    });return request;
  });
  try{
    assert.equal((await remote.safeRemoteFile('https://public.example.com/a','image')).bytes.length,9);
    mode='redirect';calls=0;await assert.rejects(remote.safeRemoteFile('https://public.example.com/a','image'));assert.equal(calls,1);
    for(mode of ['mime','bytes'])await assert.rejects(remote.safeRemoteFile('https://public.example.com/a','image'));
    mode='valid';await assert.rejects(remote.safeRemoteFile('https://public.example.com/a','image',{maxBytes:8}));
  }finally{dns.mock.restore();http.mock.restore();}
});

test('remote deadlines and redirect caps cannot be bypassed',async()=>{
  const dns=mock.method(require('node:dns/promises'),'lookup',async()=>[{address:'8.8.8.8',family:4}]);
  let calls=0;const http=mock.method(require('node:https'),'request',(_url,_options,callback)=>{
    calls++;const request=new EventEmitter();request.end=()=>queueMicrotask(()=>{const response=new EventEmitter();response.statusCode=302;response.headers={location:'https://loop.example.com/image.png'};response.destroy=()=>{};callback(response);});return request;
  });
  try{await assert.rejects(remote.safeRemoteFile('https://loop.example.com/image.png','image'));assert.equal(calls,3);}
  finally{http.mock.restore();dns.mock.restore();}
  const slow=mock.method(require('node:dns/promises'),'lookup',()=>new Promise(resolve=>setTimeout(()=>resolve([{address:'8.8.8.8',family:4}]),50)));
  try{await assert.rejects(remote.safeRemoteFile('https://slow.example.com/a','image',{timeoutMs:5}));}finally{slow.mock.restore();}
});

test('image cache coalesces downloads; broken hosts fail cleanly and are briefly suppressed',async()=>{
  let calls=0;const fetch=mock.method(remote,'safeRemoteFile',async url=>{calls++;if(url.includes('broken'))throw Error('unreachable');return {url,mime:'image/png',bytes:Buffer.from('test')};});
  try{await Promise.all([delivery.cachedTokenImage('https://cache.example.com/a'),delivery.cachedTokenImage('https://cache.example.com/a')]);await delivery.cachedTokenImage('https://cache.example.com/a');assert.equal(calls,1);
    await assert.rejects(delivery.cachedTokenImage('https://broken.example.com/a'));await assert.rejects(delivery.cachedTokenImage('https://broken.example.com/a'));assert.equal(calls,2);
  }finally{fetch.mock.restore();}
});

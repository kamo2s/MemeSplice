const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {Keypair,VersionedTransaction,TransactionMessage}=require('@solana/web3.js');
const wire=require(path.join(process.env.SPLICE_PUMP_BUILD,'lib/launch/transaction.js'));
const {createPumpTransaction}=require(path.join(process.env.SPLICE_PUMP_BUILD,'lib/launch/pump.js'));
const validation=require(path.join(process.env.SPLICE_PUMP_BUILD,'lib/launch/validation.js'));
function elements(node,predicate){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(n=>elements(n,predicate));return [...predicate(node)?[node]:[],...elements(node.props?.children,predicate)];}
function text(node){if(typeof node==='string')return node;if(Array.isArray(node))return node.map(text).join('');return node&&typeof node==='object'?text(node.props?.children):'';}
function mount({connected=true,reject=false,initialLaunch=null,prepared=false,rehearsal=false,versioned=false,mutateOnce=false}={}){
 const saved={fetch:global.fetch,setInterval:global.setInterval,clearInterval:global.clearInterval},slots=[],requests=[],intervals=new Map(),key=Keypair.generate();let cursor=0,dirty=true,tree,pending=[],sequence=0,launch=initialLaunch,rejections=reject?1:0,connections=0,verified=0,mutations=mutateOnce?1:0;const walletInputs=[];
 const wallet={publicKey:connected?key.publicKey:null,async signTransaction(tx){walletInputs.push({message:wire.transactionMessage(tx).toString('base64'),mintSigned:wire.verifyWalletSignature(tx,wire.signerKeys(tx)[1].toBase58())});if(rejections-->0)throw Error('User rejected');if(mutations-->0){if(tx instanceof VersionedTransaction)tx.message.recentBlockhash=Keypair.generate().publicKey.toBase58();else tx.recentBlockhash=Keypair.generate().publicKey.toBase58();}if(tx instanceof VersionedTransaction)tx.sign([key]);else tx.partialSign(key);return tx;}};
 const review=()=>({launch,identity:null,enabled:!rehearsal,storageReady:true,network:'devnet',availability:{mayhem:true,holderReward:true}});
 global.fetch=async(url,init={})=>{requests.push({url,body:init.body?JSON.parse(init.body):null});if(!init.body)return Response.json(review());const body=JSON.parse(init.body);
  if(body.action==='prepare'||body.action==='preflight'){launch={id:'attempt',status:'AWAITING_SIGNATURE',network:'devnet',mint:body.mint,wallet:body.wallet,signature:null};const tx=await createPumpTransaction({wallet:body.wallet,mint:body.mint,identity:body.identity,uri:'ipfs://bafyMetadata',blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100});const result={launch:rehearsal?undefined:launch,network:'devnet',metadataUri:'ipfs://bafyMetadata',identity:body.identity,estimate:{networkFeeLamports:35000,priorityFeeLamports:25000,accountCostLamports:6000000,estimatedWalletCostLamports:6035000,maxWalletCostLamports:7035000,maxBuyLamports:0,computeUnits:110000},transaction:wire.transactionWire(versioned?new VersionedTransaction(new TransactionMessage({payerKey:tx.feePayer,recentBlockhash:tx.recentBlockhash,instructions:tx.instructions}).compileToV0Message()):tx).toString('base64')};if(rehearsal)launch=null;return Response.json(result);}
  launch={...launch,status:'SUBMITTED'};return Response.json({launch});
 };
 global.setInterval=fn=>{intervals.set(++sequence,fn);return sequence;};global.clearInterval=id=>intervals.delete(id);
 const react={useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:initial};return [slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;dirty=true;}];},useRef(value){return slots[cursor++]??=( {current:value});},useCallback(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((d,n)=>d!==old.deps[n]))slots[i]={value:fn,deps};return slots[i].value;},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((d,n)=>d!==old.deps[n]))pending.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});}};
 const filename=path.resolve('components/memesplice/launch-dialog.tsx'),mod=new Module(filename,module);mod.filename=filename;mod.paths=module.paths;
 mod.require=name=>name==='react'?react:name==='@solana/wallet-adapter-react'?{useWallet:()=>wallet}:name==='@/components/ui/dialog'?{Dialog:'dialog',DialogContent:'content',DialogTitle:'title',DialogDescription:'description'}:name==='./artwork'?{Artwork:'art'}:name==='@/lib/launch/validation'?validation:name.startsWith('@/lib/launch/')?require(path.join(process.env.SPLICE_PUMP_BUILD,name.replace('@/','')+'.js')):require(name);
 mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
 const props={offspring:{id:'child',generationJobId:prepared?undefined:'job',name:'Moon Pup',ticker:'MPUP',lore:'A curious pup.',image:{},status:'draft'},open:true,onClose(){},onConnect(){connections++;},onVerified(){verified++;}};
 function flush(){let passes=0;do{if(++passes>30)throw Error('Unstable render');dirty=false;cursor=0;pending=[];tree=mod.exports.LaunchDialog(props);pending.forEach(fn=>fn());}while(dirty);}
 async function settle(){for(let i=0;i<10;i++){await new Promise(resolve=>setImmediate(resolve));flush();}}
 flush();return {requests,walletInputs,settle,get tree(){return tree;},get connections(){return connections;},get verified(){return verified;},button(label){return elements(tree,n=>n.type==='button'&&text(n)===label)[0];},async click(label){const b=this.button(label);assert.ok(b,label);assert.ok(!b.props.disabled);b.props.onClick();await settle();},restore(){slots.forEach(s=>s.cleanup?.());Object.assign(global,saved);}};
}
test('disconnected launch requires a wallet; prepared examples make no launch request',async()=>{
 const f=mount({connected:false});try{await f.settle();await f.click('Connect Wallet');assert.equal(f.connections,1);assert.equal(f.requests.filter(r=>r.body).length,0);}finally{f.restore();}
 const example=mount({prepared:true});try{await example.settle();assert.equal(example.requests.length,0);assert.match(text(example.tree),/Prepared examples cannot be launched/);}finally{example.restore();}
});
test('double click prepares once; rejected signature retries same mint and never sends secret key',async()=>{
 const f=mount({reject:true});try{await f.settle();const button=f.button('Review Launch');button.props.onClick();button.props.onClick();await f.settle();assert.equal(f.requests.filter(r=>r.body?.action==='submit').length,0);await f.click('Confirm & Launch');assert.match(text(f.tree),/Wallet approval cancelled/);assert.equal(f.requests.filter(r=>r.body?.action==='prepare').length,1);assert.equal(f.requests.filter(r=>r.body?.action==='submit').length,0);
 await f.click('Confirm & Launch');assert.equal(f.requests.filter(r=>r.body?.action==='prepare').length,1);assert.equal(f.requests.filter(r=>r.body?.action==='submit').length,1);assert.doesNotMatch(JSON.stringify(f.requests),/secretKey|privateKey|seed/);assert.equal(f.verified,0);
 }finally{f.restore();}
});
test('refresh resumes a pending attempt without preparing a replacement or exposing external token links',async()=>{
 for(const status of ['AWAITING_SIGNATURE','SUBMITTED','CONFIRMED']){const f=mount({initialLaunch:{id:'existing',status,network:'devnet',wallet:'owner',mint:'mint',signature:'sig'}});try{await f.settle();assert.equal(f.requests.filter(r=>r.body).length,0);assert.equal(f.button('Review Launch').props.disabled,true);assert.equal(elements(f.tree,n=>n.type==='a'&&/solscan|pump.fun\/coin/.test(n.props.href)).length,0);assert.equal(f.verified,0);}finally{f.restore();}}
});

test('connected review contains image, identity, creator, network, provider and irreversible warning',async()=>{
 const f=mount();try{await f.settle();const body=text(f.tree);for(const expected of ['Moon Pup','MPUP','Creator / payer','devnet','Pump.fun','irreversible once confirmed'])assert.ok(body.includes(expected),expected);assert.ok(elements(f.tree,n=>n.type==='art').length);assert.match(body,/[1-9A-HJ-NP-Za-km-z]{32,44}/);}finally{f.restore();}
});

test('disconnect closes the wallet dialog without invoking the connected/launch continuation',async()=>{
 const filename=path.resolve('components/memesplice/wallet-dialog.tsx'),m=new Module(filename,module);m.filename=filename;m.paths=module.paths;let disconnected=0,closed=0,continued=0;
 const wallet={connected:true,publicKey:Keypair.generate().publicKey,wallets:[],disconnect:async()=>{disconnected++;}};
 m.require=name=>name==='react'?{useState:value=>[value,()=>{}],useRef:value=>({current:value}),useEffect:()=>{}}:name==='@solana/wallet-adapter-react'?{useWallet:()=>wallet}:name==='@/components/ui/dialog'?{Dialog:'dialog',DialogContent:'content',DialogTitle:'title',DialogDescription:'description'}:require(name);
 m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
 const tree=m.exports.WalletDialog({open:true,onClose:()=>closed++,onConnected:()=>continued++});elements(tree,n=>n.type==='button'&&text(n)==='Disconnect')[0].props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(disconnected,1);assert.equal(closed,1);assert.equal(continued,0);
});

test('disabled launch rehearsal opens wallet approval but never submits or supplies a mint signature',async()=>{
 const f=mount({rehearsal:true});try{await f.settle();await f.click('Review Launch');assert.match(text(f.tree),/Estimated wallet spend/);assert.match(text(f.tree),/Priority fee included above: 0.000025 SOL/);assert.match(text(f.tree),/capped at 0.001 SOL/);await f.click('Check Wallet Approval · No Broadcast');assert.match(text(f.tree),/Wallet signature verified locally/);assert.equal(f.requests.filter(r=>r.body?.action==='preflight').length,1);assert.equal(f.requests.filter(r=>r.body?.action==='prepare'||r.body?.action==='submit').length,0);assert.doesNotMatch(JSON.stringify(f.requests),/secretKey|privateKey|transaction\":/);}finally{f.restore();}
});
test('initial buy defaults off and empty, rewards need explicit acknowledgment, cashback is absent',async()=>{
 const f=mount();try{await f.settle();const inputs=elements(f.tree,n=>n.type==='input');assert.equal(inputs.length,3);assert.ok(inputs.every(n=>n.props.checked===false));assert.doesNotMatch(text(f.tree),/Cashback|MAX|creator.fee percentage/);inputs[0].props.onChange({target:{checked:true}});await f.settle();const amount=elements(f.tree,n=>n.type==='input'&&n.props.id==='launch-buy-sol')[0];assert.equal(amount.props.value,'');await f.click('Review Launch');assert.equal(f.requests.filter(r=>r.body).length,0);inputs[1].props.onChange({target:{checked:true}});await f.settle();assert.equal(f.button('Review Launch').props.disabled,true);assert.match(text(f.tree),/choice cannot be reversed/);}finally{f.restore();}
});

test('expired attempts remain visible after refresh and require a new explicit review',async()=>{
 const f=mount({initialLaunch:{id:'expired',status:'FAILED',errorCode:'EXPIRED',network:'devnet',wallet:'owner',mint:'mint',signature:'sig'}});
 try{await f.settle();assert.match(text(f.tree),/Launch did not land/);assert.match(text(f.tree),/safely expired/);assert.equal(f.button('Review Launch').props.disabled,false);assert.equal(f.requests.filter(r=>r.body).length,0);await f.click('Review Launch');assert.equal(f.requests.filter(r=>r.body?.action==='prepare').length,1);assert.equal(f.requests.filter(r=>r.body?.action==='submit').length,0);}finally{f.restore();}
});

test('uncertain submission displays RPC feedback and keeps replacement launches blocked',async()=>{
 for(const errorCode of ['RPC_PREFLIGHT','RPC_UNCERTAIN']){
  const f=mount({initialLaunch:{id:'pending',status:'SUBMITTED',errorCode,network:'devnet',wallet:'owner',mint:'mint',signature:'sig'}});
  try{await f.settle();assert.match(text(f.tree),/RPC/);assert.equal(f.button('Review Launch').props.disabled,true);assert.equal(f.requests.filter(r=>r.body).length,0);}finally{f.restore();}
 }
});

 test('legacy and v0 wallets receive the mint signature; mutated returns cannot change the retry baseline',async()=>{
 for(const versioned of [false,true]){const f=mount({versioned,mutateOnce:true});try{await f.settle();await f.click('Review Launch');await f.click('Confirm & Launch');assert.match(text(f.tree),/wallet changed the reviewed transaction/);assert.equal(f.requests.filter(r=>r.body?.action==='submit').length,0);assert.equal(f.walletInputs[0].mintSigned,true);await f.click('Confirm & Launch');assert.equal(f.walletInputs[1].message,f.walletInputs[0].message);assert.equal(f.walletInputs[1].mintSigned,true);const submits=f.requests.filter(r=>r.body?.action==='submit');assert.equal(submits.length,1);assert.equal(wire.verifyAllSignatures(wire.decodeTransaction(submits[0].body.transaction)),true);assert.equal(f.requests.filter(r=>r.body?.action==='prepare').length,1);}finally{f.restore();}}
 });
 test('versioned rehearsal has no mint signature and never submits',async()=>{const f=mount({versioned:true,rehearsal:true});try{await f.settle();await f.click('Review Launch');await f.click('Check Wallet Approval · No Broadcast');assert.equal(f.walletInputs[0].mintSigned,false);assert.match(text(f.tree),/Wallet signature verified locally/);assert.equal(f.requests.filter(r=>r.body?.action==='submit').length,0);}finally{f.restore();}});

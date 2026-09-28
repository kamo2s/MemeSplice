const {test}=require('node:test'),assert=require('node:assert/strict'),{join}=require('node:path'),{readFileSync}=require('node:fs');
const Module=require('node:module'),original=Module._load;Module._load=function(name,...args){if(name==='server-only')return {};return original.call(this,name,...args);};
const load=name=>require(join(process.env.SPLICE_PUMP_BUILD,'lib/launch',name+'.js'));
const {Keypair,PublicKey,ComputeBudgetProgram}=require('@solana/web3.js');const {PUMP_SDK,PUMP_PROGRAM_ID}=require('@pump-fun/pump-sdk');const {TOKEN_2022_PROGRAM_ID}=require('@solana/spl-token');
const validation=load('validation'),pump=load('pump'),{PinataStorage}=load('storage'),{launchConfig,verifyCluster}=load('config');
const wallet=Keypair.generate(),mint=Keypair.generate(),identity={name:'Moon Pup',symbol:'MPUP',description:'A curious pup in a knitted hat.'};
const input={wallet:wallet.publicKey.toBase58(),mint:mint.publicKey.toBase58(),identity,uri:'ipfs://bafyTestMetadata',blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100};
test('validation requires a signing wallet and enforces name/symbol/URI limits',()=>{
 for(const value of ['', 'bad',PublicKey.default.toBase58()])assert.equal(validation.walletAddress.safeParse(value).success,false);
 assert.equal(validation.walletAddress.safeParse(input.wallet).success,true);
 assert.equal(validation.identitySchema.safeParse({...identity,name:'a'.repeat(32),symbol:'b'.repeat(13)}).success,true);
 for(const value of [{...identity,name:'a'.repeat(33)},{...identity,symbol:'b'.repeat(14)},{...identity,name:'🐶'.repeat(10)}])assert.equal(validation.identitySchema.safeParse(value).success,false);
 assert.equal(validation.metadataUri.safeParse('ipfs://'+'a'.repeat(193)).success,true);assert.equal(validation.metadataUri.safeParse('ipfs://'+'a'.repeat(194)).success,false);
});
test('official SDK creates only compute limit/price + create_v2 with user creator/payer, Token2022, SOL, all optional modes false',async()=>{
 const tx=await pump.createPumpTransaction(input);assert.ok(tx.feePayer.equals(wallet.publicKey));assert.equal(tx.instructions.length,3);assert.ok(tx.instructions[0].programId.equals(ComputeBudgetProgram.programId));const ix=tx.instructions[2];assert.ok(ix.programId.equals(PUMP_PROGRAM_ID));
 const decoded=PUMP_SDK.offlinePumpProgram.coder.instruction.decode(ix.data);assert.equal(decoded.name,'createV2');assert.equal(decoded.data.name,identity.name);assert.equal(decoded.data.symbol,identity.symbol);assert.equal(decoded.data.uri,input.uri);assert.ok(decoded.data.creator.equals(wallet.publicKey));assert.equal(decoded.data.isMayhemMode,false);
 assert.ok(ix.keys.some(k=>k.pubkey.equals(mint.publicKey)&&k.isSigner));assert.ok(ix.keys.some(k=>k.pubkey.equals(wallet.publicKey)&&k.isSigner));assert.ok(ix.keys.some(k=>k.pubkey.equals(TOKEN_2022_PROGRAM_ID)));
 assert.equal(decoded.data.isCashbackEnabled[0],false);assert.equal(decoded.data.isHolderReward[0],false);assert.equal(decoded.data.creatorFeeBps[0].toNumber(),0);
 const expected=await PUMP_SDK.createV2Instruction({mint:mint.publicKey,user:wallet.publicKey,creator:wallet.publicKey,name:identity.name,symbol:identity.symbol,uri:input.uri,mayhemMode:false,holderReward:false,cashback:false});assert.deepEqual(ix.keys,expected.keys);
});
test('both mint and wallet signatures are required; changed transaction message is rejected',async()=>{
 const tx=await pump.createPumpTransaction(input),message=tx.serializeMessage().toString('base64');tx.partialSign(mint);assert.throws(()=>pump.validateSignedTransaction(tx.serialize({requireAllSignatures:false}).toString('base64'),message));tx.partialSign(wallet);const valid=pump.validateSignedTransaction(tx.serialize().toString('base64'),message);assert.ok(validation.signature.safeParse(valid.signature).success);assert.throws(()=>pump.validateSignedTransaction(tx.serialize().toString('base64'),message+'a'));
});
test('metadata preserves identity/image and recovers/reuses pinned CIDs without a second upload',async()=>{
 const image='ipfs://bafyImage',metadata=validation.tokenMetadata(identity,image,'https://example.com','');assert.deepEqual(metadata,{...identity,image,showName:true,createdOn:'https://pump.fun',website:'https://example.com',twitter:''});
 let uploaded=0,started=0,name='',saved=false;
 const storage=new PinataStorage('test-server-only',async(url,init)=>{assert.equal(init.headers.Authorization,'Bearer test-server-only');if(url.includes('/public?'))return new Response(JSON.stringify({data:{files:saved?[{name,cid:'bafyImage'}]:[]}}));uploaded++;assert.equal(started,1);name=init.body.get('name');assert.equal(init.body.get('network'),'public');saved=true;return new Response(JSON.stringify({data:{cid:'bafyImage'}}));});
 const bytes=new Uint8Array([1,2,3]);assert.equal(await storage.pin(bytes,'image/webp','child',false,async()=>{started++;}),image);assert.equal(await storage.pin(bytes,'image/webp','child',true,async()=>{started++;}),image);assert.equal(uploaded,1);
 const uncertain=new PinataStorage('test',async()=>new Response(JSON.stringify({data:{files:[]}})));await assert.rejects(uncertain.pin(bytes,'image/webp','child',true,async()=>{}),e=>e.code==='METADATA_UNCERTAIN');
});
test('simulation is read-only and maps unfunded wallets to a clean error',async()=>{
 const tx=await pump.createPumpTransaction(input);let sends=0;const connection={simulateTransaction:async()=>({value:{err:'AccountNotFound',logs:[]}}),sendRawTransaction:()=>sends++};await assert.rejects(pump.simulateLaunch(connection,tx),e=>e.code==='INSUFFICIENT_SOL');assert.equal(sends,0);
});
test('verification rejects missing/failed/mismatched finalized transactions and wrong token ownership',async()=>{
 const tx=await pump.createPumpTransaction(input);tx.sign(wallet,mint);const signed=pump.validateSignedTransaction(tx.serialize().toString('base64'),tx.serializeMessage().toString('base64'));const row={mint_address:input.mint,creator_wallet:input.wallet,transaction_signature:signed.signature,message_base64:tx.serializeMessage().toString('base64')};
 for(const transaction of [null,{meta:{err:'failed'}},{meta:{err:null},transaction:{signatures:['wrong'],message:tx.compileMessage()}}])assert.equal(await pump.verifyPumpLaunch({getTransaction:async()=>transaction},row),false);
 assert.equal(await pump.verifyPumpLaunch({getTransaction:async()=>({meta:{err:null},transaction:{signatures:[signed.signature],message:tx.compileMessage()}}),getMultipleAccountsInfo:async()=>[{owner:PublicKey.default},null]},row),false);
});
test('mainnet default is disabled and RPC must match the configured network',async()=>{
 const before={...process.env};try{delete process.env.PUMP_LAUNCH_ENABLED;delete process.env.PUMP_MAINNET_LAUNCH_ENABLED;delete process.env.SOLANA_RPC_URL;process.env.SOLANA_NETWORK='mainnet-beta';assert.equal(launchConfig().enabled,false);process.env.PUMP_LAUNCH_ENABLED='true';assert.equal(launchConfig().enabled,false);await assert.rejects(verifyCluster({getGenesisHash:async()=> 'wrong'},'mainnet-beta'));}finally{process.env=before;}
});

test('finalized verification accepts the correct mint/curve and rejects wrong creator or launch modes',async()=>{
 const {MintLayout}=require('@solana/spl-token'),{BN}=require('@coral-xyz/anchor');
 const tx=await pump.createPumpTransaction(input);tx.sign(wallet,mint);const signed=pump.validateSignedTransaction(tx.serialize().toString('base64'),tx.serializeMessage().toString('base64'));
 const row={mint_address:input.mint,creator_wallet:input.wallet,transaction_signature:signed.signature,message_base64:tx.serializeMessage().toString('base64')};
 const mintData=Buffer.alloc(MintLayout.span);MintLayout.encode({mintAuthorityOption:0,mintAuthority:PublicKey.default,supply:1000n,decimals:6,isInitialized:true,freezeAuthorityOption:0,freezeAuthority:PublicKey.default},mintData);
 const curve={virtualTokenReserves:new BN(0),virtualQuoteReserves:new BN(0),realTokenReserves:new BN(0),realQuoteReserves:new BN(0),tokenTotalSupply:new BN(1000),complete:false,creator:wallet.publicKey,isMayhemMode:false,isCashbackCoin:false,quoteMint:PublicKey.default,creatorFeeBps:new BN(0),canEditCreatorFee:false,isHolderReward:false};
 const verify=async changes=>{const curveData=await PUMP_SDK.offlinePumpProgram.coder.accounts.encode('bondingCurve',{...curve,...changes});return pump.verifyPumpLaunch({getTransaction:async()=>({meta:{err:null},transaction:{signatures:[signed.signature],message:tx.compileMessage()}}),getMultipleAccountsInfo:async()=>[{owner:TOKEN_2022_PROGRAM_ID,data:mintData},{owner:PUMP_PROGRAM_ID,data:curveData}]},row);};
 assert.equal(await verify({}),true);for(const changes of [{creator:mint.publicKey},{isMayhemMode:true},{isCashbackCoin:true},{isHolderReward:true},{quoteMint:mint.publicKey}])assert.equal(await verify(changes),false);
});
test('browser launch sources contain no server credentials or persisted private material',()=>{
 for(const file of ['components/memesplice/launch-dialog.tsx','components/memesplice/wallet-provider.tsx','components/memesplice/wallet-dialog.tsx']){const source=readFileSync(file,'utf8');assert.doesNotMatch(source,/PINATA_JWT|SUPABASE_SECRET_KEY|SOLANA_RPC_URL|localStorage\.setItem|sessionStorage\.setItem/);}
 const route=readFileSync('app/api/launch/route.ts','utf8');assert.match(route,/requireSameOrigin\(request\)/);assert.doesNotMatch(route,/action:z.literal\('verify'\)/);
});

test('submission persists signature before send, resumes timeouts without resending, and verifies only server-side',async()=>{
 const db=require(join(process.env.SPLICE_PUMP_BUILD,'lib/server/supabase.js')),config=load('config'),server=load('server');
 const saved={database:db.database,rpc:db.rpc,connection:config.launchConnection,config:config.launchConfig,verifyCluster:config.verifyCluster,verify:pump.verifyPumpLaunch};
 const tx=await pump.createPumpTransaction(input);tx.sign(wallet,mint);
 let row={id:'launch',session_id:'owner',status:'AWAITING_SIGNATURE',network:'devnet',mint_address:input.mint,creator_wallet:input.wallet,last_valid_block_height:100,message_base64:tx.serializeMessage().toString('base64'),transaction_signature:null},sends=0,verifications=0,chainStatus=null,valid=false,height=90,mintExists=false;
 db.database=async(path,init={})=>{if(init.method==='PATCH'){assert.ok(path.includes('status=eq.'+row.status));row={...row,...JSON.parse(init.body)};}return [{...row}];};
 db.rpc=async(name)=>{assert.equal(name,'splice_verify_launch');assert.ok(valid);verifications++;row={...row,status:'VERIFIED'};return row;};
 config.launchConfig=()=>({enabled:true,network:'devnet'});config.verifyCluster=async()=>{};
 config.launchConnection=()=>({getBlockHeight:async()=>height,getSignatureStatuses:async()=>({value:[chainStatus]}),getAccountInfo:async()=>mintExists?{}:null,sendRawTransaction:async(bytes,options)=>{sends++;assert.equal(options.maxRetries,40);assert.equal(options.skipPreflight,false);assert.deepEqual(Buffer.from(bytes),tx.serialize());assert.equal(row.status,'SUBMITTED');assert.ok(row.transaction_signature);throw Error('RPC timed out');}});
 pump.verifyPumpLaunch=async()=>valid;
 try{
  const submitted=await server.submitLaunch('owner','launch',tx.serialize().toString('base64'));assert.equal(submitted.status,'SUBMITTED');assert.equal(submitted.errorCode,'RPC_UNCERTAIN');assert.equal(sends,1);assert.equal(verifications,0);
  await server.submitLaunch('owner','launch',tx.serialize().toString('base64'));assert.equal(sends,1);
  chainStatus={confirmationStatus:'finalized',err:null};await server.reconcile(row);assert.equal(row.status,'CONFIRMED');assert.equal(verifications,0);
  valid=true;await server.reconcile(row);assert.equal(row.status,'VERIFIED');assert.equal(verifications,1);
  row={...row,status:'SUBMITTED'};chainStatus=null;height=101;mintExists=true;await server.reconcile(row);assert.equal(row.status,'SUBMITTED');
  mintExists=false;await server.reconcile(row);assert.equal(row.status,'FAILED');assert.equal(row.error_code,'EXPIRED');assert.equal(sends,1);
 }finally{db.database=saved.database;db.rpc=saved.rpc;config.launchConnection=saved.connection;config.launchConfig=saved.config;config.verifyCluster=saved.verifyCluster;pump.verifyPumpLaunch=saved.verify;}
});

const {BN}=require('@coral-xyz/anchor');
const settingsModule=load('settings'),wire=load('transaction');

test('launch review retains the latest failed attempt after refresh without preparing or sending',async()=>{
 const db=require(join(process.env.SPLICE_PUMP_BUILD,'lib/server/supabase.js')),config=load('config'),server=load('server');
 const saved={database:db.database,connection:config.launchConnection,config:config.launchConfig};
 const failure={id:'failed',status:'FAILED',error_code:'EXPIRED'};const reads=[];
 db.database=async(route,init={})=>{assert.equal(init.method,undefined);reads.push(route);if(route.startsWith('offspring?'))return [{id:'child',generation_job_id:'job',result:{name:'Child',image:{atlas:'offspring',index:0},parents:[{image:{atlas:'parents',index:0}},{image:{atlas:'parents',index:1}}]}}];if(route.startsWith('generation_jobs?'))return [{id:'job'}];if(route.includes('status=eq.FAILED'))return [failure];return [];};
 config.launchConfig=()=>({enabled:true,network:'mainnet-beta'});config.launchConnection=()=>{throw Error('offline');};
 try{const first=await server.reviewLaunch('owner','child'),second=await server.reviewLaunch('owner','child');assert.equal(first.launch.status,'FAILED');assert.equal(second.launch.errorCode,'EXPIRED');assert.ok(reads.some(r=>r.includes('status=eq.FAILED&order=created_at.desc&limit=1')));}finally{db.database=saved.database;config.launchConfig=saved.config;config.launchConnection=saved.connection;}
});
const fees={lpFeeBps:new BN(0),protocolFeeBps:new BN(100),creatorFeeBps:new BN(30)};
const globalFixture={initialVirtualTokenReserves:new BN('1073000000000000'),initialVirtualSolReserves:new BN('30000000000'),initialRealTokenReserves:new BN('793100000000000'),tokenTotalSupply:new BN('1000000000000000'),feeBasisPoints:new BN(100),creatorFeeBasisPoints:new BN(30),feeRecipient:wallet.publicKey,feeRecipients:[wallet.publicKey],reservedFeeRecipient:wallet.publicKey,reservedFeeRecipients:[wallet.publicKey],isHolderRewardEnabled:true,mayhemModeEnabled:true,createV2Enabled:true,creatorFeeConfigurable:false};
const feeConfig={flatFees:fees,feeTiers:[{marketCapLamportsThreshold:new BN(0),fees}],stableFeeTiers:[],exoticFlatFees:fees};
test('A–E official SDK matrix preserves SOL, Token2022, flags, atomic buy, exact 1% cap and holder vault',async()=>{
 const {NATIVE_MINT}=require('@solana/spl-token'),{holderRewardsPda,creatorVaultPda}=require('@pump-fun/pump-sdk');
 for(const [buy,holderReward,mayhemMode] of [[0,false,false],[100000000,false,false],[0,true,false],[0,false,true],[100000000,true,false]]){
  const settings={...settingsModule.DEFAULT_LAUNCH_SETTINGS,initialBuyLamports:buy,holderReward,holderRewardAcknowledged:holderReward,mayhemMode};
  const tx=await pump.createPumpTransaction({...input,settings,global:globalFixture,feeConfig});
  const ixs=tx.instructions.filter(i=>i.programId.equals(PUMP_PROGRAM_ID)),create=PUMP_SDK.offlinePumpProgram.coder.instruction.decode(ixs[0].data);
  assert.equal(create.data.isHolderReward[0],holderReward);assert.equal(create.data.isMayhemMode,mayhemMode);assert.equal(create.data.isCashbackEnabled[0],false);assert.equal(create.data.creatorFeeBps[0].toString(),'0');assert.ok(create.data.creator.equals(wallet.publicKey));assert.equal(ixs.length,buy?2:1);assert.equal(tx.instructions.length,buy?5:3);
  if(buy){const decoded=PUMP_SDK.offlinePumpProgram.coder.instruction.decode(ixs[1].data);assert.equal(decoded.name,'buyV2');assert.equal(decoded.data.maxSolCost.toNumber(),101000000);assert.ok(decoded.data.amount.gtn(0));assert.ok(ixs[1].keys.some(k=>k.pubkey.equals(NATIVE_MINT)));assert.ok(ixs[1].keys.some(k=>k.pubkey.equals(creatorVaultPda(holderReward?holderRewardsPda(mint.publicKey):wallet.publicKey))));}
 }
});
test('amount validation rejects invalid precision/range, unpaid modes and missing reward acknowledgment',()=>{
 for(const text of ['', '-1','NaN','Infinity','1e-3','0','0.000999999','10.000000001','0.1234567891'])assert.throws(()=>settingsModule.parseBuySol(text));
 assert.equal(settingsModule.parseBuySol('0.001'),1000000);assert.equal(settingsModule.parseBuySol('10'),10000000000);assert.equal(settingsModule.maximumBuyLamports(100000001),101000001);
 for(const change of [{holderReward:true},{cashback:true},{quoteAsset:'USDC'},{initialBuyLamports:1.5},{initialBuyLamports:10000000001}])assert.equal(settingsModule.launchSettingsSchema.safeParse({...settingsModule.DEFAULT_LAUNCH_SETTINGS,...change}).success,false);
});
test('live global gates reject disabled optional modes before transaction preparation',async()=>{
 for(const change of [{holderReward:true,holderRewardAcknowledged:true},{mayhemMode:true}])await assert.rejects(pump.createPumpTransaction({...input,settings:{...settingsModule.DEFAULT_LAUNCH_SETTINGS,...change},global:{...globalFixture,mayhemModeEnabled:false,isHolderRewardEnabled:false}}),e=>e.code==='OPTION_UNAVAILABLE');
});
test('versioned message binds both signers; wallet-only rehearsal cannot broadcast, mint buffer wipes in place',async()=>{
 const {TransactionMessage,VersionedTransaction,AddressLookupTableAccount}=require('@solana/web3.js');
 const transient=wire.createTransientMint(),secret=transient.secretKey;
 const tx=await pump.createPumpTransaction({...input,mint:transient.publicKey.toBase58(),settings:{...settingsModule.DEFAULT_LAUNCH_SETTINGS,initialBuyLamports:100000000},global:globalFixture,feeConfig});
 const addresses=[...new Map(tx.instructions.flatMap(i=>i.keys.filter(k=>!k.isSigner).map(k=>[k.pubkey.toBase58(),k.pubkey]))).values()];
 const table=new AddressLookupTableAccount({key:Keypair.generate().publicKey,state:{deactivationSlot:BigInt('18446744073709551615'),lastExtendedSlot:0,lastExtendedSlotStartIndex:0,addresses}});
 const v=new VersionedTransaction(new TransactionMessage({payerKey:wallet.publicKey,recentBlockhash:input.blockhash,instructions:tx.instructions}).compileToV0Message([table]));
 assert.ok(v.serialize().length<=1232);v.sign([wallet]);assert.ok(wire.verifyWalletSignature(v,input.wallet));assert.equal(wire.verifyAllSignatures(v),false);assert.throws(()=>pump.validateSignedTransaction(wire.transactionWire(v).toString('base64'),wire.transactionMessage(v).toString('base64')));
 wire.signMint(v,transient);secret.fill(0);assert.ok(transient.secretKey.every(b=>b===0));assert.ok(wire.verifyAllSignatures(v));const signed=pump.validateSignedTransaction(wire.transactionWire(v).toString('base64'),wire.transactionMessage(v).toString('base64'));assert.ok(signed.signature);v.message.recentBlockhash=Keypair.generate().publicKey.toBase58();assert.equal(wire.verifyAllSignatures(v),false);
});
test('cost estimates use atomic simulation balances, reserve fees and slippage; insufficient balance blocks',async()=>{
 const tx=await pump.createPumpTransaction(input),settings={...settingsModule.DEFAULT_LAUNCH_SETTINGS,initialBuyLamports:100000000};
 let balance=1000000000;const c={simulateTransaction:async()=>({context:{slot:1},value:{err:null,preBalances:[1000000000],postBalances:[894990000],unitsConsumed:123456}}),getFeeForMessage:async()=>({value:10000}),getBalance:async()=>balance};
 const e=await pump.simulateLaunch(c,tx,settings);assert.equal(e.accountCostLamports,5000000);assert.equal(e.estimatedWalletCostLamports,105010000);assert.equal(e.maxWalletCostLamports,107010000);balance=106000000;await assert.rejects(pump.simulateLaunch(c,tx,settings),e=>e.code==='INSUFFICIENT_SOL');
});

test('disabled public launch gate rejects preparation and submission before any chain call',async()=>{
 const db=require(join(process.env.SPLICE_PUMP_BUILD,'lib/server/supabase.js')),config=load('config'),server=load('server'),saved={database:db.database,config:config.launchConfig,connection:config.launchConnection};let chainCalls=0;
 db.database=async()=>[{id:'row',network:'mainnet-beta',status:'AWAITING_SIGNATURE'}];config.launchConfig=()=>({enabled:false,pinata:true,network:'mainnet-beta'});config.launchConnection=()=>{chainCalls++;throw Error('Forbidden');};
 try{await assert.rejects(server.prepareLaunch('owner',{offspringId:'id',...input}),e=>e.code==='NOT_READY');await assert.rejects(server.submitLaunch('owner','row','anything'),e=>e.code==='NOT_READY');assert.equal(chainCalls,0);}finally{db.database=saved.database;config.launchConfig=saved.config;config.launchConnection=saved.connection;}
});
test('explicit zero priority fee prevents an unsigned wallet fee enhancement without changing the cost cap',async()=>{
 const {ComputeBudgetInstruction}=require('@solana/web3.js');const tx=await pump.createPumpTransaction(input);
 const prices=tx.instructions.filter(ix=>ix.programId.equals(ComputeBudgetProgram.programId)&&ComputeBudgetInstruction.decodeInstructionType(ix)==='SetComputeUnitPrice');assert.equal(prices.length,1);assert.equal(ComputeBudgetInstruction.decodeSetComputeUnitPrice(prices[0]).microLamports,BigInt(0));
 const before=wire.transactionMessage(tx);tx.partialSign(wallet);assert.ok(wire.transactionMessage(tx).equals(before));assert.ok(wire.verifyWalletSignature(tx,input.wallet));assert.equal(wire.verifyAllSignatures(tx),false);
});

test('priority quote uses integer ceiling and rejects fees above the total SOL cap',()=>{
 const {boundedPriorityFee}=load('priority-fee');
 assert.deepEqual(boundedPriorityFee(950000,500000),{microLamports:950000,lamports:475000});
 assert.deepEqual(boundedPriorityFee(0,300000),{microLamports:10000,lamports:3000});
 assert.equal(boundedPriorityFee(12345,300000).lamports,3704);
 assert.equal(boundedPriorityFee(2000000,500000).lamports,1000000);
 assert.throws(()=>boundedPriorityFee(2000001,500000),e=>e.code==='FEE_CAP');
 for(const n of [NaN,Infinity,-1])assert.throws(()=>boundedPriorityFee(n,500000),e=>e.code==='FEE_UNAVAILABLE');
});

test('Helius fee quoting is unsigned/read-only and refuses malformed or unavailable estimates',async()=>{
 const {quotePriorityFee}=load('priority-fee'),tx=await pump.createPumpTransaction(input);let calls=0;
 const connection={rpcEndpoint:'https://mainnet.helius-rpc.com/?api-key=test-only'};
 const quote=await quotePriorityFee(connection,tx,tx,async(url,init)=>{calls++;const body=JSON.parse(init.body);assert.equal(body.method,'getPriorityFeeEstimate');assert.equal(body.params[0].options.transactionEncoding,'base64');assert.equal(body.params[0].options.recommended,true);assert.equal(wire.verifyAllSignatures(wire.decodeTransaction(body.params[0].transaction)),false);return Response.json({result:{priorityFeeEstimate:950000}});});
 assert.equal(calls,1);assert.equal(quote.lamports,285000);
 for(const body of [{result:{}},{error:{code:-1}},{result:{priorityFeeEstimate:Infinity}}])await assert.rejects(quotePriorityFee(connection,tx,tx,async()=>Response.json(body)),e=>e.code==='FEE_UNAVAILABLE');
 await assert.rejects(quotePriorityFee(connection,tx,tx,async()=>{throw Error('private-url');}),e=>e.code==='FEE_UNAVAILABLE'&&!e.message.includes('private-url'));
});

test('production preparation quotes before refreshing blockhash and simulates the final priced message',async()=>{
 const server=load('server'),fees=load('priority-fee'),saved={quote:fees.quotePriorityFee,simulate:pump.simulateLaunch};let blocks=0;
 const hashes=[Keypair.generate().publicKey.toBase58(),Keypair.generate().publicKey.toBase58()];
 const connection={getLatestBlockhash:async()=>({blockhash:hashes[blocks++],lastValidBlockHeight:100+blocks})};
 fees.quotePriorityFee=async(c,tx)=>{assert.equal(tx.recentBlockhash,hashes[0]);return {microLamports:12345,lamports:3704};};
 pump.simulateLaunch=async(c,tx)=>{assert.equal(tx.recentBlockhash,hashes[1]);const {ComputeBudgetInstruction}=require('@solana/web3.js');assert.equal(ComputeBudgetInstruction.decodeSetComputeUnitPrice(tx.instructions[1]).microLamports,12345n);return {networkFeeLamports:13704,estimatedWalletCostLamports:5013704};};
 try{const result=await server.buildPricedLaunch(connection,input);assert.equal(blocks,2);assert.equal(result.estimate.priorityFeeLamports,3704);assert.equal(result.estimate.networkFeeLamports,13704);assert.equal(wire.verifyAllSignatures(result.tx),false);}finally{fees.quotePriorityFee=saved.quote;pump.simulateLaunch=saved.simulate;}
});

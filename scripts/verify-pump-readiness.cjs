// Real saved offspring + existing Pinata pins + official transaction builder.
// Network guard permits read-only RPC methods and forbids uploads and broadcasts.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict');
const {Connection,Keypair}=require('@solana/web3.js');
const {PUMP_SDK,GLOBAL_PDA}=require('@pump-fun/pump-sdk');
process.loadEnvFile('.env.local');
const [journalPath,reportPath]=process.argv.slice(2);
if(!journalPath||!reportPath||!path.isAbsolute(journalPath)||!path.isAbsolute(reportPath))throw Error('Provide absolute journal and report paths.');
const modules=new Map();function load(file){if(modules.has(file))return modules.get(file).exports;const m=new Module(file,module);m.filename=file;m.paths=module.paths;modules.set(file,m);m.require=name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):require(name);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return m.exports;}
async function run(){
 assert.notEqual(process.env.PUMP_LAUNCH_ENABLED,'true');assert.notEqual(process.env.PUMP_MAINNET_LAUNCH_ENABLED,'true');
 const journal=JSON.parse(fs.readFileSync(journalPath,'utf8')),base=process.env.SUPABASE_URL.replace(/\/$/,''),headers={apikey:process.env.SUPABASE_SECRET_KEY};
 async function read(route){const r=await fetch(base+'/rest/v1/'+route,{headers,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('DATABASE_READ');return r.json();}
 const child=(await read('offspring?id=eq.'+journal.offspringId+'&select=id,generation_job_id,image_storage_path,result'))[0];assert.ok(child);
 const job=(await read('generation_jobs?id=eq.'+child.generation_job_id+'&select=status,session_id'))[0];assert.equal(job.status,'COMPLETE');assert.match(job.session_id,/^[a-f0-9-]{36}$/);
 const before=await read('offspring_launches?select=id,status');
 const {identitySchema,metadataUri,tokenMetadata}=load(path.resolve('lib/launch/validation.ts'));
 const {PinataStorage}=load(path.resolve('lib/launch/storage.ts'));
 const {createPumpTransaction,checkPumpProgram,simulateLaunch}=load(path.resolve('lib/launch/pump.ts'));
 const identity=identitySchema.parse({name:child.result.name,symbol:child.result.ticker,description:child.result.lore||child.result.tagline});assert.deepEqual(identity,journal.identity);
 const image=await fetch(base+'/storage/v1/object/offspring/'+child.image_storage_path.split('/').map(encodeURIComponent).join('/'),{headers,signal:AbortSignal.timeout(20000)});assert.ok(image.ok);const bytes=new Uint8Array(await image.arrayBuffer());
 let pinataReads=0;const storage=new PinataStorage(process.env.PINATA_JWT,async(url,init)=>{assert.equal(init.method??'GET','GET','Uploads are forbidden during this audit');pinataReads++;return fetch(url,init);});
 const noUpload=async()=>{throw Error('EXISTING_PIN_NOT_FOUND');};
 const imageUri=await storage.pin(bytes,'image/webp',child.id+'-image',true,noUpload);assert.equal(imageUri,journal.imageUri);
 const metadata=tokenMetadata(identity,imageUri,process.env.TOKEN_WEBSITE_URL||'',process.env.TOKEN_TWITTER_URL||'');assert.deepEqual(metadata,journal.metadata);
 const uri=await storage.pin(new TextEncoder().encode(JSON.stringify(metadata)),'application/json',child.id+'-metadata',true,noUpload);assert.equal(uri,journal.metadataUri);metadataUri.parse(uri);
 const allowed=new Set(['getGenesisHash','getMultipleAccounts','getBalance','getLatestBlockhash','simulateTransaction','getFeeForMessage']);const methods=[];
 const connection=new Connection('https://api.devnet.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:async(url,init)=>{const request=JSON.parse(init.body);assert.ok(allowed.has(request.method),'Broadcast/write RPC forbidden');methods.push(request.method);return fetch(url,{...init,signal:AbortSignal.timeout(20000)});}});
 assert.equal(await connection.getGenesisHash(),'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');await checkPumpProgram(connection);
 const mint=Keypair.generate(),testWallet=Keypair.generate(),block=await connection.getLatestBlockhash();
 const transaction=await createPumpTransaction({wallet:testWallet.publicKey.toBase58(),mint:mint.publicKey.toBase58(),identity,uri,...block});
 transaction.partialSign(mint);assert.equal(transaction.verifySignatures(),false,'Wallet approval must still be required');
 assert.ok(transaction.feePayer.equals(testWallet.publicKey));const decoded=PUMP_SDK.offlinePumpProgram.coder.instruction.decode(transaction.instructions.find(ix=>ix.programId.equals(require('@pump-fun/pump-sdk').PUMP_PROGRAM_ID)).data);
 assert.equal(decoded.name,'createV2');assert.equal(decoded.data.name,identity.name);assert.equal(decoded.data.symbol,identity.symbol);assert.equal(decoded.data.uri,uri);assert.ok(decoded.data.creator.equals(testWallet.publicKey));assert.equal(decoded.data.isMayhemMode,false);assert.equal(decoded.data.isHolderReward[0],false);assert.equal(decoded.data.isCashbackEnabled[0],false);assert.equal(transaction.instructions.length,3);
 // A public funded devnet account is a simulation fixture only, never signed for.
 const global=(await connection.getMultipleAccountsInfo([GLOBAL_PDA]))[0],fixture=PUMP_SDK.decodeGlobal(global).feeRecipient;assert.ok(await connection.getBalance(fixture)>100000000);
 const simulated=await createPumpTransaction({wallet:fixture.toBase58(),mint:mint.publicKey.toBase58(),identity,uri,...await connection.getLatestBlockhash()});const estimate=await simulateLaunch(connection,simulated);
 const after=await read('offspring_launches?select=id,status');assert.deepEqual(after,before);
 const report={offspring:identity.name,ticker:identity.symbol,completedOwnedRecordLoaded:true,imageUri,metadataUri:uri,existingPinsRecoveredThroughAdapter:true,pinataReadRequests:pinataReads,newUploads:0,officialSDK:'@pump-fun/pump-sdk 2.0.0',transactionConstructed:true,freshMintKeypair:true,mintSignatureAppliedInMemory:true,walletSignatureStillRequired:true,creatorEqualsPayer:true,quoteAsset:'SOL',mayhemMode:false,holderReward:false,cashback:false,initialBuy:false,simulation:{network:'devnet',success:true,computeUnits:estimate.computeUnits,networkFeeLamports:estimate.networkFeeLamports,publicFundedFixture:true,signatureVerification:false},rpcMethods:[...new Set(methods)],launchRecordsUnchanged:true,pumpLaunchEnabled:false,pumpMainnetLaunchEnabled:false,broadcasts:0,mintSecretPersisted:false,actualWalletExtensionApprovalTested:false};
 fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
run().catch(()=>{console.log('Readiness audit failed safely. No uploads or broadcasts are permitted by this script.');process.exitCode=1;});


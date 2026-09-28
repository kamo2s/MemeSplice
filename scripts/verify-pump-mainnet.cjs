// Read-only mainnet audit. No wallet/mint private material or RPC URLs are logged.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict');
const {Connection,Keypair,PublicKey}=require('@solana/web3.js');
const {PUMP_SDK}=require('@pump-fun/pump-sdk');
process.loadEnvFile('.env.local');
const [journalPath,reportPath]=process.argv.slice(2);
if(!journalPath||!reportPath||!path.isAbsolute(journalPath)||!path.isAbsolute(reportPath))throw Error('Absolute input/output paths required');
const modules=new Map();function load(file){if(modules.has(file))return modules.get(file).exports;const m=new Module(file,module);m.filename=file;m.paths=module.paths;modules.set(file,m);m.require=name=>name==='server-only'?{}:name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):require(name);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return m.exports;}
let stage='configuration';
async function run(){
 assert.equal(process.env.SOLANA_NETWORK,'mainnet-beta');assert.ok(process.env.SOLANA_RPC_URL?.startsWith('https://'));assert.notEqual(process.env.PUMP_LAUNCH_ENABLED,'true');assert.notEqual(process.env.PUMP_MAINNET_LAUNCH_ENABLED,'true');
 const {createPumpTransaction,compileLaunchTransaction,pumpContext,simulateLaunch}=load(path.resolve('lib/launch/pump.ts')),{DEFAULT_LAUNCH_SETTINGS}=load(path.resolve('lib/launch/settings.ts')),{transactionWire}=load(path.resolve('lib/launch/transaction.ts'));
 const allowed=new Set(['getGenesisHash','getAccountInfo','getMultipleAccounts','getBalance','getLatestBlockhash','simulateTransaction','getFeeForMessage','getSignaturesForAddress','getTransaction']);const methods=[];
 const connection=new Connection(process.env.SOLANA_RPC_URL,{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:async(url,init)=>{const request=JSON.parse(init.body);assert.ok(allowed.has(request.method),'WRITE_RPC_FORBIDDEN');methods.push(request.method);return fetch(url,{...init,signal:AbortSignal.timeout(20000)});}});
 stage='genesis';assert.equal(await connection.getGenesisHash(),'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d');stage='pump-context';const context=await pumpContext(connection);
 const journal=JSON.parse(fs.readFileSync(journalPath,'utf8'));
 // Public funded protocol account: simulation fixture, never signed for or sent.
 stage='fixture';const candidates=Object.values(context.global).flat().filter(k=>k instanceof PublicKey).filter(k=>PublicKey.isOnCurve(k.toBytes()));
 const accounts=await connection.getMultipleAccountsInfo(candidates);let fixture=candidates.find((k,i)=>accounts[i]?.owner.equals(PublicKey.default)&&accounts[i].lamports>200000000);
 if(!fixture){const recent=await connection.getSignaturesForAddress(require('@pump-fun/pump-sdk').PUMP_PROGRAM_ID,{limit:24},'finalized');for(const item of recent.filter(i=>!i.err)){try{const tx=await connection.getTransaction(item.signature,{commitment:'finalized',maxSupportedTransactionVersion:0});const payer=tx?.transaction.message.staticAccountKeys[0];if(payer&&PublicKey.isOnCurve(payer.toBytes())&&await connection.getBalance(payer)>200000000){fixture=payer;break;}}catch{/* A newer transaction version is not a usable fixture. */}}}assert.ok(fixture);
 const results=[];
 for(const [name,buy,rewards,mayhem] of [['A',0,false,false],['B',100000000,false,false],['C',0,true,false],['D',0,false,true],['E',100000000,true,false]]){
  const key=Keypair.generate(),mint=key.publicKey.toBase58();key.secretKey.fill(0);
  const settings={...DEFAULT_LAUNCH_SETTINGS,initialBuyLamports:buy,holderReward:rewards,holderRewardAcknowledged:rewards,mayhemMode:mayhem};
  // Construct all requested variants against a controlled global fixture; live gates reported separately.
  stage='construct-'+name;const tx=await createPumpTransaction({wallet:fixture.toBase58(),mint,identity:journal.identity,uri:journal.metadataUri,settings,...context,global:{...context.global,isHolderRewardEnabled:true,mayhemModeEnabled:true},...await connection.getLatestBlockhash()});
  const decoded=tx.instructions.filter(ix=>ix.programId.equals(require('@pump-fun/pump-sdk').PUMP_PROGRAM_ID)).map(ix=>PUMP_SDK.offlinePumpProgram.coder.instruction.decode(ix.data));
  const item={combination:name,initialBuyLamports:buy,holderReward:rewards,mayhemMode:mayhem,constructed:true,instructions:decoded.map(d=>d.name),liveOptionAllowed:(!rewards||context.global.isHolderRewardEnabled)&&(!mayhem||context.global.mayhemModeEnabled)};
  try{const compiled=await compileLaunchTransaction(connection,tx);item.serializedBytes=transactionWire(compiled).length;item.version=compiled.version??'legacy';item.estimate=await simulateLaunch(connection,compiled,settings);item.simulationPassed=true;}catch(e){item.simulationPassed=false;item.error=e.code||(/Transaction too large/.test(e.message)?'TRANSACTION_TOO_LARGE':'SIMULATION_UNAVAILABLE');}
  results.push(item);
 }
 const report={network:'mainnet-beta',configuredProductionRPC:true,actualUserWallet:false,publicFundedFixture:true,simulationFixturePublicKey:fixture.toBase58(),existingMetadataUri:journal.metadataUri,officialSDK:'@pump-fun/pump-sdk 2.0.0',liveFlags:{mayhemModeEnabled:context.global.mayhemModeEnabled,holderRewardEnabled:context.global.isHolderRewardEnabled},results,rpcMethods:[...new Set(methods)],broadcasts:0,pumpLaunchEnabled:false,pumpMainnetLaunchEnabled:false};
 fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
run().catch(e=>{console.log('Mainnet audit stopped safely at '+stage+' ('+(e.code||e.name)+'). No broadcast was permitted.');process.exitCode=1;});




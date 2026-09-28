// Exercise the actual local read-only wallet-check API, with a public simulation fixture.
const fs=require('node:fs'),assert=require('node:assert/strict'),{Keypair}=require('@solana/web3.js');
process.loadEnvFile('.env.local');
const [inputPath,outputPath]=process.argv.slice(2),fixture=JSON.parse(fs.readFileSync(inputPath,'utf8'));
async function run(){
 const headers={apikey:process.env.SUPABASE_SECRET_KEY};
 async function launches(){const r=await fetch(process.env.SUPABASE_URL+'/rest/v1/offspring_launches?select=id,status,initial_buy_lamports,holder_reward,mayhem_mode',{headers});assert.ok(r.ok);return r.json();}
 const before=await launches(),reviewResponse=await fetch('http://localhost:5173/api/wallet-check'),review=await reviewResponse.json();assert.equal(reviewResponse.status,200);assert.equal(review.enabled,false);assert.equal(review.network,'mainnet-beta');assert.equal(review.offspring.name,'KnitBonk');
 const results=[];
 for(const [name,buy,holder,mayhem] of [['A',0,false,false],['B',100000000,false,false],['C',0,true,false],['D',0,false,true],['E',100000000,true,false],['F',100000000,false,true],['G',0,true,true],['H',100000000,true,true]]){
  const key=Keypair.generate();const mint=key.publicKey.toBase58();
  const body={action:'preflight',offspringId:review.offspring.id,wallet:fixture.simulationFixturePublicKey,mint,identity:{name:review.offspring.name,symbol:review.offspring.ticker,description:review.offspring.lore},settings:{initialBuyLamports:buy,holderReward:holder,holderRewardAcknowledged:holder,mayhemMode:mayhem,quoteAsset:'SOL',cashback:false}};
  const response=await fetch('http://localhost:5173/api/wallet-check',{method:'POST',headers:{Origin:'http://localhost:5173','Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json();
  assert.equal(response.status,200,JSON.stringify({combination:name,status:response.status,error:data.error}));assert.equal(data.metadataUri,fixture.existingMetadataUri);assert.ok(data.imageUri.startsWith('ipfs://'));assert.ok(data.estimate.computeUnits>0);assert.ok(data.transaction);
  results.push({combination:name,status:response.status,pinsReused:true,computeUnits:data.estimate.computeUnits,estimatedWalletCostLamports:data.estimate.estimatedWalletCostLamports});
 }
 for(const action of ['prepare','submit','verify']){const r=await fetch('http://localhost:5173/api/wallet-check',{method:'POST',headers:{Origin:'http://localhost:5173','Content-Type':'application/json'},body:JSON.stringify({action})});assert.ok(r.status>=400);}
 const crossOrigin=await fetch('http://localhost:5173/api/wallet-check',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});assert.ok(crossOrigin.status>=400);
 assert.deepEqual(await launches(),before);
 const report={hostedMigration005Verified:true,network:'mainnet-beta',offspring:'KnitBonk',results,launchRecordsUnchanged:true,forbiddenActionsRejected:true,crossOriginRejected:true,noWalletOrMintSignatures:true,broadcasts:0,actualPhantomApprovalTested:false};fs.writeFileSync(outputPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
run().catch(e=>{console.log('Wallet-check API test failed: '+(e.name||'Error')+' '+String(e.message).replace(/https?:[^ ]+/g,'[redacted]'));process.exitCode=1;});


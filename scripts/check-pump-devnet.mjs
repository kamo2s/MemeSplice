// Read-only probe: no airdrop, wallet secrets, sendTransaction or mainnet calls.
import {Connection,Keypair,Transaction,VersionedTransaction,ComputeBudgetProgram} from '@solana/web3.js';
import {PUMP_SDK,PUMP_PROGRAM_ID,GLOBAL_PDA} from '@pump-fun/pump-sdk';
const rpc=new Connection('https://api.devnet.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:async(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})});
try{
 const genesis=await rpc.getGenesisHash();if(genesis!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw Error('Unexpected cluster');
 const [program,global]=await rpc.getMultipleAccountsInfo([PUMP_PROGRAM_ID,GLOBAL_PDA]);
 const enabled=global?.owner.equals(PUMP_PROGRAM_ID)?PUMP_SDK.decodeGlobal(global).createV2Enabled:false;
 console.log(JSON.stringify({network:'devnet',genesisVerified:true,programExecutable:!!program?.executable,globalExists:!!global,createV2Enabled:enabled}));
 if(!program?.executable||!enabled){console.log('Devnet creation is unavailable; no transaction was sent.');process.exitCode=0;}
 else{
  // Signature verification is disabled for simulation only. This public funded account is never signed for or used to send a transaction.
  const fixture=PUMP_SDK.decodeGlobal(global).feeRecipient;const balance=await rpc.getBalance(fixture);
  const user=balance>100000000?fixture:Keypair.generate().publicKey,mint=Keypair.generate().publicKey,block=await rpc.getLatestBlockhash();
  const ix=await PUMP_SDK.createV2Instruction({mint,user,creator:user,name:'Splice Devnet Probe',symbol:'SPTEST',uri:'ipfs://bafyReadOnlyProbe',mayhemMode:false,holderReward:false,cashback:false});
  const tx=new Transaction({feePayer:user,...block}).add(ComputeBudgetProgram.setComputeUnitLimit({units:300000}),ix);
  const result=await rpc.simulateTransaction(new VersionedTransaction(tx.compileMessage()),{sigVerify:false});
  console.log(JSON.stringify({simulationError:result.value.err,computeUnits:result.value.unitsConsumed??null,fundedReadOnlyFixture:balance>100000000,transactionsSent:0}));
 }
}catch(error){console.log(String(error.message).slice(0,300));console.log('Read-only devnet probe could not complete. No transaction was sent.');process.exitCode=1;}




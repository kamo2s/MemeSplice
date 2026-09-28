import 'server-only';
import {ComputeBudgetInstruction,ComputeBudgetProgram,type Connection,type Transaction} from '@solana/web3.js';
import {transactionWire,type LaunchTransaction} from './transaction';
import {LaunchError} from './validation';

// Product cap for the total priority charge, not a price per compute unit.
// Every selected charge is simulated and included in the pre-signature review.
export const MAX_PRIORITY_FEE_LAMPORTS=1_000_000; // 0.001 SOL
export const MIN_PRIORITY_MICRO_LAMPORTS=10_000;
export function boundedPriorityFee(estimate:number,units:number){
 if(!Number.isFinite(estimate)||estimate<0||!Number.isSafeInteger(units)||units<1||units>1_400_000)throw new LaunchError('FEE_UNAVAILABLE',503);
 const microLamports=Math.max(MIN_PRIORITY_MICRO_LAMPORTS,Math.ceil(estimate));
 if(!Number.isSafeInteger(microLamports))throw new LaunchError('FEE_UNAVAILABLE',503);
 const lamports=Number((BigInt(microLamports)*BigInt(units)+BigInt(999999))/BigInt(1000000));
 if(lamports>MAX_PRIORITY_FEE_LAMPORTS)throw new LaunchError('FEE_CAP',503);
 return {microLamports,lamports};
}
export async function quotePriorityFee(connection:Connection,tx:LaunchTransaction,legacy:Transaction,fetcher:typeof fetch=fetch){
 const limit=legacy.instructions.find(ix=>ix.programId.equals(ComputeBudgetProgram.programId)&&ComputeBudgetInstruction.decodeInstructionType(ix)==='SetComputeUnitLimit');
 if(!limit)throw new LaunchError('TRANSACTION');
 const units=ComputeBudgetInstruction.decodeSetComputeUnitLimit(limit).units;
 const endpoint=new URL(connection.rpcEndpoint);let estimate:number;
 try{
  if(/(^|\.)helius(-rpc)?\.com$/.test(endpoint.hostname)){
   const response=await fetcher(endpoint.toString(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getPriorityFeeEstimate',params:[{transaction:transactionWire(tx).toString('base64'),options:{transactionEncoding:'base64',recommended:true}}]}),signal:AbortSignal.timeout(12000),redirect:'error'});
   if(!response.ok)throw Error();
   const body=await response.json() as {result?:{priorityFeeEstimate?:number};error?:unknown};
   if(body.error||typeof body.result?.priorityFeeEstimate!=='number')throw Error();
   estimate=body.result.priorityFeeEstimate;
  }else{
   const accounts=[...new Map(legacy.instructions.flatMap(ix=>ix.keys.filter(k=>k.isWritable).map(k=>[k.pubkey.toBase58(),k.pubkey] as const))).values()].slice(0,128);
   const samples=(await connection.getRecentPrioritizationFees({lockedWritableAccounts:accounts})).map(s=>s.prioritizationFee).filter(n=>Number.isFinite(n)&&n>=0).sort((a,b)=>a-b);
   if(!samples.length)throw Error();estimate=samples[Math.floor((samples.length-1)*.75)];
  }
 }catch{throw new LaunchError('FEE_UNAVAILABLE',503);}
 return boundedPriorityFee(estimate,units);
}

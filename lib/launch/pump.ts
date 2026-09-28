import {PUMP_SDK,PUMP_PROGRAM_ID,GLOBAL_PDA,bondingCurvePda,holderRewardsPda,OnlinePumpSdk,getBuyTokenAmountFromSolAmount,type Global,type FeeConfig} from '@pump-fun/pump-sdk';
import {BN,BorshInstructionCoder,type Idl} from '@coral-xyz/anchor';
import {pumpIdl} from '@pump-fun/pump-sdk';
import {ComputeBudgetProgram,PublicKey,Transaction,VersionedTransaction,TransactionMessage,AddressLookupTableAccount,AddressLookupTableProgram,type Connection} from '@solana/web3.js';
import {decodeTransaction,transactionMessage,transactionWire,verifyAllSignatures,signerSignature,type LaunchTransaction} from './transaction';
import {TOKEN_2022_PROGRAM_ID,unpackMint} from '@solana/spl-token';
import bs58 from 'bs58';
import {address,identitySchema,metadataUri,walletAddress,LaunchError,type LaunchIdentity} from './validation';
import {launchSettingsSchema,DEFAULT_LAUNCH_SETTINGS,maximumBuyLamports,COST_RESERVE_LAMPORTS,type LaunchSettings} from './settings';
export async function createPumpTransaction(input:{wallet:string;mint:string;identity:LaunchIdentity;uri:string;blockhash:string;lastValidBlockHeight:number;settings?:LaunchSettings;global?:Global;feeConfig?:FeeConfig;priorityMicroLamports?:number}){
 const user=new PublicKey(walletAddress.parse(input.wallet)),mint=new PublicKey(address.parse(input.mint));identitySchema.parse(input.identity);metadataUri.parse(input.uri);
 if(user.equals(mint))throw new LaunchError('INVALID_INPUT');
 const settings=launchSettingsSchema.parse(input.settings??DEFAULT_LAUNCH_SETTINGS);
 if(input.global){if(settings.mayhemMode&&!input.global.mayhemModeEnabled||settings.holderReward&&!input.global.isHolderRewardEnabled)throw new LaunchError('OPTION_UNAVAILABLE');}
 const params={mint,user,creator:user,name:input.identity.name,symbol:input.identity.symbol,uri:input.uri,mayhemMode:settings.mayhemMode,holderReward:settings.holderReward,cashback:false};
 let instructions;
 if(settings.initialBuyLamports){
  if(!input.global||!input.feeConfig)throw new LaunchError('PROGRAM_UNAVAILABLE',503);
  const quoteAmount=new BN(settings.initialBuyLamports);
  const amount=getBuyTokenAmountFromSolAmount({global:input.global,feeConfig:input.feeConfig,mintSupply:null,bondingCurve:null,amount:quoteAmount,quoteMint:PublicKey.default});
  if(amount.lten(0))throw new LaunchError('INVALID_INPUT');
  instructions=await PUMP_SDK.createV2AndBuyV2Instructions({...params,global:input.global,amount,quoteAmount});
  // Fail closed if an SDK upgrade changes the displayed maximum quote spend.
  const buy=new BorshInstructionCoder(pumpIdl as Idl).decode(instructions.at(-1)!.data);
  if(buy?.name!=='buy_v2'||String((buy.data as {max_sol_cost:BN}).max_sol_cost)!==String(maximumBuyLamports(settings.initialBuyLamports)))throw new LaunchError('TRANSACTION');
 }else instructions=[await PUMP_SDK.createV2Instruction(params)];
 return new Transaction({feePayer:user,blockhash:input.blockhash,lastValidBlockHeight:input.lastValidBlockHeight})
  // An explicit priority price prevents wallet fee auto-injection from changing
  // the already-reviewed message. getFeeForMessage includes the selected price.
  .add(ComputeBudgetProgram.setComputeUnitLimit({units:settings.initialBuyLamports||settings.mayhemMode?500000:300000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:input.priorityMicroLamports??0}),...instructions);
}
export async function checkPumpProgram(connection:Connection){
 const [program,global]=await connection.getMultipleAccountsInfo([PUMP_PROGRAM_ID,GLOBAL_PDA],'confirmed');
 if(!program?.executable||!global?.owner.equals(PUMP_PROGRAM_ID)||!PUMP_SDK.decodeGlobal(global).createV2Enabled)throw new LaunchError('PROGRAM_UNAVAILABLE',503);
 return PUMP_SDK.decodeGlobal(global);
}
export async function pumpContext(connection:Connection){const global=await checkPumpProgram(connection);const feeConfig=await new OnlinePumpSdk(connection).fetchFeeConfig();return {global,feeConfig};}
export async function compileLaunchTransaction(connection:Connection,tx:Transaction):Promise<LaunchTransaction>{
 try{if(transactionWire(tx).length<=1232)return tx;}catch{/* Use v0 for larger atomic creates. */}
 const key=process.env.PUMP_ADDRESS_LOOKUP_TABLE;
 if(!key)throw new LaunchError('LOOKUP_REQUIRED',503);
 const lookupKey=new PublicKey(address.parse(key)),account=await connection.getAccountInfo(lookupKey,'confirmed');
 if(!account?.owner.equals(AddressLookupTableProgram.programId))throw new LaunchError('LOOKUP_REQUIRED',503);
 const table=new AddressLookupTableAccount({key:lookupKey,state:AddressLookupTableAccount.deserialize(account.data)});
 if(!table?.isActive())throw new LaunchError('LOOKUP_REQUIRED',503);
 const compiled=new VersionedTransaction(new TransactionMessage({payerKey:tx.feePayer!,recentBlockhash:tx.recentBlockhash!,instructions:tx.instructions}).compileToV0Message([table]));
 if(compiled.serialize().length>1232)throw new LaunchError('LOOKUP_REQUIRED',503);
 return compiled;
}
export async function simulateLaunch(connection:Connection,tx:LaunchTransaction,settings:LaunchSettings=DEFAULT_LAUNCH_SETTINGS){
 const message=tx instanceof Transaction?tx.compileMessage():tx.message,payer=message.staticAccountKeys?message.staticAccountKeys[0]:(tx as Transaction).feePayer!;
 const simulated=await connection.simulateTransaction(new VersionedTransaction(message),{sigVerify:false,commitment:'confirmed',accounts:{encoding:'base64',addresses:[payer.toBase58()]}});
 if(simulated.value.err){const text=JSON.stringify(simulated.value.err)+' '+(simulated.value.logs??[]).join(' ');throw new LaunchError(/insufficient|debit.*no.*credit|AccountNotFound/i.test(text)?'INSUFFICIENT_SOL':'TRANSACTION');}
 const fee=await connection.getFeeForMessage(message,'confirmed');
 if(fee.value==null)throw new LaunchError('TRANSACTION');
 const balance=await connection.getBalance(payer,{commitment:'confirmed',minContextSlot:simulated.context.slot});
 const balances=simulated.value as typeof simulated.value & {preBalances?:number[];postBalances?:number[]};
 const before=balances.preBalances?.[0],after=balances.postBalances?.[0];
 if(before==null||after==null)throw new LaunchError('ESTIMATE_UNAVAILABLE',503);
 // Simulation's payer delta includes transaction fees. Expose costs separately;
 // add a reserve for intervening account/balance changes and the full buy cap.
 const spent=Math.max(0,before-after),accountCost=Math.max(0,spent-fee.value-settings.initialBuyLamports);
 const estimated=accountCost+fee.value+settings.initialBuyLamports,maxBuy=maximumBuyLamports(settings.initialBuyLamports);
 const maximum=accountCost+fee.value+maxBuy+COST_RESERVE_LAMPORTS;
 if(balance<maximum)throw new LaunchError('INSUFFICIENT_SOL');
 return {networkFeeLamports:fee.value,accountCostLamports:accountCost,estimatedWalletCostLamports:estimated,maxWalletCostLamports:maximum,maxBuyLamports:maxBuy,balanceLamports:balance,computeUnits:simulated.value.unitsConsumed??null};
}
export function validateSignedTransaction(wire:string,expectedMessage:string){
 let tx:LaunchTransaction;try{tx=decodeTransaction(wire);}catch{throw new LaunchError('TRANSACTION');}
 if(transactionMessage(tx).toString('base64')!==expectedMessage||!verifyAllSignatures(tx))throw new LaunchError('TRANSACTION');
 return {tx,signature:bs58.encode(signerSignature(tx,0)!),bytes:transactionWire(tx)};
}
export async function verifyPumpLaunch(connection:Connection,row:{mint_address:string;creator_wallet:string;transaction_signature:string;message_base64:string;holder_reward?:boolean;mayhem_mode?:boolean}){
 const transaction=await connection.getTransaction(row.transaction_signature,{commitment:'finalized',maxSupportedTransactionVersion:0});
 if(!transaction||!transaction.meta||transaction.meta.err)return false;
 if(transaction.transaction.signatures[0]!==row.transaction_signature||Buffer.from(transaction.transaction.message.serialize()).toString('base64')!==row.message_base64)return false;
 const mint=new PublicKey(row.mint_address),[mintInfo,curveInfo]=await connection.getMultipleAccountsInfo([mint,bondingCurvePda(mint)],'finalized');
 if(!mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID)||!curveInfo?.owner.equals(PUMP_PROGRAM_ID))return false;
 const token=unpackMint(mint,mintInfo,TOKEN_2022_PROGRAM_ID),curve=PUMP_SDK.decodeBondingCurve(curveInfo);
 const creator=row.holder_reward?holderRewardsPda(mint):new PublicKey(row.creator_wallet);
 return token.isInitialized&&token.decimals===6&&curve.creator.equals(creator)&&curve.isMayhemMode===!!row.mayhem_mode&&!curve.isCashbackCoin&&curve.isHolderReward===!!row.holder_reward&&curve.quoteMint.equals(PublicKey.default);
}

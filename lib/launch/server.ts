import 'server-only';
import {refreshStoredOffspring} from '../tokens/server/token-images';
import {randomUUID} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {database,rpc} from '../server/supabase';
import {launchConfig,launchConnection,verifyCluster} from './config';
import {createPumpTransaction,compileLaunchTransaction,checkPumpProgram,pumpContext,simulateLaunch,validateSignedTransaction,verifyPumpLaunch} from './pump';
import {transactionMessage,transactionWire} from './transaction';
import {DEFAULT_LAUNCH_SETTINGS,launchSettingsSchema,type LaunchSettings} from './settings';
import {PinataStorage} from './storage';
import {quotePriorityFee} from './priority-fee';
import {LaunchError,tokenMetadata,identitySchema,type LaunchIdentity} from './validation';
import type {Offspring} from '../memesplice/types';
export type LaunchRow={id:string;offspring_id:string;session_id:string;network:'devnet'|'mainnet-beta';creator_wallet:string;mint_address:string;transaction_signature:string|null;status:string;message_base64:string|null;unsigned_transaction:string|null;last_valid_block_height:number|null;metadata_uri:string|null;image_uri:string|null;network_fee_lamports:number|null;error_code:string|null;initial_buy_lamports?:number;holder_reward?:boolean;holder_reward_acknowledged?:boolean;mayhem_mode?:boolean;estimated_wallet_cost_lamports?:number;max_wallet_cost_lamports?:number;account_cost_lamports?:number;compute_units?:number};
type Assets={offspring_id:string;identity:LaunchIdentity;metadata_json:ReturnType<typeof tokenMetadata>|null;image_uri:string|null;metadata_uri:string|null;image_started:boolean;metadata_started:boolean;lease_token:string};
type Child={id:string;generation_job_id:string;image_storage_path:string;result:Offspring};
async function owned(session:string,id:string){
 const rows=await database<Child[]>(`offspring?id=eq.${id}&select=id,generation_job_id,image_storage_path,result`);const child=rows[0];
 if(!child)throw new LaunchError('NOT_OWNED',403);
 const jobs=await database<{id:string}[]>(`generation_jobs?id=eq.${child.generation_job_id}&session_id=eq.${session}&status=eq.COMPLETE&select=id`);
 if(!jobs.length)throw new LaunchError('NOT_OWNED',403);return child;
}
async function active(id:string){return (await database<LaunchRow[]>(`offspring_launches?offspring_id=eq.${id}&status=neq.FAILED&order=created_at.desc&limit=1`))[0]??null;}
async function patch(row:LaunchRow,values:Partial<LaunchRow>&Record<string,unknown>){
 const changed=await database<LaunchRow[]>(`offspring_launches?id=eq.${row.id}&status=eq.${row.status}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(values)});
 if(!changed[0])throw new LaunchError('BUSY',409);return changed[0];
}
function rowSettings(row:LaunchRow):LaunchSettings{return {...DEFAULT_LAUNCH_SETTINGS,initialBuyLamports:row.initial_buy_lamports??0,holderReward:row.holder_reward??false,holderRewardAcknowledged:row.holder_reward_acknowledged??false,mayhemMode:row.mayhem_mode??false};}
export function publicLaunch(row:LaunchRow|null){if(!row)return null;return {id:row.id,status:row.status,network:row.network,wallet:row.creator_wallet,mint:row.mint_address,signature:row.transaction_signature,metadataUri:row.metadata_uri,imageUri:row.image_uri,networkFeeLamports:row.network_fee_lamports,errorCode:row.error_code,settings:rowSettings(row),estimatedWalletCostLamports:row.estimated_wallet_cost_lamports,maxWalletCostLamports:row.max_wallet_cost_lamports,accountCostLamports:row.account_cost_lamports,computeUnits:row.compute_units};}
export async function reviewLaunch(session:string,id:string,reconcileExisting=true){
 const child=await owned(session,id),config=launchConfig();let row=await active(id);
 if(reconcileExisting&&row&&row.status!=='PREPARING'&&row.status!=='VERIFIED')row=await reconcile(row);
 // Keep the final failure visible across polling and refresh. Only active()
 // controls duplicate protection; a historical failure does not block retry.
 if(!row)row=(await database<LaunchRow[]>(`offspring_launches?offspring_id=eq.${id}&status=eq.FAILED&order=created_at.desc&limit=1`))[0]??null;
 const assets=await database<Assets[]>(`offspring_launch_assets?offspring_id=eq.${id}&select=identity`);
 let availability={mayhem:false,holderReward:false,reason:'Live Pump settings could not be checked.'};
 try{const connection=launchConnection();await verifyCluster(connection,config.network);const global=await checkPumpProgram(connection);availability={mayhem:global.mayhemModeEnabled,holderReward:global.isHolderRewardEnabled,reason:'This option is disabled in Pump’s current network configuration.'};}catch{/* Fail closed for optional modes. */}
 return {launch:publicLaunch(row),identity:assets[0]?.identity??null,enabled:config.enabled,storageReady:config.pinata,network:config.network,offspringId:child.id,offspring:{...refreshStoredOffspring(child.result),id:child.id,generationJobId:child.generation_job_id},availability};
}
export type PrepareInput={offspringId:string;wallet:string;mint:string;identity:LaunchIdentity;settings?:LaunchSettings};
// Price and blockhash are finalized BEFORE the message is persisted or exposed.
// No later retry may refresh the blockhash or change the reviewed fee.
export async function buildPricedLaunch(connection:ReturnType<typeof launchConnection>,input:Omit<Parameters<typeof createPumpTransaction>[0],'blockhash'|'lastValidBlockHeight'|'priorityMicroLamports'>){
 const initialBlock=await connection.getLatestBlockhash('confirmed');
 const draft=await createPumpTransaction({...input,...initialBlock});
 const quote=await quotePriorityFee(connection,await compileLaunchTransaction(connection,draft),draft);
 const block=await connection.getLatestBlockhash('confirmed');
 const tx=await compileLaunchTransaction(connection,await createPumpTransaction({...input,...block,priorityMicroLamports:quote.microLamports}));
 const estimate={...await simulateLaunch(connection,tx,input.settings),priorityFeeLamports:quote.lamports};
 return {tx,block,estimate};
}
export async function prepareLaunch(session:string,input:PrepareInput){
 const config=launchConfig();if(!config.enabled||!config.pinata)throw new LaunchError('NOT_READY',503);
 const child=await owned(session,input.offspringId);
 let row=await rpc<LaunchRow>('splice_begin_launch',{p_session:session,p_offspring:child.id,p_wallet:input.wallet,p_mint:input.mint,p_network:config.network,p_identity:input.identity});
 if(row.network!==config.network||row.creator_wallet!==input.wallet)throw new LaunchError('WALLET_CHANGED',409);
 if(row.status!=='PREPARING')return {launch:publicLaunch(await reconcile(row))};
 const lease=randomUUID();let asset=(await rpc<Assets[]>('splice_launch_lease',{p_offspring:child.id,p_token:lease}))[0];
 if(!asset)throw new LaunchError('BUSY',409);
 async function save(values:Partial<Assets>){const rows=await database<Assets[]>(`offspring_launch_assets?offspring_id=eq.${child.id}&lease_token=eq.${lease}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(values)});if(!rows[0])throw new LaunchError('BUSY',409);asset=rows[0];}
 try{
  // A PREPARING attempt has never exposed a transaction. It is safe to replace its lost mint.
  if(row.mint_address!==input.mint){await patch(row,{status:'FAILED',error_code:'EXPIRED'});row=await rpc<LaunchRow>('splice_begin_launch',{p_session:session,p_offspring:child.id,p_wallet:input.wallet,p_mint:input.mint,p_network:config.network,p_identity:asset.identity});}
  const settings=launchSettingsSchema.parse(input.settings??DEFAULT_LAUNCH_SETTINGS);
  row=await patch(row,{initial_buy_lamports:settings.initialBuyLamports,holder_reward:settings.holderReward,holder_reward_acknowledged:settings.holderRewardAcknowledged,mayhem_mode:settings.mayhemMode});
  const connection=launchConnection();await verifyCluster(connection,config.network);const context=await pumpContext(connection);
  const storage=new PinataStorage(process.env.PINATA_JWT!);
  if(!asset.image_uri){
   const path=child.image_storage_path.split('/').map(encodeURIComponent).join('/');
   const response=await fetch(`${process.env.SUPABASE_URL!.replace(/\/$/,'')}/storage/v1/object/offspring/${path}`,{headers:{apikey:process.env.SUPABASE_SECRET_KEY!},signal:AbortSignal.timeout(20000),redirect:'error'});
   if(!response.ok)throw new LaunchError('METADATA',503);
   const bytes=new Uint8Array(await response.arrayBuffer());
   if(bytes.length>8*1024*1024||Buffer.from(bytes.slice(0,4)).toString()!=='RIFF'||Buffer.from(bytes.slice(8,12)).toString()!=='WEBP')throw new LaunchError('METADATA');
   const uri=await storage.pin(bytes,'image/webp',child.id+'-image',asset.image_started,()=>save({image_started:true}));await save({image_uri:uri});
  }
  if(!asset.metadata_uri){if(!asset.metadata_json)await save({metadata_json:tokenMetadata(asset.identity,asset.image_uri!,config.website,config.twitter)});const metadata=asset.metadata_json;
   const uri=await storage.pin(new TextEncoder().encode(JSON.stringify(metadata)),'application/json',child.id+'-metadata',asset.metadata_started,()=>save({metadata_started:true}));await save({metadata_uri:uri});}
  const {tx,block,estimate}=await buildPricedLaunch(connection,{wallet:row.creator_wallet,mint:row.mint_address,identity:asset.identity,uri:asset.metadata_uri!,settings,...context});
  row=await patch(row,{status:'AWAITING_SIGNATURE',image_uri:asset.image_uri,metadata_uri:asset.metadata_uri,message_base64:transactionMessage(tx).toString('base64'),unsigned_transaction:transactionWire(tx).toString('base64'),last_valid_block_height:block.lastValidBlockHeight,network_fee_lamports:estimate.networkFeeLamports,estimated_wallet_cost_lamports:estimate.estimatedWalletCostLamports,max_wallet_cost_lamports:estimate.maxWalletCostLamports,account_cost_lamports:estimate.accountCostLamports,compute_units:estimate.computeUnits??undefined});
  return {launch:publicLaunch(row),identity:asset.identity,transaction:row.unsigned_transaction,estimate};
 }finally{await database(`offspring_launch_assets?offspring_id=eq.${child.id}&lease_token=eq.${lease}`,{method:'PATCH',body:JSON.stringify({lease_token:null,lease_until:null})}).catch(()=>{});}
}
// Read-only rehearsal: existing assets only, no pin uploads, records or submit call.
// The browser deliberately destroys this mint's key WITHOUT signing the message.
export async function preflightLaunch(session:string,input:PrepareInput){
 const child=await owned(session,input.offspringId),config=launchConfig(),existing=await active(child.id);
 if(existing&&existing.status!=='PREPARING')throw new LaunchError('BUSY',409);
 let asset=(await database<Assets[]>(`offspring_launch_assets?offspring_id=eq.${child.id}`))[0];
 if(!asset?.image_uri||!asset.metadata_uri){
  // Recover pins made by the previous storage check without uploading or writing.
  const identity=asset?.identity??identitySchema.parse({name:child.result.name,symbol:child.result.ticker,description:child.result.lore||child.result.tagline});
  const path=child.image_storage_path.split('/').map(encodeURIComponent).join('/');
  const response=await fetch(`${process.env.SUPABASE_URL!.replace(/\/$/,'')}/storage/v1/object/offspring/${path}`,{headers:{apikey:process.env.SUPABASE_SECRET_KEY!},signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!response.ok)throw new LaunchError('PIN_REQUIRED',409);
  const storage=new PinataStorage(process.env.PINATA_JWT!),neverUpload=async()=>{throw new LaunchError('PIN_REQUIRED',409);};
  const imageUri=asset?.image_uri??await storage.pin(new Uint8Array(await response.arrayBuffer()),'image/webp',child.id+'-image',true,neverUpload);
  const metadata=asset?.metadata_json??tokenMetadata(identity,imageUri,config.website,config.twitter);
  const uri=asset?.metadata_uri??await storage.pin(new TextEncoder().encode(JSON.stringify(metadata)),'application/json',child.id+'-metadata',true,neverUpload);
  asset={...asset,identity,image_uri:imageUri,metadata_uri:uri};
 }
 const settings=launchSettingsSchema.parse(input.settings??DEFAULT_LAUNCH_SETTINGS),connection=launchConnection();
 await verifyCluster(connection,config.network);const context=await pumpContext(connection);
 const {tx,block,estimate}=await buildPricedLaunch(connection,{wallet:input.wallet,mint:input.mint,identity:asset.identity,uri:asset.metadata_uri!,settings,...context});
 return {identity:asset.identity,settings,network:config.network,metadataUri:asset.metadata_uri,imageUri:asset.image_uri,estimate,transaction:transactionWire(tx).toString('base64'),lastValidBlockHeight:block.lastValidBlockHeight};
}
export async function submitLaunch(session:string,id:string,wire:string){
 const rows=await database<LaunchRow[]>(`offspring_launches?id=eq.${id}&session_id=eq.${session}`);let row=rows[0];
 if(!row)throw new LaunchError('NOT_OWNED',403);
 const config=launchConfig();if(!config.enabled||row.network!==config.network)throw new LaunchError('NOT_READY',503);
 if(row.status!=='AWAITING_SIGNATURE')return publicLaunch(await reconcile(row));
 if(!row.message_base64)throw new LaunchError('TRANSACTION');
 const signed=validateSignedTransaction(wire,row.message_base64);const connection=launchConnection();await verifyCluster(connection,row.network);
 if(await connection.getBlockHeight('confirmed')>row.last_valid_block_height!)return publicLaunch(await reconcile(row));
 // Persist the deterministic signature before any broadcast. A lost send response is recoverable.
 row=await patch(row,{status:'SUBMITTED',transaction_signature:signed.signature,submitted_at:new Date().toISOString()});
 let sendCode:string|null=null,sendNotice='RPC accepted the signed transaction for forwarding; confirmation still required.';
 try{const returned=await connection.sendRawTransaction(signed.bytes,{skipPreflight:false,maxRetries:40,preflightCommitment:'confirmed'});if(returned!==signed.signature)throw new Error('SIGNATURE_MISMATCH');}catch(error){
  // RPC retries relay the SAME signed bytes; they cannot produce another mint.
  // A send error is not proof of non-execution. Preserve the signature and lock.
  const preflight=error instanceof Error&&error.name==='SendTransactionError';
  sendCode=preflight?'RPC_PREFLIGHT':'RPC_UNCERTAIN';
  const message=error instanceof Error?error.message:'';
  sendNotice=/blockhash/i.test(message)?'RPC reported a blockhash error; saved signature must be reconciled.':/insufficient/i.test(message)?'RPC reported insufficient funds; saved signature must be reconciled.':/429|rate.limit/i.test(message)?'RPC reported rate limiting; saved signature must be reconciled.':preflight?'RPC reported a submission/preflight error; saved signature must be reconciled.':'RPC receipt is uncertain; saved signature must be reconciled.';
  console.warn('[pump-send]',JSON.stringify({launchId:row.id,signature:signed.signature,code:sendCode,notice:sendNotice}));
 }
 // Persist only fixed, sanitized diagnostics, including positive RPC receipt.
 // Expiry changes error_code but retains this evidence for later investigation.
 const updated=await database<LaunchRow[]>(`offspring_launches?id=eq.${row.id}&status=eq.SUBMITTED`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({error_code:sendCode,error_message_safe:sendNotice})});
 row=updated[0]??(await database<LaunchRow[]>(`offspring_launches?id=eq.${row.id}`))[0]??row;
 return publicLaunch(await reconcile(row));
}
export async function reconcile(row:LaunchRow):Promise<LaunchRow>{
 if(['VERIFIED','FAILED','PREPARING'].includes(row.status))return row;
 const connection=launchConnection();const config=launchConfig();if(row.network!==config.network)throw new LaunchError('NOT_READY',503);await verifyCluster(connection,row.network);
 if(!row.transaction_signature){
  // A wallet can broadcast independently. Recover only a signature for the exact saved message.
  const signatures=await connection.getSignaturesForAddress(new PublicKey(row.mint_address),{limit:20},'finalized');
  for(const item of signatures){const tx=await connection.getTransaction(item.signature,{commitment:'finalized',maxSupportedTransactionVersion:0});if(tx&&Buffer.from(tx.transaction.message.serialize()).toString('base64')===row.message_base64){row=await patch(row,{transaction_signature:item.signature,status:'SUBMITTED',submitted_at:new Date().toISOString()});break;}}
 }
 if(row.transaction_signature){
  const status=(await connection.getSignatureStatuses([row.transaction_signature],{searchTransactionHistory:true})).value[0];
  if(status?.confirmationStatus==='finalized'){
   if(status.err)return patch(row,{status:'FAILED',error_code:'TRANSACTION'});
   if(await verifyPumpLaunch(connection,{...row,transaction_signature:row.transaction_signature,message_base64:row.message_base64!}))return rpc<LaunchRow>('splice_verify_launch',{p_id:row.id,p_signature:row.transaction_signature});
   if(row.status!=='CONFIRMED')return patch(row,{status:'CONFIRMED',confirmed_at:new Date().toISOString(),error_code:'VERIFYING'});return row;
  }
  if(status){if(row.status==='SUBMITTED')return patch(row,{status:'CONFIRMING'});return row;}
 }
 // Finalized height beyond validity plus absent signature AND mint proves the old transaction cannot land.
 if(row.last_valid_block_height&&await connection.getBlockHeight('finalized')>row.last_valid_block_height){
  const mint=await connection.getAccountInfo(new PublicKey(row.mint_address),'finalized');
  const status=row.transaction_signature?(await connection.getSignatureStatuses([row.transaction_signature],{searchTransactionHistory:true})).value[0]:null;
  if(!mint&&!status)return patch(row,{status:'FAILED',error_code:'EXPIRED'});
 }
 return row;
}


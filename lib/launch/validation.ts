import {z} from 'zod';
import {PublicKey} from '@solana/web3.js';
import bs58 from 'bs58';
export const address=z.string().refine(value=>{try{return new PublicKey(value).toBase58()===value;}catch{return false;}},'Invalid Solana address');
export const walletAddress=address.refine(value=>{try{const key=new PublicKey(value);return !key.equals(PublicKey.default)&&PublicKey.isOnCurve(key.toBytes());}catch{return false;}},'A signing wallet is required');
export const signature=z.string().refine(value=>{try{return bs58.decode(value).length===64;}catch{return false;}});
const bounded=(max:number)=>z.string().trim().min(1).max(max).refine(s=>new TextEncoder().encode(s).length<=max,'Value exceeds on-chain byte limit');
export const identitySchema=z.object({name:bounded(32),symbol:bounded(13).refine(s=>/^[A-Za-z0-9]+$/.test(s)),description:z.string().trim().min(1).max(600)}).strict();
export const metadataUri=z.string().min(1).max(200).regex(/^ipfs:\/\/[a-zA-Z0-9]+$/);
export type LaunchIdentity=z.infer<typeof identitySchema>;
export function tokenMetadata(identity:LaunchIdentity,image:string,website='',twitter=''){
  identitySchema.parse(identity);metadataUri.parse(image);
  for(const value of [website,twitter])if(value&&new URL(value).protocol!=='https:')throw Error('INVALID_SOCIAL_URL');
  return {...identity,image,showName:true,createdOn:'https://pump.fun',website,twitter};
}
export class LaunchError extends Error{constructor(public code:string,public status=400){super(code);}}
export const messages:Record<string,string>={
 FEE_UNAVAILABLE:'A reliable network priority fee could not be estimated. No transaction was submitted. Try reviewing again shortly.',
 FEE_CAP:'The estimated priority fee exceeds the 0.001 SOL safety cap. No transaction was submitted. Try again when fees are lower.',
 LOOKUP_REQUIRED:'An active launch address table is needed for this atomic initial buy. No transaction was submitted.',
 ESTIMATE_UNAVAILABLE:'The RPC could not return a reliable wallet cost estimate. No transaction was submitted.',
 OPTION_UNAVAILABLE:'Pump currently does not support one of these launch options. Turn it off and review again.',
 PIN_REQUIRED:'The existing image and metadata must be pinned before this read-only wallet check.',
 NOT_READY:'Pump launching is not enabled yet.',NOT_OWNED:'Only a completed offspring owned by this browser session can be launched.',
 INVALID_INPUT:'Check the wallet, name, ticker and launch details.',BUSY:'Launch preparation is already in progress. Check again shortly.',
 METADATA:'We couldn’t prepare the token metadata. No launch transaction was submitted.',
 METADATA_UNCERTAIN:'Metadata preparation needs a status check before another upload. No launch transaction was submitted.',
 INSUFFICIENT_SOL:'Your wallet does not have enough SOL to complete the launch.',
 UNCONFIRMED:"Launch could not be confirmed yet. We're checking the transaction before allowing another attempt.",
 VERIFYING:'Transaction confirmed, but launch verification is still in progress.',
 WALLET_CHANGED:'Reconnect the wallet used to prepare this launch.',
 EXPIRED:'The launch transaction expired without creating a token. You can prepare a new attempt.',
 REJECTED:'Launch cancelled. No token was created.',
 TRANSACTION:'The transaction could not be validated. No new transaction was submitted.',
 PROGRAM_UNAVAILABLE:'Pump create_v2 is not available on the configured network.',
};



import {z} from 'zod';

// Product safety bounds, not Pump protocol limits. No paid amount is preselected.
export const MIN_BUY_LAMPORTS=1_000_000;
export const MAX_BUY_LAMPORTS=10_000_000_000;
export const SLIPPAGE_BPS=100;
export const COST_RESERVE_LAMPORTS=1_000_000;
export const launchSettingsSchema=z.object({
 initialBuyLamports:z.number().int().safe().min(0).max(MAX_BUY_LAMPORTS).refine(n=>n===0||n>=MIN_BUY_LAMPORTS),
 holderReward:z.boolean(),holderRewardAcknowledged:z.boolean(),mayhemMode:z.boolean(),
 quoteAsset:z.literal('SOL'),cashback:z.literal(false),
}).strict().refine(s=>!s.holderReward||s.holderRewardAcknowledged,{message:'Acknowledge the permanent Holder Rewards choice.'});
export type LaunchSettings=z.infer<typeof launchSettingsSchema>;
export const DEFAULT_LAUNCH_SETTINGS:LaunchSettings={initialBuyLamports:0,holderReward:false,holderRewardAcknowledged:false,mayhemMode:false,quoteAsset:'SOL',cashback:false};
export function parseBuySol(value:string){
 if(!/^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(value.trim()))throw Error('Enter a SOL amount with up to 9 decimal places.');
 const [whole,fraction='']=value.trim().split('.');const amount=BigInt(whole)*BigInt(1_000_000_000)+BigInt(fraction.padEnd(9,'0'));
 if(amount<BigInt(MIN_BUY_LAMPORTS)||amount>BigInt(MAX_BUY_LAMPORTS))throw Error('Initial buy must be between 0.001 and 10 SOL.');
 return Number(amount);
}
// Matches the pinned official SDK's create+buy 1% slippage, with integer floor.
export function maximumBuyLamports(amount:number){return amount+Math.floor(amount*SLIPPAGE_BPS/10_000);}
export type LaunchEstimate={networkFeeLamports:number;priorityFeeLamports?:number;accountCostLamports:number;estimatedWalletCostLamports:number;maxWalletCostLamports:number;maxBuyLamports:number;balanceLamports:number;computeUnits:number|null};

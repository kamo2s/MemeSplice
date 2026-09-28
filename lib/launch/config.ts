import 'server-only';
import {Connection,clusterApiUrl} from '@solana/web3.js';
import {LaunchError} from './validation';
export function launchConfig(){
 const network=process.env.SOLANA_NETWORK||'devnet';
 if(network!=='devnet'&&network!=='mainnet-beta')throw new LaunchError('NOT_READY',503);
 const endpoint=process.env.SOLANA_RPC_URL||clusterApiUrl(network);
 const url=new URL(endpoint);if(url.protocol!=='https:')throw new LaunchError('NOT_READY',503);
 return {network,endpoint,enabled:process.env.PUMP_LAUNCH_ENABLED==='true'&&(network!=='mainnet-beta'||process.env.PUMP_MAINNET_LAUNCH_ENABLED==='true'),pinata:!!process.env.PINATA_JWT,website:process.env.TOKEN_WEBSITE_URL||'',twitter:process.env.TOKEN_TWITTER_URL||''} as const;
}
export function launchConnection(){return new Connection(launchConfig().endpoint,{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:async(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})});}
export async function verifyCluster(connection:Connection,network:string){
 const expected=network==='mainnet-beta'?'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d':'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
 if(await connection.getGenesisHash()!==expected)throw new LaunchError('NOT_READY',503);
}


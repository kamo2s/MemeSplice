'use client';
import {useEffect,useState} from 'react';
import {useWallet} from '@solana/wallet-adapter-react';
import {LaunchDialog} from '@/components/memesplice/launch-dialog';
import {WalletDialog} from '@/components/memesplice/wallet-dialog';
import type {Offspring} from '@/lib/memesplice/types';
export default function WalletCheck(){
 const wallet=useWallet(),[child,setChild]=useState<Offspring|null>(null),[error,setError]=useState(''),[connect,setConnect]=useState(false),[review,setReview]=useState(false);
 useEffect(()=>{void fetch('/api/wallet-check',{cache:'no-store'}).then(async r=>{const data=await r.json() as {offspring:Offspring;error?:string};if(!r.ok)throw Error(data.error);setChild(data.offspring);}).catch(e=>setError(e.message));},[]);
 return <main className="wallet-check-page"><div className="eyebrow">SPLICE · PRIVATE LOCAL REHEARSAL</div><h1>Check your launch wallet</h1><p>Solana mainnet simulation only. Both launch switches remain off.</p><p>Connect Phantom, verify the address, disconnect and reconnect. Then review {child?.name??'your completed offspring'} and check the wallet approval popup.</p><p className="launch-address">Connected wallet: {wallet.publicKey?.toBase58()??'Not connected'}</p><div className="launch-links"><button className="btn btn-secondary" onClick={()=>setConnect(true)}>{wallet.connected?'Manage Wallet':'Connect Wallet'}</button><button className="btn btn-primary" disabled={!child} onClick={()=>setReview(true)}>Open Launch Review</button></div><p>No mint signature is produced in this rehearsal. A wallet signature is checked locally and discarded. This page cannot submit a launch.</p>{error&&<p role="alert">{error}</p>}<WalletDialog open={connect} onClose={()=>setConnect(false)} onConnected={()=>setConnect(false)}/>{child&&<LaunchDialog offspring={child} open={review} onClose={()=>setReview(false)} onConnect={()=>setConnect(true)} onVerified={()=>{}} apiPath="/api/wallet-check"/>}</main>;
}

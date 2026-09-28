'use client';
import {use,useEffect,useState} from 'react';
import {useWallet} from '@solana/wallet-adapter-react';
import {LaunchDialog} from '@/components/memesplice/launch-dialog';
import {WalletDialog} from '@/components/memesplice/wallet-dialog';
import {OffspringCard} from '@/components/memesplice/offspring-card';
import {LabBackdrop} from '@/components/memesplice/lab-backdrop';
import type {Offspring} from '@/lib/memesplice/types';

export default function SavedOffspring({params}:{params:Promise<{id:string}>}){
 const {id}=use(params),wallet=useWallet();
 const [child,setChild]=useState<Offspring|null>(null),[error,setError]=useState(''),[connect,setConnect]=useState(false),[review,setReview]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch('/api/launch?offspringId='+encodeURIComponent(id),{cache:'no-store',signal:controller.signal}).then(async response=>{
   const data=await response.json() as {offspring:Offspring;error?:string};
   if(!response.ok)throw Error(data.error||'Unable to load this offspring.');
   setChild(data.offspring);
  }).catch(error=>{if(!controller.signal.aborted)setError(error.message);});
  return()=>controller.abort();
 },[id]);
 return <main className="saved-offspring-page offspring-section lab-scene"><LabBackdrop scene="result"/><div className="container">
  <div className="eyebrow">SPLICE · YOUR OFFSPRING</div>
  <h1>{child?.name??'Your offspring'}</h1>
  {child&&<OffspringCard offspring={child} selected dimmed={false} onSelect={()=>setReview(true)}/>}
  <p className="launch-address">Connected wallet: {wallet.publicKey?.toBase58()??'Not connected'}</p>
  <div className="launch-links"><button className="btn btn-secondary" onClick={()=>setConnect(true)}>{wallet.connected?'Manage Wallet':'Connect Wallet'}</button><button className="btn btn-primary" disabled={!child} onClick={()=>setReview(true)}>Launch on Pump</button></div>
  <p>Choose your launch settings and review the estimated wallet spend before approving in your wallet.</p>
  {error&&<p role="alert">{error}</p>}
  <WalletDialog open={connect} onClose={()=>setConnect(false)} onConnected={()=>setConnect(false)}/>
  {child&&<LaunchDialog offspring={child} open={review} onClose={()=>setReview(false)} onConnect={()=>setConnect(true)} onVerified={setChild}/>}
 </div></main>;
}

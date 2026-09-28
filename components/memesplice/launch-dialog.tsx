'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useWallet} from '@solana/wallet-adapter-react';
import type {Signer} from '@solana/web3.js';
import {decodeTransaction,transactionMessage,transactionWire,verifyWalletSignature,verifyAllSignatures,signMint,signerKeys,createTransientMint,type LaunchTransaction} from '@/lib/launch/transaction';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Artwork} from './artwork';
import {identitySchema} from '@/lib/launch/validation';
import {DEFAULT_LAUNCH_SETTINGS,launchSettingsSchema,parseBuySol,type LaunchSettings,type LaunchEstimate} from '@/lib/launch/settings';
import type {Offspring} from '@/lib/memesplice/types';
type Identity={name:string;symbol:string;description:string};
type Launch={id:string;status:string;network:string;wallet:string;mint:string;signature:string|null;metadataUri?:string;errorCode:string|null;networkFeeLamports:number|null;settings?:LaunchSettings;estimatedWalletCostLamports?:number;maxWalletCostLamports?:number;accountCostLamports?:number};
type Review={launch:Launch|null;identity:Identity|null;enabled:boolean;storageReady:boolean;network:string;availability?:{mayhem:boolean;holderReward:boolean;reason:string}};
type Prepared={launch?:Launch;identity:Identity;transaction:string;estimate:LaunchEstimate;network?:string;metadataUri?:string;error?:string};
type Pending={id?:string;wallet:string;tx:LaunchTransaction;mint:Signer|null;rehearsal:boolean;settings:LaunchSettings;estimate:LaunchEstimate;network:string;metadataUri:string;signed:boolean};
const sol=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:9}).format(n/1e9);
async function api<T>(body:object,path='/api/launch'){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json() as T & {error?:string};if(!response.ok)throw Error(result.error||'Launch is temporarily unavailable.');return result;}
export function LaunchDialog({offspring,open,onClose,onConnect,onVerified,apiPath='/api/launch'}:{offspring:Offspring;open:boolean;onClose:()=>void;onConnect:()=>void;onVerified:(child:Offspring)=>void;apiPath?:string}){
 const wallet=useWallet(),walletAddress=wallet.publicKey?.toBase58(),eligible=!!offspring.generationJobId;
 const [review,setReview]=useState<Review|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState('');
 const [buy,setBuy]=useState(false),[buyAmount,setBuyAmount]=useState(''),[holder,setHolder]=useState(false),[ack,setAck]=useState(false),[mayhem,setMayhem]=useState(false),[prepared,setPrepared]=useState<Pending|null>(null),[editingCancelled,setEditingCancelled]=useState(false);
 const signing=useRef<Pending|null>(null),lock=useRef(false),notified=useRef(false),currentWallet=useRef(walletAddress);
 useEffect(()=>{currentWallet.current=walletAddress;},[walletAddress]);
 useEffect(()=>()=>{signing.current?.mint?.secretKey.fill(0);signing.current=null;},[]);
 const identity=review?.identity??{name:offspring.name,symbol:offspring.ticker,description:offspring.lore||offspring.tagline};
 const refresh=useCallback(async()=>{const response=await fetch(apiPath+'?offspringId='+encodeURIComponent(offspring.id),{cache:'no-store'});const value=await response.json() as Review & {error?:string};if(!response.ok)throw Error(value.error);
  if(!lock.current&&signing.current?.id===value.launch?.id&&value.launch?.status==='FAILED'){
   signing.current?.mint?.secretKey.fill(0);signing.current=null;setPrepared(null);setProgress('');
  }
  setReview(value);return value;},[offspring.id,apiPath]);
 useEffect(()=>{if(!open||!eligible)return;let stopped=false;const check=()=>void refresh().catch(e=>{if(!stopped)setError(e.message);});check();const timer=setInterval(check,10000);return()=>{stopped=true;clearInterval(timer);};},[open,eligible,refresh]);
 useEffect(()=>{const l=review?.launch;if(l?.status==='VERIFIED'&&l.network==='mainnet-beta'&&!notified.current){notified.current=true;onVerified({...offspring,name:identity.name,ticker:identity.symbol,lore:identity.description,status:'launched',launch:{mint:l.mint,signature:l.signature!,provider:'pump.fun',network:l.network}});if(typeof window!=='undefined')window.dispatchEvent(new Event('splice:launch-verified'));}},[review,offspring,onVerified,identity.name,identity.symbol,identity.description]);
 async function prepare(){
  if(lock.current)return;if(!walletAddress||!wallet.signTransaction){onConnect();return;}
  lock.current=true;setBusy(true);setError('');setProgress('Checking metadata, wallet balance and simulating…');let mint:Signer|null=null;
  try{
   const latest=await refresh();if(latest.launch&&!['FAILED','PREPARING'].includes(latest.launch.status))throw Error('The existing attempt must confirm or safely expire before preparing again.');
   const settings=launchSettingsSchema.parse({...DEFAULT_LAUNCH_SETTINGS,initialBuyLamports:buy?parseBuySol(buyAmount):0,holderReward:holder,holderRewardAcknowledged:ack,mayhemMode:mayhem});
   if(holder&&!latest.availability?.holderReward||mayhem&&!latest.availability?.mayhem)throw Error(latest.availability?.reason||'Live Pump options are unavailable.');
   mint=createTransientMint();const rehearsal=!latest.enabled;
   const result=await api<Prepared>({action:rehearsal?'preflight':'prepare',offspringId:offspring.id,wallet:walletAddress,mint:mint.publicKey.toBase58(),identity:identitySchema.parse(identity),settings},apiPath);
   if(!result.transaction)throw Error('An existing launch is being checked. No second transaction was created.');
   const tx=decodeTransaction(result.transaction),keys=signerKeys(tx);
   if(!keys[0]?.equals(wallet.publicKey!)||!keys.some(k=>k.equals(mint!.publicKey)))throw Error('Unexpected transaction signer.');
   if(rehearsal){mint.secretKey.fill(0);mint=null;}
   const p:Pending={id:result.launch?.id,wallet:walletAddress,tx,mint,rehearsal,settings,estimate:result.estimate,network:result.launch?.network??result.network!,metadataUri:result.launch?.metadataUri??result.metadataUri!,signed:false};
   signing.current=p;setPrepared(p);setEditingCancelled(false);mint=null;setReview({...latest,identity:result.identity,launch:result.launch??latest.launch});
   setProgress(rehearsal?'Simulation passed. Wallet approval check is available; this rehearsal cannot be broadcast.':'Simulation passed. Review the estimated spend before wallet approval.');
  }catch(e){setError(e instanceof Error?e.message:'Unable to prepare launch.');setProgress('');}finally{mint?.secretKey.fill(0);lock.current=false;setBusy(false);}
 }
 async function approve(){
  const p=signing.current;if(lock.current||!p||!wallet.signTransaction)return;
  lock.current=true;setBusy(true);setError('');
  try{
   if(currentWallet.current!==p.wallet)throw Error('Reconnect the wallet used for this review.');
   if(!p.rehearsal){const latest=await refresh();if(!latest.enabled||latest.launch?.id!==p.id||latest.launch?.status!=='AWAITING_SIGNATURE')throw Error('Launch state changed. Check the existing attempt before continuing.');}
   if(!p.signed){
    setProgress(p.rehearsal?'Open Phantom and review the sign-only rehearsal. No broadcast will follow.':'Review and approve the transaction in your wallet…');
    // Bind the mint signature to the exact reviewed message before wallet
    // handoff. Rehearsals deliberately never receive this signature.
    if(!p.rehearsal&&p.mint){signMint(p.tx,p.mint);p.mint.secretKey.fill(0);p.mint=null;}
    const message=transactionMessage(p.tx);let signed:LaunchTransaction;
    // Some providers mutate their input. Preserve the reviewed transaction
    // for retries instead of allowing that mutation to become a new baseline.
    const walletCopy=decodeTransaction(transactionWire(p.tx).toString('base64'));
    try{signed=await wallet.signTransaction(walletCopy);}catch{throw Error('Wallet approval cancelled. You can retry, or edit your settings.');}
    if(!transactionMessage(signed).equals(message))throw Error('The wallet changed the reviewed transaction message. No transaction was submitted.');
    if(!verifyWalletSignature(signed,p.wallet))throw Error('The returned wallet signature could not be verified. No transaction was submitted.');
    if(currentWallet.current!==p.wallet)throw Error('The connected wallet changed. Reconnect the wallet used for this review.');
    if(p.rehearsal){
     // Deliberately missing the mint signature; discard the wallet signature locally.
     if(verifyAllSignatures(signed))throw Error('Unexpected complete rehearsal signature.');
     signing.current=null;setPrepared(null);setProgress('Wallet signature verified locally. No mint signature, no broadcast, no token created.');return;
    }
    if(!verifyAllSignatures(signed))throw Error('The wallet did not preserve the required mint signature. No transaction was submitted.');
    p.tx=signed;p.signed=true;
   }
   setProgress('Submitting and checking your launch…');
   const result=await api<{launch:Launch}>({action:'submit',launchId:p.id,transaction:transactionWire(p.tx).toString('base64')},apiPath);
   setReview(previous=>previous?{...previous,launch:result.launch}:previous);signing.current=null;setPrepared(null);setProgress('');
  }catch(e){setError(e instanceof Error?e.message:'Wallet check failed.');setProgress('');}finally{lock.current=false;setBusy(false);}
 }
 function edit(){const p=signing.current;if(p?.signed)return;p?.mint?.secretKey.fill(0);signing.current=null;setPrepared(null);setEditingCancelled(true);setError('');setProgress(p&&!p.rehearsal?'You can edit now. The previous attempt must safely expire before another transaction is prepared.':'');}
 const l=review?.launch,verified=l?.status==='VERIFIED',pending=!!l&&!['PREPARING','FAILED','VERIFIED'].includes(l.status),frozen=pending&&!prepared;
 const settings=prepared?.settings??((frozen||verified)?l?.settings:undefined)??{...DEFAULT_LAUNCH_SETTINGS,holderReward:holder,mayhemMode:mayhem};
 const network=prepared?.network??l?.network??review?.network;
 const estimate=prepared?.estimate,estimated=estimate?.estimatedWalletCostLamports??l?.estimatedWalletCostLamports;
 return <Dialog open={open} onOpenChange={v=>{if(!v&&!busy)onClose();}}><DialogContent className="lab-dialog launch-dialog"><div className="eyebrow">SPLICE × PUMP.FUN</div><DialogTitle>{verified?'Launch verified':prepared?'Review your launch':'Launch on Pump.fun'}</DialogTitle><DialogDescription>Choose your launch settings, then review the cost before wallet approval.</DialogDescription>
  <div className="launch-preview"><Artwork image={offspring.image} name={identity.name}/><div><h3>{identity.name}</h3><span>${identity.symbol}</span></div></div>
  {!verified&&!prepared&&(!pending||editingCancelled)&&<fieldset className="launch-settings" disabled={busy||(frozen&&!editingCancelled)}><legend>Launch Settings</legend>
   <label className="launch-toggle"><span>Buy tokens at launch</span><input type="checkbox" checked={buy} onChange={e=>setBuy(e.target.checked)}/></label>
   {buy&&<div className="launch-buy"><label htmlFor="launch-buy-sol">Initial buy · SOL</label><input id="launch-buy-sol" inputMode="decimal" autoComplete="off" value={buyAmount} placeholder="Enter amount" onChange={e=>setBuyAmount(e.target.value)}/><small>0.001–10 SOL. Maximum buy spend includes 1% slippage. Account and network costs are separate.</small></div>}
   <label className="launch-toggle"><span>Holder Rewards <span tabIndex={0} role="img" aria-label="Redirect the coin's creator trading rewards to token holders instead of the creator." title="Redirect the coin's creator trading rewards to token holders instead of the creator.">ⓘ</span></span><input type="checkbox" checked={holder} disabled={busy||(frozen&&!editingCancelled)||!review?.availability?.holderReward} onChange={e=>{setHolder(e.target.checked);setAck(false);}}/></label>
   {!review?.availability?.holderReward&&<small>{review?.availability?.reason??'Checking live availability…'}</small>}
   {holder&&<div className="launch-warning"><p>Holder Rewards changes where creator trading rewards go. Once a coin is created as a Holder Rewards coin, this choice cannot be reversed.</p><label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> I understand and accept this permanent choice.</label></div>}
   <label className="launch-toggle"><span>Mayhem Mode <span tabIndex={0} role="img" aria-label="Adds automated, randomized trading during the token's first 24 hours, subject to Pump's termination conditions." title="Adds automated, randomized trading during the token's first 24 hours, subject to Pump's termination conditions.">ⓘ</span></span><input type="checkbox" checked={mayhem} disabled={busy||(frozen&&!editingCancelled)||!review?.availability?.mayhem} onChange={e=>setMayhem(e.target.checked)}/></label>
   <small>{!review?.availability?.mayhem?(review?.availability?.reason??'Checking live availability…'):'Optional automated, randomized trading during the first 24 hours, subject to Pump’s termination conditions.'} <a href="https://pump.fun/docs/mayhem-mode-disclaimer" target="_blank" rel="noopener noreferrer">About Mayhem</a></small>
  </fieldset>}
  <dl className="launch-facts"><div><dt>Creator / payer</dt><dd className="launch-address">{prepared?.wallet??l?.wallet??walletAddress??'Connect your wallet'}</dd></div><div><dt>Network</dt><dd>{network==='mainnet-beta'?'Solana Mainnet':network==='devnet'?'Solana devnet':'Checking…'}</dd></div><div><dt>Provider</dt><dd>Pump.fun</dd></div><div><dt>Pair</dt><dd>SOL</dd></div>
   {(prepared||frozen||verified)&&<><div><dt>Initial Buy</dt><dd>{sol(settings.initialBuyLamports)} SOL</dd></div><div><dt>Holder Rewards</dt><dd>{settings.holderReward?'On':'Off'}</dd></div><div><dt>Mayhem Mode</dt><dd>{settings.mayhemMode?'On':'Off'}</dd></div><div><dt>Metadata</dt><dd>{prepared?.metadataUri||l?.metadataUri?'IPFS verified':'Checking…'}</dd></div></>}
  </dl>
  {estimated!=null&&<div className="launch-cost"><strong>Estimated wallet spend: ~{sol(estimated)} SOL</strong><p>Account costs: ~{sol(estimate?.accountCostLamports??l?.accountCostLamports??0)} SOL · Network fee: ~{sol(estimate?.networkFeeLamports??l?.networkFeeLamports??0)} SOL</p>{estimate&&<p>Maximum initial buy: {sol(estimate.maxBuyLamports)} SOL (1% slippage). Balance required with a 0.001 SOL safety reserve: {sol(estimate.maxWalletCostLamports)} SOL.</p>}{estimate?.priorityFeeLamports!=null&&<p>Priority fee included above: {sol(estimate.priorityFeeLamports)} SOL · capped at 0.001 SOL.</p>}<small>Estimate only. Network and account costs can change.</small></div>}
  {verified?<><p role="status">{l.network==='devnet'?'Devnet test verified. This is not an official mainnet lineage entry.':'Launch successful. Your offspring is eligible for official lineage.'}</p><p className="launch-address">Mint: {l.mint}</p><div className="launch-links">{l.network==='mainnet-beta'&&<a className="btn btn-primary" href={`https://pump.fun/coin/${l.mint}`} target="_blank" rel="noopener noreferrer">View on Pump.fun</a>}<a className="btn btn-secondary" href={`https://solscan.io/tx/${l.signature}${l.network==='devnet'?'?cluster=devnet':''}`} target="_blank" rel="noopener noreferrer">View on Solscan</a><button className="btn btn-secondary" onClick={()=>void navigator.clipboard.writeText(l.mint)}>Copy Mint Address</button></div></>:<>
   <div className="launch-disclosure"><p>Launch creates a real token on Solana through Pump.fun. Your wallet signs and pays. Splice never receives your wallet private key. Creation is irreversible once confirmed on-chain.</p><p>No Splice launch fee. Pump’s standard trading fee configuration applies. <a href="https://pump.fun/docs/fees" target="_blank" rel="noopener noreferrer">Current Pump fees</a>.</p></div>
   {review&&!review.enabled&&<p className="phase-note">Public launching is disabled. This is a simulation and wallet approval rehearsal only. No transaction will be broadcast.</p>}
   {pending&&!prepared&&<p role="status">{l?.status==='AWAITING_SIGNATURE'?'This attempt is awaiting a wallet signature. If this page was refreshed, it must safely expire before a new attempt can be prepared.':l?.status==='CONFIRMED'?'Transaction confirmed. Verifying the mint, creator and Pump accounts before marking it launched.':l?.errorCode==='RPC_PREFLIGHT'?'The RPC reported a submission or preflight error. We are checking the saved transaction before allowing another attempt.':l?.errorCode==='RPC_UNCERTAIN'?'The RPC did not confirm receipt. We are checking the saved transaction; do not create another launch yet.':'Transaction submitted; waiting for on-chain confirmation. Its settings stay fixed until it confirms or safely expires.'}</p>}
   {l?.status==='FAILED'&&<p className="error-message" role="alert">{l.errorCode==='EXPIRED'?'Launch did not land. The transaction safely expired and no token was created by this attempt. You can review and approve a new attempt.':'The transaction failed on-chain. This attempt did not create a token. Review the launch again to retry.'}</p>}
   {!eligible?<p className="phase-note">Prepared examples cannot be launched. Generate a custom offspring first.</p>:!walletAddress?<button className="btn btn-primary full-width" onClick={onConnect}>Connect Wallet</button>:prepared?<><button className="btn btn-primary full-width" disabled={busy||walletAddress!==prepared.wallet} onClick={()=>void approve()}>{busy?'Checking…':prepared.rehearsal?'Check Wallet Approval · No Broadcast':'Confirm & Launch'}</button>{!prepared.signed&&<button className="btn btn-secondary full-width" disabled={busy} onClick={edit}>Edit Settings</button>}</>:<button className="btn btn-primary full-width" disabled={busy||!review||pending||holder&&!ack} onClick={()=>void prepare()}>{busy?'Simulating…':'Review Launch'}</button>}
  </>}{progress&&<p role="status">{progress}</p>}{error&&<p className="error-message" role="alert">{error}</p>}<button className="btn btn-ghost" disabled={busy} onClick={onClose}>Back to the lab</button>
 </DialogContent></Dialog>;
}

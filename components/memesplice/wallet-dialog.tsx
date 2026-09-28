'use client';
import {useEffect,useState,useRef} from 'react';
import {useWallet} from '@solana/wallet-adapter-react';
import {WalletReadyState} from '@solana/wallet-adapter-base';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
export function WalletDialog({open,onClose,onConnected}:{open:boolean;onClose:()=>void;onConnected?:()=>void}){
 const {wallets,wallet,select,connect,disconnect,connected,connecting,publicKey}=useWallet();const [requested,setRequested]=useState(false),[error,setError]=useState('');const inFlight=useRef(false);
 useEffect(()=>{if(!requested||!wallet||inFlight.current)return;inFlight.current=true;void connect().then(()=>onConnected?onConnected():onClose()).catch(()=>setError('Wallet connection was cancelled or unavailable. Please try again.')).finally(()=>{inFlight.current=false;setRequested(false);});},[requested,wallet,connect,onClose,onConnected]);
 return <Dialog open={open} onOpenChange={value=>{if(!value)onClose();}}><DialogContent className="lab-dialog"><div className="eyebrow">YOUR WALLET · YOUR KEYS</div><DialogTitle>{connected?'Wallet connected':'Connect a Solana wallet'}</DialogTitle><DialogDescription>Choose a wallet to review and sign your launch. Splice never asks for a private key or seed phrase.</DialogDescription>{connected?<><p className="launch-address">{publicKey?.toBase58()}</p><button className="btn btn-secondary" onClick={()=>void disconnect().then(onClose).catch(()=>setError('Wallet disconnection could not complete. Please try again.'))}>Disconnect</button></>:<div className="wallet-options">{wallets.filter(w=>w.readyState!==WalletReadyState.Unsupported).map(w=><button key={w.adapter.name} className="btn btn-secondary" disabled={connecting||requested||w.readyState===WalletReadyState.NotDetected} onClick={()=>{setError('');select(w.adapter.name);setRequested(true);}}>{w.adapter.name}<small>{w.readyState===WalletReadyState.NotDetected?'Install wallet extension':connecting&&wallet?.adapter.name===w.adapter.name?'Connecting…':'Connect'}</small></button>)}</div>}<p className="fine-print">Backpack and other installed Wallet Standard wallets appear automatically. Connecting does not authorize a transaction.</p>{error&&<p role="alert" className="error-message">{error}</p>}</DialogContent></Dialog>;
}




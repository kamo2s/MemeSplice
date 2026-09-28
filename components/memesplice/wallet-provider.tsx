'use client';
import {useMemo,type ReactNode} from 'react';
import {ConnectionProvider,WalletProvider} from '@solana/wallet-adapter-react';
import {PhantomWalletAdapter} from '@solana/wallet-adapter-phantom';
import {SolflareWalletAdapter} from '@solana/wallet-adapter-solflare';
import {WalletAdapterNetwork} from '@solana/wallet-adapter-base';
import {clusterApiUrl} from '@solana/web3.js';
export function SpliceWalletProvider({children,network}:{children:ReactNode;network:'devnet'|'mainnet-beta'}){
 const wallets=useMemo(()=>[new PhantomWalletAdapter(),new SolflareWalletAdapter({network:network==='devnet'?WalletAdapterNetwork.Devnet:WalletAdapterNetwork.Mainnet})],[network]);
 // This public endpoint supplies wallet chain context only. Private RPC credentials stay server-side.
 return <ConnectionProvider endpoint={clusterApiUrl(network)}><WalletProvider wallets={wallets} autoConnect={false} onError={()=>{}}>{children}</WalletProvider></ConnectionProvider>;
}

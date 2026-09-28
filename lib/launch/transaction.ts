import {Transaction,VersionedTransaction,PublicKey,type Signer} from '@solana/web3.js';
import {Buffer} from 'buffer';
import {ed25519} from '@noble/curves/ed25519.js';
export type LaunchTransaction=Transaction|VersionedTransaction;
export const transactionMessage=(tx:LaunchTransaction)=>tx instanceof Transaction?tx.serializeMessage():Buffer.from(tx.message.serialize());
export const transactionWire=(tx:LaunchTransaction)=>tx instanceof Transaction?tx.serialize({requireAllSignatures:false,verifySignatures:false}):Buffer.from(tx.serialize());
export function decodeTransaction(wire:string):LaunchTransaction{
 const bytes=Buffer.from(wire,'base64'),versioned=VersionedTransaction.deserialize(bytes);
 return versioned.version==='legacy'?Transaction.from(bytes):versioned;
}
export function signerKeys(tx:LaunchTransaction){return tx instanceof Transaction?tx.signatures.map(s=>s.publicKey):tx.message.staticAccountKeys.slice(0,tx.message.header.numRequiredSignatures);}
export function signerSignature(tx:LaunchTransaction,index:number){return tx instanceof Transaction?tx.signatures[index]?.signature:tx.signatures[index];}
export function verifyWalletSignature(tx:LaunchTransaction,wallet:string){const index=signerKeys(tx).findIndex(k=>k.toBase58()===wallet),sig=signerSignature(tx,index);return index>=0&&!!sig&&ed25519.verify(sig,transactionMessage(tx),signerKeys(tx)[index].toBytes());}
export function verifyAllSignatures(tx:LaunchTransaction){return signerKeys(tx).every(k=>verifyWalletSignature(tx,k.toBase58()));}
export function signMint(tx:LaunchTransaction,mint:Signer){if(tx instanceof Transaction)tx.partialSign(mint);else tx.sign([mint]);}
// Own the mutable buffer: Keypair.secretKey is a copy, so wiping its getter
// would not wipe the keypair. No private material is persisted or transmitted.
export function createTransientMint():Signer{
 const seed=ed25519.utils.randomSecretKey(),publicBytes=ed25519.getPublicKey(seed),secretKey=new Uint8Array(64);
 secretKey.set(seed);secretKey.set(publicBytes,32);seed.fill(0);
 return {publicKey:new PublicKey(publicBytes),secretKey};
}

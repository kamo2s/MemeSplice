// Official adapter tests with controlled provider doubles, not installed extension approvals.
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module'),{EventEmitter}=require('node:events');
const {Keypair,Transaction,SystemProgram}=require('@solana/web3.js');
test('Phantom and Solflare adapters: explicit connect/sign, reject, account switch, disconnect; no broadcast',async()=>{
 const saved={window:global.window,document:global.document,load:Module._load};let current;
 class Provider extends EventEmitter{
  constructor(){super();this.publicKey=Keypair.generate().publicKey;this.isPhantom=true;this.isSolflare=true;this.isConnected=false;this.connected=false;this.calls={connect:0,sign:0,disconnect:0};current=this;}
  async connect(){this.calls.connect++;if(this.rejectConnect)throw Error('Rejected');this.isConnected=this.connected=true;}
  async disconnect(){this.calls.disconnect++;this.isConnected=this.connected=false;}
  async signTransaction(tx){this.calls.sign++;if(this.rejectSign)throw Error('Rejected');return tx;}
  async sendTransaction(){throw Error('Broadcast forbidden');}
 }
 global.window={location:{href:'http://localhost:5173/',origin:'http://localhost:5173'},isPhantomInstalled:true,addEventListener(){},removeEventListener(){}};
 global.document={readyState:'complete',addEventListener(){},removeEventListener(){}};
 Module._load=function(name,...args){if(name==='@solflare-wallet/sdk')return {__esModule:true,default:Provider};return saved.load.call(this,name,...args);};
 try{
  const {PhantomWalletAdapter}=require('@solana/wallet-adapter-phantom'),{SolflareWalletAdapter}=require('@solana/wallet-adapter-solflare');
  for(const Adapter of [PhantomWalletAdapter,SolflareWalletAdapter]){
   const phantom=new Provider();global.window.phantom={solana:phantom};global.window.solflare=phantom;
   const adapter=new Adapter({network:'devnet'});adapter.on('error',()=>{});assert.equal(adapter.connected,false);assert.equal(phantom.calls.connect,0);
   await adapter.connect();const provider=current;assert.equal(adapter.connected,true);assert.ok(adapter.publicKey.equals(provider.publicKey));assert.equal(provider.calls.connect,1);assert.equal(provider.calls.sign,0);
   const tx=new Transaction({feePayer:provider.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(SystemProgram.transfer({fromPubkey:provider.publicKey,toPubkey:provider.publicKey,lamports:0}));
   provider.rejectSign=true;await assert.rejects(adapter.signTransaction(tx));assert.equal(adapter.connected,true);provider.rejectSign=false;assert.equal(await adapter.signTransaction(tx),tx);assert.equal(provider.calls.sign,2);
   const next=Keypair.generate().publicKey;provider.publicKey=next;provider.emit('accountChanged',next);assert.ok(adapter.publicKey.equals(next));
   await adapter.disconnect();assert.equal(adapter.connected,false);assert.equal(adapter.publicKey,null);assert.equal(provider.calls.disconnect,1);await assert.rejects(adapter.signTransaction(tx));
  }
 }finally{Module._load=saved.load;if(saved.window===undefined)delete global.window;else global.window=saved.window;if(saved.document===undefined)delete global.document;else global.document=saved.document;}
});

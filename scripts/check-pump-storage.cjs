// Explicit live Pinata check. Pins the existing image/metadata only; never builds or sends a transaction.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
if(fs.existsSync('.env.local'))process.loadEnvFile('.env.local');
const [id,journalPath]=process.argv.slice(2);
if(!/^[a-f0-9-]{36}$/.test(id||'')||!journalPath||!path.isAbsolute(journalPath))throw Error('Usage: node scripts/check-pump-storage.cjs OFFSPRING_UUID ABSOLUTE_JOURNAL_PATH');
const cache=new Map();function load(file){if(cache.has(file))return cache.get(file).exports;const mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;cache.set(file,mod);mod.require=name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):require(name);mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return mod.exports;}
async function run(){
 if(!process.env.PINATA_JWT){console.log('PINATA_JWT is not configured; no upload attempted.');process.exitCode=2;return;}
 const {PinataStorage}=load(path.resolve('lib/launch/storage.ts')),{tokenMetadata,identitySchema}=load(path.resolve('lib/launch/validation.ts'));
 const base=process.env.SUPABASE_URL?.replace(/\/$/,''),headers={apikey:process.env.SUPABASE_SECRET_KEY};if(!base?.startsWith('https://')||!headers.apikey)throw Error('CONFIG');
 const result=await fetch(base+'/rest/v1/offspring?id=eq.'+id+'&select=image_storage_path,result',{headers,signal:AbortSignal.timeout(15000)});if(!result.ok)throw Error('DATABASE');const child=(await result.json())[0];if(!child)throw Error('MISSING');
 let journal=fs.existsSync(journalPath)?JSON.parse(fs.readFileSync(journalPath,'utf8')):{offspringId:id,identity:identitySchema.parse({name:child.result.name,symbol:child.result.ticker,description:child.result.lore||child.result.tagline})};if(journal.offspringId!==id)throw Error('JOURNAL');
 const save=()=>fs.writeFileSync(journalPath,JSON.stringify(journal,null,2));
 const adapter=new PinataStorage(process.env.PINATA_JWT);let stages=0;
 if(!journal.imageUri){const image=await fetch(base+'/storage/v1/object/offspring/'+child.image_storage_path.split('/').map(encodeURIComponent).join('/'),{headers,signal:AbortSignal.timeout(20000)});if(!image.ok)throw Error('IMAGE');const bytes=new Uint8Array(await image.arrayBuffer());if(Buffer.from(bytes.slice(0,4)).toString()!=='RIFF'||Buffer.from(bytes.slice(8,12)).toString()!=='WEBP')throw Error('IMAGE');journal.imageUri=await adapter.pin(bytes,'image/webp',id+'-image',!!journal.imageStarted,async()=>{journal.imageStarted=true;save();});save();stages++;}
 if(!journal.metadataUri){journal.metadata??=tokenMetadata(journal.identity,journal.imageUri,process.env.TOKEN_WEBSITE_URL||'',process.env.TOKEN_TWITTER_URL||'');save();journal.metadataUri=await adapter.pin(new TextEncoder().encode(JSON.stringify(journal.metadata)),'application/json',id+'-metadata',!!journal.metadataStarted,async()=>{journal.metadataStarted=true;save();});save();stages++;}
 console.log(JSON.stringify({imagePinned:!!journal.imageUri,metadataPinned:!!journal.metadataUri,stagesPreparedThisRun:stages,transactionsSent:0}));
 const publicResult=await fetch('https://gateway.pinata.cloud/ipfs/'+journal.metadataUri.slice(7),{signal:AbortSignal.timeout(30000)});if(!publicResult.ok)throw Error('PUBLIC_METADATA');const metadata=await publicResult.json();if(JSON.stringify(metadata)!==JSON.stringify(journal.metadata))throw Error('CONTENT');console.log('Public IPFS metadata content verified.');
}
run().catch(error=>{console.log('Storage check did not complete: '+(/^[A-Z_]+$/.test(error.code||error.message)?error.code||error.message:'PROVIDER_UNAVAILABLE')+'. No transaction was sent.');process.exitCode=1;});

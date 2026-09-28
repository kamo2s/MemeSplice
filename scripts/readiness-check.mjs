// Read-only audit: no RPC functions, provider generation, pinning or chain sends.
import {existsSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const env=process.env;
const report={configuration:{},database:{},rpc:{},browserSecretScan:{},warnings:[]};
for(const name of ['SUPABASE_SECRET_KEY','HELIUS_API_KEY','OPENAI_API_KEY','PINATA_JWT','SOLANA_RPC_URL'])report.configuration[name]=!!env[name];
for(const name of ['SESSION_SECRET','GENERATION_WORKER_SECRET'])report.configuration[name]=!!env[name]&&env[name].length>=32;
for(const name of ['PUMP_LAUNCH_ENABLED','PUMP_MAINNET_LAUNCH_ENABLED','AI_SMOKE_TESTS_ENABLED'])report.configuration[name]=env[name]==='true';
report.configuration.network=env.SOLANA_NETWORK||'devnet';
report.configuration.trustedIngressConfigured=!!env.TRUSTED_CLIENT_IP_HEADER;
report.configuration.tokenWebsiteConfigured=!!env.TOKEN_WEBSITE_URL;
report.configuration.lookupTableConfigured=!!env.PUMP_ADDRESS_LOOKUP_TABLE;
report.configuration.walletRehearsalConfigured=!!env.PUMP_WALLET_CHECK_OFFSPRING_ID;
if(!env.TRUSTED_CLIENT_IP_HEADER)report.warnings.push('All users share the unidentified IP quota; configure trusted ingress before public beta.');
if(env.AI_SMOKE_TESTS_ENABLED==='true')report.warnings.push('Private paid smoke route is enabled. Disable for production.');
if(env.PUMP_WALLET_CHECK_OFFSPRING_ID)report.warnings.push('Omit local wallet rehearsal offspring configuration in production.');
const secrets=['SUPABASE_SECRET_KEY','SESSION_SECRET','GENERATION_WORKER_SECRET','HELIUS_API_KEY','OPENAI_API_KEY','PINATA_JWT','SOLANA_RPC_URL'].map(k=>env[k]).filter(v=>v&&v.length>=16);
function files(dir){return readdirSync(dir).flatMap(name=>{const path=join(dir,name);return statSync(path).isDirectory()?files(path):[path];});}
const chunks=existsSync('.next/static')?files('.next/static').filter(p=>/\.(js|map|json)$/.test(p)):[];
report.browserSecretScan={files:chunks.length,filesContainingConfiguredSecret:chunks.filter(p=>{const text=readFileSync(p,'utf8');return secrets.some(s=>text.includes(s));}).length};
async function db(path){const r=await fetch(env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/'+path,{headers:{apikey:env.SUPABASE_SECRET_KEY},signal:AbortSignal.timeout(15000),redirect:'error'});if(!r.ok)throw Error('HTTP_'+r.status);return r.json();}
try{
 const settings=await db('generation_settings?select=enabled,max_per_hour,max_per_day,user_per_hour,max_worker_concurrency,worker_seen_at,ai_paused_until,ai_pause_reason');
 const s=settings[0];report.database.settings={...s,worker_seen_at:undefined,workerHeartbeatAgeSeconds:s?.worker_seen_at?Math.round((Date.now()-Date.parse(s.worker_seen_at))/1000):null};
 const rows=await db('offspring_launches?select=status&limit=10000');report.database.launchesByStatus={};for(const r of rows)report.database.launchesByStatus[r.status]=(report.database.launchesByStatus[r.status]||0)+1;
 const jobs=await db('generation_jobs?status=in.(QUEUED,ANALYZING,SPLICING,GENERATING,FINALIZING)&select=status,lease_expires_at,created_at&limit=10000');
 report.database.activeJobs=jobs.length;report.database.expiredActiveLeases=jobs.filter(j=>j.lease_expires_at&&Date.parse(j.lease_expires_at)<Date.now()).length;
 const lineage=await db('offspring_lineage?network=eq.mainnet-beta&select=offspring_id&limit=10000');report.database.verifiedLineages=lineage.length;
 report.database.connection=true;
}catch(e){report.database.connection=false;report.database.error=/^HTTP_\d+$/.test(e.message)?e.message:'READ_FAILED';}
try{
 const r=await fetch(env.SOLANA_RPC_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getGenesisHash'}),signal:AbortSignal.timeout(15000),redirect:'error'});
 const body=await r.json();report.rpc.mainnetVerified=r.ok&&body.result==='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
}catch{report.rpc.mainnetVerified=false;}
console.log(JSON.stringify(report,null,2));
if(!report.database.connection||!report.rpc.mainnetVerified||report.browserSecretScan.filesContainingConfiguredSecret)process.exitCode=1;

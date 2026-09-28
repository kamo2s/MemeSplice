// Read-only hosted schema probe. Invalid IDs ensure RPC probes cannot mutate real rows.
import {existsSync} from 'node:fs';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const {SUPABASE_URL:base,SUPABASE_SECRET_KEY:key}=process.env;
if(!base?.startsWith('https://')||!key)throw Error('Supabase server settings are missing.');
const report={tables:{},functions:{},configured:{pinata:!!process.env.PINATA_JWT,network:process.env.SOLANA_NETWORK||'devnet',launchEnabled:process.env.PUMP_LAUNCH_ENABLED==='true',mainnetEnabled:process.env.PUMP_MAINNET_LAUNCH_ENABLED==='true'}};
async function request(path,body){const response=await fetch(base.replace(/\/$/,'')+'/rest/v1/'+path,{method:body?'POST':'GET',headers:{apikey:key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});return {status:response.status,body:await response.json().catch(()=>null)};}
for(const name of ['offspring_launches','offspring_launch_assets','offspring_lineage']){const result=await request(name+'?select=*&limit=0');report.tables[name]=result.status===200;}
const missing='00000000-0000-4000-8000-000000000000';
for(const [name,body,expected] of [
 ['splice_begin_launch',{p_session:'phase3-schema-probe',p_offspring:missing,p_wallet:'not-used',p_mint:'not-used',p_network:'devnet',p_identity:{}},'NOT_OWNED'],
 ['splice_launch_lease',{p_offspring:missing,p_token:missing},null],
 ['splice_verify_launch',{p_id:missing,p_signature:'not-used'},'INVALID_LAUNCH']
]){const result=await request('rpc/'+name,body);report.functions[name]=expected?result.body?.message===expected:result.status===200&&Array.isArray(result.body)&&result.body.length===0;}
const limits=await request('generation_settings?select=enabled,max_per_hour,max_per_day,user_per_hour,max_worker_concurrency');report.generationSettings=limits.status===200?limits.body:'Unavailable';
const launches=await request('offspring_launches?select=status');report.launchRecords=Array.isArray(launches.body)?launches.body.length:null;
console.log(JSON.stringify(report,null,2));if(!Object.values(report.tables).every(Boolean)||!Object.values(report.functions).every(Boolean))process.exitCode=1;

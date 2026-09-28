// Explicit operator command. Never run on each request/instance startup.
import {existsSync} from 'node:fs';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const {SUPABASE_URL:base,SUPABASE_SECRET_KEY:key}=process.env;
if(!base?.startsWith('https://')||!key)throw new Error('Configure SUPABASE_URL and SUPABASE_SECRET_KEY first.');
function limit(name,fallback,min=0,max=100000){const value=process.env[name]?.trim();const n=value?Number(value):fallback;if(!Number.isInteger(n)||n<min||n>max)throw new Error('Invalid '+name);return n;}
const body={enabled:false,max_worker_concurrency:limit('MAX_AI_WORKER_CONCURRENCY',25,1,100),max_per_hour:limit('MAX_CUSTOM_GENERATIONS_PER_HOUR',3000),max_per_day:limit('MAX_CUSTOM_GENERATIONS_PER_DAY',9000),user_per_hour:limit('MAX_CUSTOM_GENERATIONS_PER_USER_HOUR',3,1,100)};
const response=await fetch(base.replace(/\/$/,'')+'/rest/v1/generation_settings?id=eq.true',{method:'PATCH',headers:{apikey:key,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
if(!response.ok)throw new Error('Could not update shared limits. Apply the migration and check credentials.');
const rows=await response.json();
if(rows.length!==1||Object.entries(body).some(([name,value])=>rows[0][name]!==value))throw new Error('Shared limits were not persisted as requested.');
console.log('Shared settings verified:',JSON.stringify(body));

// Aggregate private usage records; never prints API keys, inputs or raw provider replies.
import {existsSync} from 'node:fs';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const base=process.env.SUPABASE_URL?.replace(/\/$/,'');
if(!base||!process.env.SUPABASE_SECRET_KEY)throw Error('Supabase is required');
async function read(path){const r=await fetch(base+'/rest/v1/'+path,{headers:{apikey:process.env.SUPABASE_SECRET_KEY},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Cost query HTTP '+r.status);return r.json();}
const runs=await read('ai_runs?select=job_id,error_category,generation_jobs(status)&order=started_at.desc,job_id&limit=1000');
// Fetch calls for exactly these runs in small chunks, avoiding the API's default row cap.
const calls=[];
for(let i=0;i<runs.length;i+=100){const ids=runs.slice(i,i+100).map(r=>r.job_id).join(',');calls.push(...await read(`ai_calls?job_id=in.(${ids})&select=job_id,stage,state,estimated_usd,error_category&limit=400`));}
const known=calls.filter(c=>c.estimated_usd!==null),sum=items=>items.reduce((n,c)=>n+Number(c.estimated_usd),0);
const completeIds=runs.map(r=>r.job_id).filter(id=>calls.some(c=>c.job_id===id)&&calls.filter(c=>c.job_id===id).every(c=>c.estimated_usd!==null));
const totals=completeIds.map(id=>sum(known.filter(c=>c.job_id===id))).sort((a,b)=>a-b);
console.log(JSON.stringify({sampleLimit:1000,jobs:runs.length,failures:runs.filter(r=>r.error_category||r.generation_jobs?.status==='FAILED').length,unknownCostCalls:calls.filter(c=>c.estimated_usd===null).length,uncertainCalls:calls.filter(c=>c.state==='STARTED'||c.error_category==='PROVIDER_UNCERTAIN').length,estimatedTextUSD:sum(known.filter(c=>c.stage!=='image')),estimatedImageUSD:sum(known.filter(c=>c.stage==='image')),estimatedKnownTotalUSD:sum(known),fullyMeasuredJobs:totals.length,averageUSD:totals.length?totals.reduce((a,b)=>a+b,0)/totals.length:null,medianUSD:totals.length?(totals[Math.floor((totals.length-1)/2)]+totals[Math.floor(totals.length/2)])/2:null,note:'Most recent 1000 runs. Estimates from reported usage, not billing totals. Missing usage is unknown, never zero. The 9000/day launch count cap is not a dollar billing cap. Recalculate target daily budget / measured average after more data.'},null,2));


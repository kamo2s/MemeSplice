// Developer only. Default is a dry plan; paid execution requires two explicit gates.
import {existsSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const pairs=[['BONK','WIF'],['POPCAT','FARTCOIN'],['BONK','POPCAT']];
const mints={BONK:'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',WIF:'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',POPCAT:'7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',FARTCOIN:'9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump'};
if(!process.argv.includes('--run')){console.log('DRY RUN: 3 paid jobs, one image each, sequentially: '+pairs.map(p=>p.join(' x ')).join(', '));console.log('Set OPENAI_API_KEY and AI_SMOKE_TESTS_ENABLED=true in .env.local, restart server, then use --run --confirm-paid. Public enabled must stay false.');process.exit(0);}
if(!process.argv.includes('--confirm-paid')||process.env.AI_SMOKE_TESTS_ENABLED!=='true'||!process.env.OPENAI_API_KEY)throw Error('Explicit paid confirmation, smoke switch and key required.');
const base=process.env.AI_SMOKE_APP_URL||'http://localhost:5173';const url=new URL(base);
if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('Use HTTPS or loopback');
async function request(body,id){const r=await fetch(base+'/api/generation/smoke'+(id?'?id='+id:''),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.GENERATION_WORKER_SECRET,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(480000)});if(!r.ok)throw Error('Smoke endpoint HTTP '+r.status);return r.json();}
const preflight=await request();if(!preflight.available||preflight.settings?.[0]?.enabled!==false)throw Error('Provider unavailable or public generation is enabled');
const sessionId=randomUUID(),results=[];
for(const [a,b] of pairs){
 const job=await request({action:'enqueue',sessionId,requestId:randomUUID(),parentA:mints[a],parentB:mints[b]});if(!job.id)throw Error('No job was created');
 console.log('Queued smoke job '+job.id+' for '+a+' x '+b);
 const outcome=await request({action:'run',id:job.id});if(outcome.status!=='COMPLETE')throw Error('Job did not complete; inspect '+job.id+' before any further paid test. No automatic retry.');
 const result=await request(null,job.id);results.push(result);writeFileSync('smoke-results.json',JSON.stringify(results,null,2));console.log('Completed '+job.id+'; inspect its saved result and image.');
}
console.log('STOP: 3 smoke jobs complete. Inspect images and AI usage before enabling or further paid tests.');

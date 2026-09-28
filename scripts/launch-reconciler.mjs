import {existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function createLaunchReconciler({url,key,fetcher=fetch,log=console.log,report=console.error}){
 let cursor=null,stopping=false,timer,active;
 async function tick(){
  try{
   const target=new URL(url);if(cursor)target.searchParams.set('after',cursor);
   const response=await fetcher(target,{method:'POST',headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(480000),redirect:'error'});
   if(!response.ok)throw Error('Unavailable');
   const result=await response.json();
   if(!Number.isInteger(result.checked)||!Number.isInteger(result.errors)||!(result.nextCursor===null||typeof result.nextCursor==='string'&&/^[a-f0-9-]{36}$/i.test(result.nextCursor)))throw Error('Invalid response');
   cursor=result.nextCursor;
   if(result.checked)log('Launch reconciliation:',{checked:result.checked,verified:result.verified,failed:result.failed,errors:result.errors});
   if(result.errors)report('Some launch checks failed; existing attempts remain protected and will be checked again.');
  }catch{report('Launch reconciliation unavailable; no transaction submitted or retried.');}
  finally{if(!stopping)timer=setTimeout(()=>{active=tick();},15000);}
 }
 return {start(){active=tick();return active;},async stop(){stopping=true;clearTimeout(timer);await active;}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(existsSync('.env.local'))process.loadEnvFile('.env.local');
 const key=process.env.GENERATION_WORKER_SECRET;
 const url=process.env.LAUNCH_RECONCILER_URL||'http://localhost:5173/api/launch/reconcile';
 const parsed=new URL(url);
 if(!key||key.length<32)throw Error('Set a 32+ character GENERATION_WORKER_SECRET.');
 if(parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&['localhost','127.0.0.1'].includes(parsed.hostname)))throw Error('Reconciler URL must use HTTPS or loopback.');
 const worker=createLaunchReconciler({url,key});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void worker.stop();});
 await worker.start();
 console.log('Launch reconciler running; checks existing attempts only, never broadcasts.');
}

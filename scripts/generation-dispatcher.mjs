import {existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {dispatchPolicy,WORKER_REQUEST_TIMEOUT_MS} from './generation-dispatch-policy.mjs';
import {validateWorkerEndpoint} from './worker-endpoint.mjs';

// Exported lifecycle allows scheduler tests without paid calls.
export function createDispatcher({url,key,fetcher=fetch,log=console.log,report=console.error}){
  let inFlight=0,stopping=false,policy=null,timer,refreshTimer,enabled=false,paused=true,queued=0;
  const active=new Set(),headers={Authorization:'Bearer '+key};
  async function refresh(){
    try{
      const response=await fetcher(url,{headers,signal:AbortSignal.timeout(10000),cache:'no-store',redirect:'error'});
      if(!response.ok)throw Error('Worker health unavailable');
      const body=await response.json();
      if(body.available!==true||typeof body.enabled!=='boolean'||typeof body.paused!=='boolean')throw Error('Worker not ready');
      policy=dispatchPolicy(body.max_worker_concurrency);enabled=body.enabled;paused=body.paused;
      queued=Number.isInteger(body.queued)&&body.queued>=0?body.queued:0;
    }catch{policy=null;enabled=false;report('Worker health unavailable; new dispatch paused.');}
    if(!stopping)refreshTimer=setTimeout(()=>void refresh(),3000);
  }
  async function run(){
    try{
      const response=await fetcher(url,{method:'POST',headers,signal:AbortSignal.timeout(WORKER_REQUEST_TIMEOUT_MS),redirect:'error'});
      if(!response.ok){report('Worker request unavailable:',response.status);return;}
      const body=await response.json();
      if(body.reason==='AI_NOT_CONNECTED'){policy=null;enabled=false;}
      if(body.started)log('Worker completed:',body.status);
    }catch{report('Worker response uncertain; job is never resubmitted. Inspect its ledger.');}
    finally{inFlight--;}
  }
  function pump(){
    if(stopping)return;
    if(policy&&enabled&&!paused){
      const free=Math.min(policy.maxInFlight-inFlight,queued);
      for(let i=0;i<free;i++){
        queued--;
        inFlight++;
        const task=run();active.add(task);void task.finally(()=>active.delete(task));
      }
    }
    timer=setTimeout(pump,policy?.idlePollMs??1000);
  }
  return {
    async start(){await refresh();pump();},
    async stop(){stopping=true;clearTimeout(timer);clearTimeout(refreshTimer);await Promise.allSettled([...active]);},
    state:()=>({inFlight,enabled,paused,concurrency:policy?.maxInFlight??null})
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(existsSync('.env.local'))process.loadEnvFile('.env.local');
  const key=process.env.GENERATION_WORKER_SECRET,url=process.env.GENERATION_WORKER_URL||'http://localhost:5173/api/generation/worker';
  if(!key||key.length<32)throw new Error('Set a 32+ character GENERATION_WORKER_SECRET.');
  validateWorkerEndpoint(url);
  const dispatcher=createDispatcher({url,key});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void dispatcher.stop();});
  await dispatcher.start();
  console.log('Dispatcher running; shared database settings authorize every start.');
}

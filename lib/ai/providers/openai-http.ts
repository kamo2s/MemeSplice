import {AIError} from '../types';
export async function openAIRequest(key:string,path:string,body:BodyInit,timeout:number,fetcher:typeof fetch=fetch,json=true){
  let response:Response;
  try{response=await fetcher('https://api.openai.com/v1/'+path,{method:'POST',headers:{Authorization:'Bearer '+key,...(json?{'Content-Type':'application/json'}:{})},body,signal:AbortSignal.timeout(timeout),redirect:'error'});}catch{throw new AIError('PROVIDER_UNCERTAIN');}
  const requestId=response.headers.get('x-request-id');
  if(!response.ok){const raw=response.headers.get('retry-after');const seconds=raw&&/^\d+$/.test(raw)?Number(raw):raw?Math.ceil((Date.parse(raw)-Date.now())/1000):60;throw new AIError([401,403].includes(response.status)?'PROVIDER_AUTH':response.status===429?'PROVIDER_RATE_LIMIT':'PROVIDER_REJECTED',requestId,Number.isFinite(seconds)?Math.max(1,Math.min(Math.ceil(seconds),2147483647)):60);}
  // Bound the base64 response as well as the decoded image. No automatic retries.
  const reader=response.body?.getReader();if(!reader)throw new AIError('INVALID_PROVIDER_RESPONSE',requestId);
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>24*1024*1024){await reader.cancel();throw new Error();}chunks.push(value);}return {data:JSON.parse(Buffer.concat(chunks).toString('utf8')),requestId};}
  catch{throw new AIError('INVALID_PROVIDER_RESPONSE',requestId);}
}

import { TokenServiceError } from "../errors";
export type Fetcher = typeof fetch;
const unavailable="Token search is temporarily unavailable. Please try again.";
const transientCodes=new Set(['ECONNRESET','ETIMEDOUT','EAI_AGAIN','ECONNREFUSED','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_SOCKET']);
// Never log raw errors, URLs or bodies: provider URLs may contain credentials.
export async function providerJson(fetcher: Fetcher, url: string, init: RequestInit = {}, timeoutMs = 8000, retryTransient=false): Promise<unknown> {
  const provider=new URL(url).hostname==='api.dexscreener.com'?'dexscreener':'metadata';
  for(let attempt=0;attempt<(retryTransient?2:1);attempt++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    let retry=false;
    try{
      const response=await fetcher(url,{...init,cache:'no-store',redirect:'error',signal:controller.signal});
      if(!response.ok)console.warn('[token-provider]',JSON.stringify({provider,attempt:attempt+1,status:response.status}));
      if(response.status===429){
        const raw=response.headers.get('Retry-After'),seconds=raw?(/^\d+$/.test(raw)?Number(raw):Math.ceil((Date.parse(raw)-Date.now())/1000)):60;
        throw new TokenServiceError('BUSY','Search is busy right now. Try a popular token or paste its contract address.',429,Number.isFinite(seconds)?Math.min(86400,Math.max(1,seconds)):60);
      }
      if(!response.ok){retry=[502,503,504].includes(response.status);throw new TokenServiceError('PROVIDER_FAILURE',unavailable);}
      try{return await response.json();}catch(error){
        if(controller.signal.aborted||!(error instanceof SyntaxError))throw error;
        throw new TokenServiceError('MALFORMED_RESPONSE','The token provider returned an invalid response. Please try again.');
      }
    }catch(error){
      let safe:TokenServiceError;
      if(error instanceof TokenServiceError)safe=error;
      else{
        const code=(error as {cause?:{code?:string};code?:string})?.cause?.code??(error as {code?:string})?.code;
        retry=controller.signal.aborted||!!code&&transientCodes.has(code);
        console.warn('[token-provider]',JSON.stringify({provider,attempt:attempt+1,error:controller.signal.aborted?'TIMEOUT':code&&transientCodes.has(code)?code:'NETWORK_FAILURE'}));
        safe=new TokenServiceError(controller.signal.aborted?'TIMEOUT':'PROVIDER_FAILURE',unavailable,controller.signal.aborted?504:502);
      }
      if(!retryTransient||attempt!==0||!retry)throw safe;
    }finally{clearTimeout(timer);}
    await new Promise(resolve=>setTimeout(resolve,300+Math.floor(Math.random()*201)));
  }
  throw new TokenServiceError('PROVIDER_FAILURE',unavailable);
}

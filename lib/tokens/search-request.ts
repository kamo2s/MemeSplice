// A cancelled/obsolete request must never publish over the current query.
export async function settleSearchRequest<T>(request:()=>Promise<T>,signal:AbortSignal,isCurrent:()=>boolean,success:(value:T)=>void,failure:(error:unknown)=>void){
  try{const value=await request();if(isCurrent()&&!signal.aborted)success(value);}
  catch(error){if(isCurrent()&&(!signal.aborted||signal.reason==='timeout'))failure(error);}
}

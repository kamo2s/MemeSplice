// Railway encrypts its private mesh; only this application's web service is
// permitted over private HTTP, and only inside a Railway deployment.
export function validateWorkerEndpoint(value,railwayEnvironment=process.env.RAILWAY_ENVIRONMENT_ID){
 const url=new URL(value);
 const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 const railway=!!railwayEnvironment&&url.hostname==='splice-web.railway.internal';
 if(url.username||url.password||url.hash||url.protocol!=='https:'&&!(url.protocol==='http:'&&(loopback||railway)))throw new Error('Worker URL must use HTTPS, loopback, or the splice-web Railway private endpoint.');
 return url;
}

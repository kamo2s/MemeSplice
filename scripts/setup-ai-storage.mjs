import {existsSync} from 'node:fs';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const base=process.env.SUPABASE_URL?.replace(/\/$/,''),key=process.env.SUPABASE_SECRET_KEY;
if(!base?.startsWith('https://')||!key)throw Error('Supabase configuration required');
const headers={apikey:key,'Content-Type':'application/json'};
let r=await fetch(base+'/storage/v1/bucket/offspring',{headers,signal:AbortSignal.timeout(15000)});
if(r.status===400||r.status===404){
 const error=await r.json();if(!['404','NoSuchBucket'].includes(String(error.statusCode??error.code)))throw Error('Bucket read HTTP '+r.status);
 r=await fetch(base+'/storage/v1/bucket',{method:'POST',headers,body:JSON.stringify({id:'offspring',name:'offspring',public:true,file_size_limit:5242880,allowed_mime_types:['image/webp']}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Bucket creation HTTP '+r.status);
 r=await fetch(base+'/storage/v1/bucket/offspring',{headers,signal:AbortSignal.timeout(15000)});
}
if(!r.ok)throw Error('Bucket read HTTP '+r.status);const bucket=await r.json();
if(bucket.public!==true||Number(bucket.file_size_limit)!==5242880||bucket.allowed_mime_types?.length!==1||bucket.allowed_mime_types[0]!=='image/webp')throw Error('Existing bucket configuration differs; inspect it before changing access');
console.log('Verified offspring bucket: public artwork URLs, 5 MB maximum, WebP only. Uploads require service credentials.');

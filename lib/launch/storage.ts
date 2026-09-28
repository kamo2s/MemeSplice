import {createHash} from 'node:crypto';
import {LaunchError,metadataUri} from './validation';
export interface MetadataStorage {pin(bytes:Uint8Array,type:string,key:string,alreadyStarted:boolean,beforeUpload:()=>Promise<void>):Promise<string>}
export class PinataStorage implements MetadataStorage{
 constructor(private jwt:string,private fetcher:typeof fetch=fetch){}
 async pin(bytes:Uint8Array,type:string,key:string,alreadyStarted:boolean,beforeUpload:()=>Promise<void>){
  if(!this.jwt)throw new LaunchError('METADATA',503);
  const name=`memesplice-${key}-${createHash('sha256').update(bytes).digest('hex')}`;
  const headers={Authorization:'Bearer '+this.jwt};
  // Recover completed pins after a lost HTTP/DB response before considering an upload.
  const found=await this.fetcher('https://api.pinata.cloud/v3/files/public?name='+encodeURIComponent(name)+'&limit=10',{headers,signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!found.ok)throw new LaunchError('METADATA',503);
  const listing=await found.json() as {data?:{files?:{name:string;cid:string}[]}};const existing=listing.data?.files?.find((f:{name:string;cid:string})=>f.name===name);
  if(existing)return metadataUri.parse('ipfs://'+existing.cid);
  if(alreadyStarted)throw new LaunchError('METADATA_UNCERTAIN',409);
  await beforeUpload();
  const form=new FormData();form.append('network','public');form.append('name',name);form.append('file',new Blob([new Uint8Array(bytes)],{type}),type==='image/webp'?'offspring.webp':'metadata.json');
  try{const response=await this.fetcher('https://uploads.pinata.cloud/v3/files',{method:'POST',headers,body:form,signal:AbortSignal.timeout(60000),redirect:'error'});if(!response.ok)throw Error();const body=await response.json() as {data:{cid:string}};return metadataUri.parse('ipfs://'+body.data.cid);}
  catch{throw new LaunchError('METADATA_UNCERTAIN',503);}
 }
}


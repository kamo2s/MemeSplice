import type {Concept,ParentProfile,ProviderResult} from '../types';
export interface AIStore{
 begin(config:unknown):Promise<boolean>;reserve(stage:string,model:string):Promise<boolean>;
 recordCall(stage:string,result:Omit<ProviderResult<unknown>,'value'>|null,cost:number|null,error?:string):Promise<void>;
 recordRun(patch:Record<string,unknown>):Promise<void>;
 profile(mint:string,fingerprint:string,version:string):Promise<unknown|null>;
 saveProfile(mint:string,fingerprint:string,version:string,profile:ParentProfile):Promise<void>;
 lockProfile(key:string):Promise<string|null>;unlockProfile(key:string,token:string):Promise<void>;
 previous():Promise<Partial<Concept>|null>;
 upload(bytes:Buffer):Promise<string>;pause(reason:string,seconds:number):Promise<void>;
}

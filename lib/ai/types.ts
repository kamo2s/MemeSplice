import type {z} from 'zod';
import type {parentSchema,conceptSchema} from './schemas';
export type ParentProfile=z.infer<typeof parentSchema>;
export type Concept=z.infer<typeof conceptSchema>;
export type PreparedImage={bytes:Buffer;mime:'image/webp';width:number;height:number;fingerprint:string};
export type Prompt={version:string;system:string;data:unknown};
export type ProviderResult<T>={value:T;usage:Record<string,unknown>|null;requestId:string|null;responseId:string|null};
export interface TextProvider {generate(prompt:Prompt,schema:Record<string,unknown>,image:PreparedImage|null):Promise<ProviderResult<unknown>>;}
export interface ImageProvider {generate(prompt:string,references:PreparedImage[]):Promise<ProviderResult<Buffer>>;}
export class AIError extends Error {constructor(public category:string,public requestId:string|null=null,public retryAfter=60,public usage:Record<string,unknown>|null=null,public responseId:string|null=null){super(category);}}

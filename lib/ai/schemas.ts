import {z} from 'zod';
import {offspringName,offspringTicker,offspringLore,IDENTITY_LIMITS} from '../memesplice/identity';
const short=z.string().trim().min(1).max(200),list=z.array(short).max(8);
export const parentSchema=z.object({subject:short,speciesOrObject:short,visualTraits:list,primaryColors:list,accessories:list,expression:short,personalityTraits:list,memeTraits:list,artStyle:short,distinctiveFeatures:list}).strict();
export const conceptSchema=z.object({name:offspringName,ticker:offspringTicker.refine(value=>value===value.toUpperCase(),'Ticker must be uppercase'),tagline:z.string().min(1).max(180),lore:offspringLore,traits:list.min(3).max(5),parentAInfluencePercent:z.number().int().min(1).max(98),parentBInfluencePercent:z.number().int().min(1).max(98),mutationPercent:z.number().int().min(0).max(98),visualDirection:z.string().min(1).max(1000),inheritedFromParentA:list.min(1),inheritedFromParentB:list.min(1),newMutationTraits:list,imagePromptDetails:z.string().min(1).max(1500)}).strict().refine(v=>v.parentAInfluencePercent+v.parentBInfluencePercent+v.mutationPercent===100,'DNA must total 100');
// Use supported pattern/array/numeric constraints in the provider schema too.
// Cross-field DNA totals and UTF-8 byte limits remain authoritative locally.
const text=(max:number)=>({type:'string',pattern:`^[\\s\\S]{1,${max}}$`});
const strings=(names:string[])=>Object.fromEntries(names.map(name=>[name,text(200)]));
const array=(min=0,max=8)=>({type:'array',items:text(200),minItems:min,maxItems:max});
const arrays=(names:string[])=>Object.fromEntries(names.map(name=>[name,array()]));
const object=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const parentJsonSchema=object({...strings(['subject','speciesOrObject','expression','artStyle']),...arrays(['visualTraits','primaryColors','accessories','personalityTraits','memeTraits','distinctiveFeatures'])});
export const conceptJsonSchema=object({
 name:{...text(IDENTITY_LIMITS.nameBytes),description:'Short name, at most 32 UTF-8 bytes, including spaces.'},
 ticker:{type:'string',pattern:`^[A-Z0-9]{1,${IDENTITY_LIMITS.ticker}}$`},tagline:text(180),lore:text(IDENTITY_LIMITS.lore),
 visualDirection:text(1000),imagePromptDetails:text(1500),traits:array(3,5),inheritedFromParentA:array(1),inheritedFromParentB:array(1),newMutationTraits:array(),
 parentAInfluencePercent:{type:'integer',minimum:1,maximum:98},parentBInfluencePercent:{type:'integer',minimum:1,maximum:98},mutationPercent:{type:'integer',minimum:0,maximum:98},
});

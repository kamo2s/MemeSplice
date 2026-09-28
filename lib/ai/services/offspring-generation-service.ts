import {createHash} from 'node:crypto';
import type {Coin,Offspring} from '../../memesplice/types';
import type {AIConfig} from '../config';
import {AIError,type TextProvider,type ImageProvider,type ProviderResult,type PreparedImage,type ParentProfile} from '../types';
import {parentSchema,conceptSchema,parentJsonSchema,conceptJsonSchema} from '../schemas';
import {parentPrompt,version as parentVersion} from '../prompts/parent-analysis';
import {conceptPrompt,version as conceptVersion} from '../prompts/offspring-concept';
import {imagePrompt,version as imageVersion} from '../prompts/offspring-image';
import {estimateCost,pricingVersion} from '../pricing';
import type {AIStore} from './store';
import {prepareParent,finalImage} from './image-preparation-service';
export class OffspringGenerationService{
 constructor(private config:AIConfig,private text:TextProvider,private image:ImageProvider,private store:AIStore,private prepare=prepareParent,private finishImage=finalImage){}
 async generate(parents:[Coin,Coin],jobId:string,onStage:(stage:'SPLICING'|'GENERATING'|'FINALIZING')=>Promise<void>):Promise<Offspring>{
  const cfg=this.config,start=Date.now();let stage='ANALYZING';
  if(cfg.parentVersion!==parentVersion||cfg.conceptVersion!==conceptVersion||cfg.imageVersion!==imageVersion)throw new AIError('UNKNOWN_PROMPT_VERSION');
  const recorded={provider:cfg.provider,textModel:cfg.textModel,imageModel:cfg.imageModel,imageQuality:cfg.quality,parentPromptVersion:parentVersion,conceptPromptVersion:conceptVersion,imagePromptVersion:imageVersion,pricingVersion};
  if(!await this.store.begin(recorded))throw new AIError('JOB_ALREADY_STARTED');
  const paid=async<T>(callStage:string,model:string,run:()=>Promise<ProviderResult<T>>):Promise<T>=>{
    if(!await this.store.reserve(callStage,model))throw new AIError('PAID_CALL_ALREADY_RESERVED_OR_LEASE_LOST');
    let result:ProviderResult<T>;
    try{result=await run();}catch(error){
      const safe=error instanceof AIError?error:new AIError('PROVIDER_UNCERTAIN');
      if(['PROVIDER_AUTH','PROVIDER_RATE_LIMIT'].includes(safe.category))await this.store.pause(safe.category,safe.retryAfter);
      await this.store.recordCall(callStage,{usage:safe.usage,requestId:safe.requestId,responseId:safe.responseId},estimateCost(model,safe.usage,callStage==='image'),safe.category);
      throw safe;
    }
    await this.store.recordCall(callStage,result,estimateCost(model,result.usage,callStage==='image'));return result.value;
  };
  try{
    const references=await Promise.all(parents.map(parent=>this.prepare(parent,cfg)));
    await this.store.recordRun({references_info:references.map(image=>({visualReferenceAvailable:!!image,width:image?.width??null,height:image?.height??null,bytes:image?.bytes.length??0,fingerprint:image?.fingerprint??null}))});
    const analyze=async(parent:Coin,reference:PreparedImage|null,index:number):Promise<ParentProfile>=>{
      const fingerprint=createHash('sha256').update(JSON.stringify({mint:parent.contractAddress,name:parent.name,ticker:parent.ticker,metadata:parent.token?.metadataUri??null,artwork:reference?.fingerprint??'unavailable',model:cfg.textModel})).digest('hex');
      const read=()=>this.store.profile(parent.contractAddress,fingerprint,parentVersion);
      const cached=await read();if(cached)return parentSchema.parse(cached);
      const lockKey=createHash('sha256').update(parent.contractAddress+fingerprint+parentVersion).digest('hex'),lease=await this.store.lockProfile(lockKey);
      if(!lease){for(let i=0;i<20;i++){await new Promise(resolve=>setTimeout(resolve,500));const found=await read();if(found)return parentSchema.parse(found);}throw new AIError('PARENT_ANALYSIS_BUSY');}
      try{
        const found=await read();if(found)return parentSchema.parse(found);
        const raw=await paid(index===0?'parent_a':'parent_b',cfg.textModel,()=>this.text.generate(parentPrompt(parent,!!reference),parentJsonSchema,reference));
        const profile=parentSchema.parse(typeof raw==='string'?JSON.parse(raw):raw);
        await this.store.saveProfile(parent.contractAddress,fingerprint,parentVersion,profile);return profile;
      }finally{await this.store.unlockProfile(lockKey,lease).catch(()=>{});}
    };
    const profiles:[ParentProfile,ParentProfile]=[await analyze(parents[0],references[0],0),await analyze(parents[1],references[1],1)];
    stage='SPLICING';await onStage('SPLICING');
    const previous=await this.store.previous();
    const raw=await paid('concept',cfg.textModel,()=>this.text.generate(conceptPrompt(parents,profiles,previous),conceptJsonSchema,null));
    const concept=conceptSchema.parse(typeof raw==='string'?JSON.parse(raw):raw);
    if(previous&&previous.name?.toLowerCase()===concept.name.toLowerCase())throw new AIError('MUTATION_NOT_DISTINCT');
    await this.store.recordRun({concept});
    stage='GENERATING';await onStage('GENERATING');
    const available=references.filter((r):r is PreparedImage=>!!r),slots=references.flatMap((r,i)=>r?[i===0?'Parent A':'Parent B']:[]);
    const bytes=await paid('image',cfg.imageModel,()=>this.image.generate(imagePrompt(profiles,concept,slots),available));
    stage='FINALIZING';await onStage('FINALIZING');
    const url=await this.store.upload(await this.finishImage(bytes));
    const createdAt=new Date().toISOString();
    return {id:jobId,generationJobId:jobId,createdAt,name:concept.name,ticker:concept.ticker,image:{atlas:'offspring',index:0,url},tagline:concept.tagline,lore:concept.lore,personalityTraits:concept.traits,parentAInfluence:concept.parentAInfluencePercent,parentBInfluence:concept.parentBInfluencePercent,mutationInfluence:concept.mutationPercent,generation:Math.max(...parents.map(p=>p.generation??0))+1,recommended:false,parents,descendants:0,inheritedTraits:[concept.inheritedFromParentA.join(', '),concept.inheritedFromParentB.join(', ')],status:'draft',interpretation:Math.abs(concept.parentAInfluencePercent-concept.parentBInfluencePercent)<15?'balanced':concept.parentAInfluencePercent>concept.parentBInfluencePercent?'parent-a':'parent-b',launchedAt:null,source:'custom'};
  }catch(error){
    const category=error instanceof AIError?error.category:stage==='FINALIZING'?'STORAGE_OR_IMAGE_VALIDATION_FAILED':'INVALID_OUTPUT_OR_BACKEND_FAILURE';
    await this.store.recordRun({failure_stage:stage,error_category:category,completed_at:new Date().toISOString(),duration_ms:Date.now()-start}).catch(()=>{console.error('[ai] diagnostic persistence failed',jobId,stage);});
    throw new AIError(category);
  }
 }
}

import 'server-only';
import type {GenerationProvider} from '../generation/provider';
import {aiConfig} from './config';
import {OpenAITextProvider} from './providers/openai-text-provider';
import {OpenAIImageProvider} from './providers/openai-image-provider';
import {SupabaseAIStore} from './services/supabase-store';
import {OffspringGenerationService} from './services/offspring-generation-service';
export const realGenerationProvider:GenerationProvider={
 get available(){try{return !!aiConfig().apiKey;}catch{return false;}},
 async generate(parents,options){
   const config=aiConfig();if(!config.apiKey||!options.leaseToken)throw new Error('AI_NOT_CONNECTED');
   const service=new OffspringGenerationService(config,new OpenAITextProvider(config.apiKey,config.textModel),new OpenAIImageProvider(config.apiKey,config.imageModel),new SupabaseAIStore(options.jobId,options.leaseToken,options.previousJobId,options.previousInstantId));
   return service.generate(parents,options.jobId,options.onStage);
 }
};

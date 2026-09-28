import type {Offspring,Coin} from "../memesplice/types";
export const lowCostPolicy={offspringCount:1,imageCount:1,imageQuality:"low",imageMaxEdge:512,imageMaxBytes:150000,imageFormat:"webp",streamPartialImages:false,automaticRetries:0,textModelTier:"lowest-cost-suitable",finalRenderUpgrade:false} as const;
export interface GenerationProvider {
  available:boolean;
  generate(parents:[Coin,Coin],options:{jobId:string;leaseToken?:string;previousJobId?:string|null;previousInstantId?:string|null;policy:typeof lowCostPolicy;onStage:(stage:"SPLICING"|"GENERATING"|"FINALIZING")=>Promise<void>}):Promise<Offspring>;
}
// Disconnected fixture retained for queue tests. Production uses lib/ai/generation-provider.ts.
export const generationProvider:GenerationProvider={available:false,async generate(){throw new Error("AI_NOT_CONNECTED");}};

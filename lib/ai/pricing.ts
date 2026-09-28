// USD per million tokens; verified 2026-09-27 against official model pages.
// Estimates are not invoices. Unknown models/usage remain null, never free.
export const pricingVersion='openai-2026-09-27';
export const prices:Record<string,{input:number;cached:number;output:number;imageInput?:number}>={
  'gpt-4.1-mini':{input:0.4,cached:0.1,output:1.6},
  'gpt-image-2.5-flare':{input:5,cached:5,imageInput:8,output:30},
};
export function estimateCost(model:string,usage:Record<string,unknown>|null,image=false):number|null{
  const p=prices[model];if(!p||!usage)return null;
  const input=usage.input_tokens,output=usage.output_tokens;
  if(typeof input!=='number'||typeof output!=='number')return null;
  const details=usage.input_tokens_details as {cached_tokens?:number;text_tokens?:number;image_tokens?:number}|undefined;
  if(image){if(typeof details?.text_tokens!=='number'||typeof details.image_tokens!=='number')return null;return (details.text_tokens*p.input+details.image_tokens*(p.imageInput??p.input)+output*p.output)/1e6;}
  const cached=Math.min(input,Math.max(0,details?.cached_tokens??0));return ((input-cached)*p.input+cached*p.cached+output*p.output)/1e6;
}

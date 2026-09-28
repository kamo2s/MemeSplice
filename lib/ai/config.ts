export function aiConfig(env:NodeJS.ProcessEnv=process.env){
  const integer=(name:string,fallback:number,max:number)=>{const n=Number(env[name]||fallback);if(!Number.isInteger(n)||n<1||n>max)throw new Error('INVALID_AI_CONFIG');return n;};
  const provider=env.AI_PROVIDER||'openai',quality=env.AI_IMAGE_QUALITY||'low';
  if(provider!=='openai'||quality!=='low')throw new Error('UNSUPPORTED_AI_CONFIG');
  return {provider,apiKey:env.OPENAI_API_KEY||'',textModel:env.AI_TEXT_MODEL||'gpt-4.1-mini',imageModel:env.AI_IMAGE_MODEL||'gpt-image-2.5-flare',quality,
    maxEdge:integer('AI_PARENT_REFERENCE_MAX_EDGE',512,512),maxBytes:integer('AI_PARENT_REFERENCE_MAX_BYTES',153600,153600),
    parentVersion:env.AI_PROMPT_VERSION_PARENT||'parent-analysis-v1',conceptVersion:env.AI_PROMPT_VERSION_CONCEPT||'offspring-concept-v3',imageVersion:env.AI_PROMPT_VERSION_IMAGE||'offspring-image-v2',bucket:'offspring'};
}
export type AIConfig=ReturnType<typeof aiConfig>;

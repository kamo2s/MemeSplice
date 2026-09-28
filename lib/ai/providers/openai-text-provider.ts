import type {TextProvider,Prompt,PreparedImage} from '../types';
import {AIError} from '../types';
import {openAIRequest} from './openai-http';
export class OpenAITextProvider implements TextProvider{
  constructor(private key:string,private model:string,private fetcher:typeof fetch=fetch){}
  async generate(prompt:Prompt,schema:Record<string,unknown>,image:PreparedImage|null){
    const content:unknown[]=[{type:'input_text',text:JSON.stringify({DATA:prompt.data})}];
    if(image)content.push({type:'input_image',image_url:'data:image/webp;base64,'+image.bytes.toString('base64'),detail:'low'});
    const {data,requestId}=await openAIRequest(this.key,'responses',JSON.stringify({model:this.model,store:false,instructions:prompt.system,input:[{role:'user',content}],max_output_tokens:2200,text:{format:{type:'json_schema',name:'memesplice',strict:true,schema}}}),30000,this.fetcher);
    if(data.status!=='completed')throw new AIError('TEXT_INCOMPLETE',requestId,60,data.usage??null,data.id??null);
    const messages=(data.output??[]).filter((item:{type?:string})=>item.type==='message');
    const texts=messages.flatMap((item:{content?:{type:string;text?:string}[]})=>item.content??[]).filter((item:{type:string})=>item.type==='output_text');
    if(texts.length!==1)throw new AIError('TEXT_REFUSAL_OR_INVALID',requestId,60,data.usage??null,data.id??null);
    // Parsing/validation belongs to the service, after usage is recorded.
    return {value:texts[0].text as unknown,usage:data.usage??null,requestId,responseId:typeof data.id==='string'?data.id:null};
  }
}

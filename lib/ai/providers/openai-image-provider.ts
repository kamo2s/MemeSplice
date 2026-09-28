import type {ImageProvider,PreparedImage} from '../types';
import {AIError} from '../types';
import {openAIRequest} from './openai-http';
export class OpenAIImageProvider implements ImageProvider{
  constructor(private key:string,private model:string,private fetcher:typeof fetch=fetch){}
  async generate(prompt:string,references:PreparedImage[]){
    if(references.length>2)throw new AIError('TOO_MANY_REFERENCES');
    const settings={model:this.model,prompt,n:1,size:'1024x1024',quality:'low',output_format:'webp'};
    let body:BodyInit=JSON.stringify(settings);
    if(references.length){const form=new FormData();for(const [key,value]of Object.entries(settings))form.append(key,String(value));references.forEach((image,i)=>form.append('image[]',new Blob([new Uint8Array(image.bytes)],{type:image.mime}),`parent-${i+1}.webp`));body=form;}
    const {data,requestId}=await openAIRequest(this.key,references.length?'images/edits':'images/generations',body,180000,this.fetcher,!references.length);
    if(!Array.isArray(data.data)||data.data.length!==1||typeof data.data[0].b64_json!=='string')throw new AIError('INVALID_IMAGE_RESPONSE',requestId,60,data.usage??null);
    const bytes=Buffer.from(data.data[0].b64_json,'base64');if(!bytes.length||bytes.length>16*1024*1024)throw new AIError('INVALID_IMAGE_SIZE',requestId,60,data.usage??null);
    return {value:bytes,usage:data.usage??null,requestId,responseId:null};
  }
}

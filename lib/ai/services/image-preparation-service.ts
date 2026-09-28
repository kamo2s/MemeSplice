import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {imagesForToken} from '../../tokens/image-sources';
import {safeRemoteFile} from '../../tokens/server/safe-remote';
import type {Coin} from '../../memesplice/types';
import type {AIConfig} from '../config';
import type {PreparedImage} from '../types';
export async function resizeReference(bytes:Buffer,config:Pick<AIConfig,'maxEdge'|'maxBytes'>):Promise<PreparedImage>{
  if(bytes.length>3*1024*1024)throw new Error('REFERENCE_TOO_LARGE');
  // Raster-only, first frame, bounded decoded pixels. Sharp removes metadata by default.
  const meta=await sharp(bytes,{limitInputPixels:16_000_000,animated:false}).metadata();
  if(!['png','jpeg','webp','gif','avif'].includes(meta.format??''))throw new Error('INVALID_REFERENCE_FORMAT');
  for(const edge of [config.maxEdge,Math.floor(config.maxEdge*0.75),Math.floor(config.maxEdge*0.5)]){
    const result=await sharp(bytes,{limitInputPixels:16_000_000,animated:false}).rotate().resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true}).webp({quality:72}).toBuffer({resolveWithObject:true});
    if(result.data.length<=config.maxBytes)return {bytes:result.data,mime:'image/webp',width:result.info.width,height:result.info.height,fingerprint:createHash('sha256').update(bytes).digest('hex')};
  }throw new Error('REFERENCE_BYTE_LIMIT');
}
export async function prepareParent(parent:Coin,config:AIConfig,fetchImage=safeRemoteFile){
  if(!parent.token)return null;
  // Real native source order, never atlas illustrations or client-supplied URLs.
  // The ordered list is already capped at 12. Several IPFS gateway variants can
  // precede a working native CDN image, so do not stop after the first three.
  for(const source of imagesForToken(parent.token)){
    try{return await resizeReference((await fetchImage(source.url,'image',{timeoutMs:3000,maxBytes:3*1024*1024})).bytes,config);}catch{/* Next genuine native source, then text-only. */}
  }return null;
}
export async function finalImage(bytes:Buffer){
  if(bytes.length>16*1024*1024)throw new Error('OUTPUT_TOO_LARGE');
  const image=sharp(bytes,{limitInputPixels:4_194_304,animated:false}),meta=await image.metadata();
  if(!['png','jpeg','webp'].includes(meta.format??'')||meta.width!==meta.height)throw new Error('INVALID_OUTPUT_IMAGE');
  const result=await image.resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
  if(result.length>5*1024*1024)throw new Error('OUTPUT_TOO_LARGE');return result;
}

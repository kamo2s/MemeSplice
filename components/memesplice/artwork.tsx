"use client";
import { useEffect, useRef, useState } from "react";
import type { Artwork as ArtworkType } from "@/lib/memesplice/types";
const decodedImages = new Set<string>();
function rememberImage(url:string) { if(decodedImages.size>=500)decodedImages.delete(decodedImages.values().next().value!);decodedImages.add(url); }
function TokenArtwork({urls,name,className}:{urls:string[];name:string;className:string}) {
  const [index,setIndex] = useState(0);
  const [loaded,setLoaded] = useState<string|null>(null);
  const [visible,setVisible] = useState<string|null>(()=>urls.find(url=>decodedImages.has(url))??null);
  const element = useRef<HTMLImageElement>(null);
  const source = urls[index] ?? "/favicon.svg";
  useEffect(()=>{
    if (index >= urls.length || loaded === source) return;
    // Cached SSR images can finish before React attaches its load handler.
    if(element.current?.complete && element.current.naturalWidth > 0){rememberImage(source);setLoaded(source);setVisible(source);return;}
    // A stalled host must not leave the card empty indefinitely.
    const timer = setTimeout(()=>{if(!element.current?.complete || !element.current.naturalWidth)setIndex(current=>current===index?current+1:current);},10000);
    return ()=>clearTimeout(timer);
  },[index,urls.length,loaded,source]);
  const success=()=>{rememberImage(source);setLoaded(source);setVisible(source);};
  const failure=()=>{if(index<urls.length)setIndex(current=>current===index?current+1:current);};
  const probing=!!visible && visible!==source && index<urls.length;
  // Keep the image already decoded in search visible while a higher-priority native
  // candidate loads. Each Artwork keeps its own index; failed parents cannot cross-talk.
  return <span className={`artwork token-artwork ${className}`}>
    <img ref={probing?undefined:element} src={visible??source} alt={name} loading="eager" referrerPolicy="no-referrer" onLoad={probing?undefined:success} onError={()=>{if(visible){decodedImages.delete(visible);setVisible(null);setLoaded(null);if(visible===source)failure();}else failure();}}/>
    {probing&&<img ref={element} key={source} src={source} alt="" aria-hidden="true" style={{display:"none"}} referrerPolicy="no-referrer" onLoad={success} onError={failure}/>}
  </span>;
}
export function Artwork({ image, name, className = "" }: { image: ArtworkType; name: string; className?: string }) {
  if (image.url !== undefined || image.urls) {
    const urls = [...new Set(image.urls ?? (image.url ? [image.url] : []))];
    return <TokenArtwork key={JSON.stringify([name,urls])} urls={urls} name={name} className={className}/>;
  }
  const columns = image.atlas === "parents" ? 4 : 3, rows = image.atlas === "parents" ? 3 : 1;
  return <span role="img" aria-label={name} className={`artwork ${className}`} style={{ backgroundImage: `url(/images/${image.atlas}.png)`, backgroundSize: `${columns * 100}% ${rows * 100}%`, backgroundPosition: `${image.index % columns / (columns - 1) * 100}% ${rows === 1 ? 50 : Math.floor(image.index / columns) / (rows - 1) * 100}%`, filter: image.hue ? `hue-rotate(${image.hue}deg)` : undefined }} />;
}

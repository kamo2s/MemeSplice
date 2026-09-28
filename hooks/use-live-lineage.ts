'use client';
import {useEffect,useState} from 'react';
import type {PublicLineage} from '@/lib/memesplice/live-lineage';
export function useLiveLineage(){
 const [data,setData]=useState<PublicLineage>({offspring:[],nodes:[]}),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{
  let busy=false;const controller=new AbortController();
  async function refresh(){if(busy||controller.signal.aborted)return;busy=true;try{
   const response=await fetch('/api/lineage',{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('Verified launches could not be loaded. We’ll retry shortly.');
   const next=await response.json() as PublicLineage;setData(next);setError('');
  }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Unable to load verified launches.');}finally{busy=false;if(!controller.signal.aborted)setLoading(false);}}
  void refresh();const timer=setInterval(()=>{if(!document.hidden)void refresh();},15000);
  window.addEventListener('focus',refresh);window.addEventListener('splice:launch-verified',refresh);
  return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('splice:launch-verified',refresh);};
 },[]);
 return {...data,error,loading};
}

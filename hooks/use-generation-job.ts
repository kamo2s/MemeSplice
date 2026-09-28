"use client";
import {useEffect,useRef,useState} from "react";
import type {JobView} from "@/lib/generation/types";
import type {Coin,Offspring} from "@/lib/memesplice/types";
import {z} from "zod";
export function useGenerationJob(onComplete:(offspring:Offspring)=>void){
  const [job,setJob]=useState<JobView|null>(null),[submitting,setSubmitting]=useState(false),[error,setError]=useState("");
  const [connection,setConnection]=useState("");
  const source=useRef<EventSource|null>(null),callback=useRef(onComplete),requestId=useRef<string|null>(null);
  const busy=useRef(false);
  useEffect(()=>{callback.current=onComplete;},[onComplete]);
  function follow(id:string){
    source.current?.close();sessionStorage.setItem("splice-active-job",id);
    const events=new EventSource(`/api/generation/jobs/${id}/events`);source.current=events;
    events.onmessage=event=>{
      if(source.current!==events)return;
      const next=JSON.parse(event.data) as JobView;setJob(next);setConnection("");
      if(next.status==="COMPLETE"||next.status==="FAILED"){
        events.close();source.current=null;sessionStorage.removeItem("splice-active-job");sessionStorage.removeItem('splice-pending-request');requestId.current=null;
        if(next.status==='COMPLETE')sessionStorage.setItem('splice-last-job',id);
        if(next.status==="COMPLETE"&&next.result)callback.current(next.result);
        else setError("Mutation failed. No new offspring was created.");
      }
    };
    events.onerror=()=>{
      if(source.current!==events)return;
      setConnection("Reconnecting to the queue…");
      void fetch(`/api/generation/jobs/${id}`,{cache:"no-store"}).then(response=>{
        if(source.current===events&&[400,401,404].includes(response.status)){events.close();source.current=null;sessionStorage.removeItem("splice-active-job");if(sessionStorage.getItem('splice-last-job')===id)sessionStorage.removeItem('splice-last-job');setJob(null);setConnection("");setError("This queue session is no longer available. Try an Instant Splice.");}
      }).catch(()=>{});
    };
  }
  useEffect(()=>{
    let current=true;const id=sessionStorage.getItem('splice-active-job'),pending=sessionStorage.getItem('splice-pending-request');
    requestId.current=pending;
    if(id)follow(id);
    else if(pending)void fetch(`/api/generation/jobs?requestId=${encodeURIComponent(pending)}`,{cache:'no-store'}).then(r=>r.ok?r.json():null).then(found=>{const parsed=z.object({id:z.string().uuid()}).safeParse(found);if(current&&parsed.success)follow(parsed.data.id);}).catch(()=>{});
    else{const last=sessionStorage.getItem('splice-last-job');if(last)follow(last);}
    return()=>{current=false;source.current?.close();};
  },[]);
  async function generate(parents:[Coin,Coin],previousJobId:string|null=null,previousInstantId:string|null=null){
    if(busy.current||submitting||(job&&!['COMPLETE','FAILED'].includes(job.status)))return;
    busy.current=true;
    setSubmitting(true);setError("");requestId.current??=crypto.randomUUID();
    try{
      const identity=await fetch('/api/generation/session',{method:'POST'});if(!identity.ok)throw new Error('Could not establish a queue session. Please try again.');
      sessionStorage.setItem('splice-pending-request',requestId.current);
      const response=await fetch("/api/generation/jobs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({parentA:parents[0].contractAddress,parentB:parents[1].contractAddress,requestId:requestId.current,previousJobId,previousInstantId})});
      const body=z.object({id:z.string().uuid().optional(),error:z.object({message:z.string()}).optional()}).parse(await response.json());if(!response.ok||!body.id){if(response.status<500){requestId.current=null;sessionStorage.removeItem('splice-pending-request');}throw new Error(body.error?.message||"The mutation lab is unavailable. Try an Instant Splice.");}
      setJob({id:body.id,status:"QUEUED",position:null,estimatedWaitSeconds:null,paused:false,result:null,error:null});follow(body.id);
    }catch(error){setError(error instanceof Error?error.message:"The mutation lab is unavailable.");}finally{busy.current=false;setSubmitting(false);}
  }
  return {job,submitting,error,connection,generate,clearError:()=>setError(""),active:submitting||!!job&&!['COMPLETE','FAILED'].includes(job.status)};
}

"use client";
import {useEffect,useRef,useState} from "react";
import {fetchVerifiedToken} from "@/lib/tokens/client";
import type {Coin} from "@/lib/memesplice/types";
export function useTokenSelection(scope:string,onChoose:(coin:Coin)=>void){
  const [verifying,setVerifying]=useState(false),[verificationError,setError]=useState("");
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>{controller.current?.abort();controller.current=null;setVerifying(false);setError("");return()=>controller.current?.abort();},[scope]);
  async function select(coin:Coin){
    controller.current?.abort();const request=new AbortController();controller.current=request;setError("");setVerifying(true);
    try{const verified=await fetchVerifiedToken(coin.contractAddress,request.signal,coin);if(!request.signal.aborted)onChoose(verified);}
    catch(error){if(!request.signal.aborted)setError(error instanceof Error?error.message:"Token verification failed. Please try again.");}
    finally{if(controller.current===request){controller.current=null;setVerifying(false);}}
  }
  return {select,verifying,verificationError};
}

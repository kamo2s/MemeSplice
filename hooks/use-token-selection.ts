"use client";
import {useEffect,useRef,useState} from "react";
import {fetchVerifiedToken} from "@/lib/tokens/client";
import type {Coin} from "@/lib/memesplice/types";
export function useTokenSelection(scope:string,onChoose:(coin:Coin)=>void){
  const [state,setState]=useState({scope,verifying:false,verificationError:""});
  if(state.scope!==scope)setState({scope,verifying:false,verificationError:""});
  const {verifying,verificationError}=state.scope===scope?state:{verifying:false,verificationError:""};
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>{controller.current?.abort();controller.current=null;},[scope]);
  async function select(coin:Coin){
    controller.current?.abort();const request=new AbortController();controller.current=request;setState({scope,verifying:true,verificationError:""});
    try{const verified=await fetchVerifiedToken(coin.contractAddress,request.signal,coin);if(!request.signal.aborted)onChoose(verified);}
    catch(error){if(!request.signal.aborted)setState({scope,verifying:false,verificationError:error instanceof Error?error.message:"Token verification failed. Please try again."});}
    finally{if(controller.current===request){controller.current=null;setState(current=>current.scope===scope?{...current,verifying:false}:current);}}
  }
  return {select,verifying,verificationError};
}

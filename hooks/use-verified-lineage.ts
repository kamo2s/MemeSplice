'use client';
import {useEffect,useState} from 'react';
export type VerifiedLineage={offspring_id:string;parent_a_mint:string;parent_b_mint:string;offspring_mint:string;generation_number:number;creator_wallet:string;launch_provider:'pump.fun';launch_tx:string;network:'mainnet-beta';launched_at:string};
// Data hook for the next Family Tree phase. Existing illustrative UI is unchanged.
export function useVerifiedLineage(){
 const [lineage,setLineage]=useState<VerifiedLineage[]>([]),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();void fetch('/api/lineage',{signal:controller.signal}).then(async response=>{if(!response.ok)throw Error();const value=await response.json() as {lineage:VerifiedLineage[]};setLineage(value.lineage);}).catch(()=>{if(!controller.signal.aborted)setError('Verified lineage is temporarily unavailable.');});return()=>controller.abort();},[]);
 return {lineage,error};
}

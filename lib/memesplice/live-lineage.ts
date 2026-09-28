import type {Coin,LineageNode,Offspring} from './types';

export type VerifiedLineageRow={offspring_id:string;offspring_mint:string;parent_a_mint:string;parent_b_mint:string;generation_number:number;launched_at:string;creator_wallet:string;launch_tx:string;network:string;offspring:{status:string;result:Offspring};launch:{status:string;network:string;mint_address:string;transaction_signature:string}};
export type PublicLineage={offspring:Offspring[];nodes:LineageNode[]};

// Build the public graph only from matching verified mainnet records. Never
// spread database rows or generation results into the public response.
export function buildPublicLineage(rows:VerifiedLineageRow[]):PublicLineage{
 const verified=rows.filter(r=>r.network==='mainnet-beta'&&r.launch?.network==='mainnet-beta'&&r.launch.status==='VERIFIED'&&r.offspring?.status==='launched'&&r.launch.mint_address===r.offspring_mint&&r.launch.transaction_signature===r.launch_tx);
 const edges=new Map<string,Set<string>>(),byMint=new Map(verified.map(r=>[r.offspring_mint,r]));
 for(const r of verified)for(const parent of [r.parent_a_mint,r.parent_b_mint]){if(!edges.has(parent))edges.set(parent,new Set());edges.get(parent)!.add(r.offspring_mint);}
 function descendants(mint:string){const seen=new Set<string>([mint]),pending=[...(edges.get(mint)??[])];while(pending.length){const next=pending.pop()!;if(seen.has(next))continue;seen.add(next);pending.push(...edges.get(next)??[]);}return seen.size-1;}
 function coin(value:Coin,mint:string):Coin{return {id:mint,name:value.name,ticker:value.ticker,image:value.image,contractAddress:mint,marketCap:'',trait:value.trait,generation:byMint.get(mint)?.generation_number??0};}
 const offspring=verified.map(r=>{
  const c=r.offspring.result;
  return {id:r.offspring_id,name:c.name,ticker:c.ticker,image:c.image,tagline:c.tagline,lore:c.lore,personalityTraits:c.personalityTraits,parentAInfluence:c.parentAInfluence,parentBInfluence:c.parentBInfluence,mutationInfluence:c.mutationInfluence,generation:r.generation_number,recommended:false,parents:[coin(c.parents[0],r.parent_a_mint),coin(c.parents[1],r.parent_b_mint)],descendants:descendants(r.offspring_mint),inheritedTraits:c.inheritedTraits,status:'launched',launch:{mint:r.offspring_mint,signature:r.launch_tx,provider:'pump.fun',network:r.network},interpretation:c.interpretation,launchedAt:r.launched_at,source:'custom'} satisfies Offspring;
 }).sort((a,b)=>b.launchedAt.localeCompare(a.launchedAt));
 const nodes=new Map<string,LineageNode>();
 for(const c of offspring)for(const p of c.parents)if(!nodes.has(p.contractAddress))nodes.set(p.contractAddress,{id:p.contractAddress,name:p.name,ticker:p.ticker,image:p.image,generation:p.generation??0,description:p.trait,parents:[],children:[],descendants:descendants(p.contractAddress),traits:[p.trait],launchedAt:null,status:'external'});
 for(const c of offspring)nodes.set(c.launch!.mint,{id:c.launch!.mint,name:c.name,ticker:c.ticker,image:c.image,generation:c.generation,description:c.lore,parents:c.parents.map(p=>p.name),children:[],descendants:c.descendants,traits:c.inheritedTraits,launchedAt:c.launchedAt,status:'official'});
 for(const [mint,n] of nodes)n.children=[...(edges.get(mint)??[])].map(child=>nodes.get(child)?.name??child);
 return {offspring,nodes:[...nodes.values()]};
}

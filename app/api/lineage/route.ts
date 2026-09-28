import {database} from '@/lib/server/supabase';
import {buildPublicLineage,type VerifiedLineageRow} from '@/lib/memesplice/live-lineage';
import {refreshStoredArtwork,refreshStoredOffspring} from '@/lib/tokens/server/token-images';
export const dynamic='force-dynamic';
export async function GET(){
 try{
  const rows:VerifiedLineageRow[]=[];
  // Page through verified relationships so descendant counts are not limited
  // to the newest cards. Database credentials and owner sessions stay private.
  for(let offset=0;;offset+=500){
   const page=await database<VerifiedLineageRow[]>(`offspring_lineage?network=eq.mainnet-beta&launch.status=eq.VERIFIED&launch.network=eq.mainnet-beta&offspring.status=eq.launched&order=launched_at.desc,offspring_id.asc&limit=500&offset=${offset}&select=offspring_id,offspring_mint,parent_a_mint,parent_b_mint,generation_number,launched_at,creator_wallet,launch_tx,network,offspring:offspring!inner(status,result),launch:offspring_launches!inner(status,network,mint_address,transaction_signature)`);
   rows.push(...page);if(page.length<500)break;
  }
  const feed=buildPublicLineage(rows);
  return Response.json({offspring:feed.offspring.map(refreshStoredOffspring),nodes:feed.nodes.map(node=>({...node,image:refreshStoredArtwork(node.image)}))},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Verified lineage is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}

import type {LineageNode, Offspring} from './types';

export const FAMILY_NODE_WIDTH=228;
export const FAMILY_NODE_HEIGHT=88;
// Mint identities keep shared parents in one place, even across disconnected families.
export function layoutFamily(nodes:LineageNode[],offspring:Offspring[]) {
  const unique=[...new Map(nodes.map(node=>[node.id,node])).values()];
  const generations=[...new Set(unique.map(node=>node.generation))].sort((a,b)=>a-b);
  const columns=generations.map(generation=>({generation,nodes:unique.filter(n=>n.generation===generation).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id))}));
  const positions=columns.flatMap((column,x)=>column.nodes.map((node,y)=>({node,x:24+x*340,y:64+y*116})));
  const byId=new Map(positions.map(position=>[position.node.id,position]));
  const edges=[...new Map(offspring.flatMap(child=>child.parents.map(parent=>({from:parent.contractAddress,to:child.launch?.mint??''}))).map(edge=>[`${edge.from}:${edge.to}`,edge])).values()].filter(edge=>byId.has(edge.from)&&byId.has(edge.to));
  return {columns,positions,byId,edges,width:Math.max(340,columns.length*340-64),height:Math.max(260,88+Math.max(0,...columns.map(c=>c.nodes.length))*116)};
}

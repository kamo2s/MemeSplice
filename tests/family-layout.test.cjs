const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const file=path.resolve('lib/memesplice/family-layout.ts'),mod=new Module(file,module);
mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
const {layoutFamily,FAMILY_NODE_WIDTH,FAMILY_NODE_HEIGHT}=mod.exports;
const node=(id,generation=0)=>({id,name:id,generation});
const child=(mint,parents)=>({launch:{mint},parents:parents.map(contractAddress=>({contractAddress}))});
test('shared graph includes disconnected families, shared parents and every generation once',()=>{
 const nodes=[node('a'),node('b'),node('c'),node('d'),node('one',1),node('two',1),node('three',2),node('a')];
 const children=[child('one',['a','b']),child('two',['c','d']),child('three',['one','two'])];
 const graph=layoutFamily(nodes,children);
 assert.equal(graph.positions.length,7);assert.equal(graph.edges.length,6);assert.deepEqual(graph.columns.map(c=>c.generation),[0,1,2]);
 for(const edge of graph.edges)assert.ok(graph.byId.get(edge.from).x<graph.byId.get(edge.to).x);
 assert.equal(graph.byId.get('one').node.generation,1);
});
test('large graphs remain inside scrollable canvas without overlapping nodes; data order is stable',()=>{
 const nodes=Array.from({length:50},(_,i)=>node('mint-'+i,i%5)),graph=layoutFamily(nodes,[]);
 assert.equal(graph.positions.length,50);assert.ok(graph.height>620);assert.ok(graph.width>1000);
 assert.deepEqual(layoutFamily([...nodes].reverse(),[]).positions,graph.positions);
 for(const p of graph.positions){assert.ok(p.x+FAMILY_NODE_WIDTH<=graph.width);assert.ok(p.y+FAMILY_NODE_HEIGHT<=graph.height);
  for(const q of graph.positions)if(p!==q)assert.ok(Math.abs(p.x-q.x)>=FAMILY_NODE_WIDTH||Math.abs(p.y-q.y)>=FAMILY_NODE_HEIGHT);
 }
});
test('missing endpoints and repeated edges do not create phantom connectors',()=>{
 const graph=layoutFamily([node('a'),node('one',1)],[child('one',['a','missing']),child('one',['a','missing'])]);
 assert.deepEqual(graph.edges,[{from:'a',to:'one'}]);assert.equal(layoutFamily([],[]).positions.length,0);
});

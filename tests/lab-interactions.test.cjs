const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve('.');
function elements(node,predicate){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(n=>elements(n,predicate));return [...predicate(node)?[node]:[],...elements(node.props?.children,predicate)];}
function mount(){
 const states=[],events=[],timers=new Map();let cursor=0,tree;
 const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],next=>{states[i]=typeof next==='function'?next(states[i]):next;}];},useRef(value){const i=cursor++;return states[i]??(states[i]={current:value});},useEffect(){}};
 const queue={active:false,job:null,error:'',clearError(){},generate(...args){events.push(['generate',...args]);}};
 const cache=new Map();function load(file){if(!path.extname(file))file=['.tsx','.ts','.json'].map(ext=>file+ext).find(fs.existsSync);if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file,'utf8'));if(cache.has(file))return cache.get(file).exports;const m=new Module(file,module);cache.set(file,m);m.paths=module.paths;
  m.require=name=>name==='react'?react:name==='@solana/wallet-adapter-react'?{useWallet:()=>({publicKey:null})}:name==='@/hooks/use-generation-job'?{useGenerationJob:()=>queue}:name==='@/hooks/use-live-lineage'?{useLiveLineage:()=>({offspring:[],nodes:[],loading:false,error:''})}:name.startsWith('@/components/')?new Proxy({},{get:(_,key)=>String(key)}):name.startsWith('@/')?load(path.join(root,name.slice(2))):name.startsWith('.')?load(path.resolve(path.dirname(file),name)):require(name);
  m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,resolveJsonModule:true}}).outputText,file);return m.exports;
 }
 const saved={document:global.document,window:global.window,setInterval:global.setInterval,clearInterval:global.clearInterval};
 global.document={getElementById:id=>({scrollIntoView:()=>events.push(['scroll',id]),focus(){}})};global.window={matchMedia:()=>({matches:true})};global.setInterval=callback=>{timers.set(1,callback);return 1;};global.clearInterval=id=>timers.delete(id);
 const Home=load(path.join(root,'app/page.tsx')).default;
 function render(){cursor=0;tree=Home();return tree;}render();
 return {events,timers,render,get tree(){return tree;},close(){Object.assign(global,saved);}};
}
test('Mutate Again scrolls to the creation lab before requesting the selected parent pair',()=>{
 const app=mount();try{
  const button=elements(app.tree,n=>n.type==='button'&&JSON.stringify(n.props.children).includes('Mutate Again'))[0];button.props.onClick();
  assert.deepEqual(app.events.map(e=>e[0]),['scroll','generate']);assert.equal(app.events[0][1],'create');
  assert.equal(app.events[1][1][0].ticker,'BONK');assert.equal(app.events[1][1][1].ticker,'WIF');assert.match(app.events[1][3],/^instant-/);
 }finally{app.close();}
});
test('Instant reveal animates first, blocks duplicate clicks, and never requests a custom generation',()=>{
 const app=mount();try{
  const pair=elements(app.tree,n=>n.props?.['aria-label']==='Select MEW and WIF')[0];pair.props.onClick();pair.props.onClick();
  assert.equal(app.timers.size,1);assert.deepEqual(app.events,[['scroll','create']]);app.render();
  assert.equal(elements(app.tree,n=>n.props?.className==='generation-loading').length,1);
  assert.equal(elements(app.tree,n=>n.type==='OffspringCard').length,0);
  const tick=app.timers.get(1);for(let i=0;i<4;i++)tick();app.render();
  assert.equal(app.timers.size,0);assert.equal(app.events.some(e=>e[0]==='generate'),false);
  assert.equal(elements(app.tree,n=>n.type==='OffspringCard')[0].props.offspring.name,'Purl');assert.deepEqual(app.events.at(-1),['scroll','offspring']);
 }finally{app.close();}
});

test('Surprise Me changes parents without scrolling or starting a generation, even for a prepared pair',()=>{
 const app=mount(),random=Math.random;try{
  Math.random=()=>0; // BONK + WIF is also a prepared Instant pair.
  const button=elements(app.tree,n=>n.type==='button'&&JSON.stringify(n.props.children).includes('Surprise Me'))[0];button.props.onClick();
  assert.deepEqual(app.events,[]);assert.equal(app.timers.size,0);app.render();
  const picker=elements(app.tree,n=>n.type==='CoinPicker')[0];assert.deepEqual(picker.props.parents.map(p=>p.ticker),['BONK','WIF']);
 }finally{Math.random=random;app.close();}
});
test('header search assigns the chosen slot without scrolling or generating',()=>{
 const app=mount();try{
  const picker=elements(app.tree,n=>n.type==='CoinPicker')[0],coin={...picker.props.parents[0],id:'candidate',contractAddress:'candidate',name:'Candidate',ticker:'CAND'};
  elements(app.tree,n=>n.type==='HeaderCoinSearch')[0].props.onChoose(coin);app.render();
  const buttons=elements(app.tree,n=>n.type==='button'&&Array.isArray(n.props.children)&&n.props.children[0]==='Parent ');assert.equal(buttons.length,2);buttons[0].props.onClick();app.render();
  assert.equal(elements(app.tree,n=>n.type==='CoinPicker')[0].props.parents[0].id,'candidate');assert.deepEqual(app.events,[]);
 }finally{app.close();}
});

test('all Generate buttons reveal a prepared pair without calling the custom queue',async()=>{
 for(let index=0;index<3;index++){
  const app=mount();try{
   const buttons=elements(app.tree,n=>n.type==='button'&&JSON.stringify(n.props.children).includes('Generate Offspring'));
   assert.equal(buttons.length,3);await buttons[index].props.onClick();await buttons[index].props.onClick();
   assert.equal(app.events.some(e=>e[0]==='generate'),false);assert.equal(app.timers.size,1);
   const tick=app.timers.get(1);for(let i=0;i<4;i++)tick();app.render();
   const child=elements(app.tree,n=>n.type==='OffspringCard')[0].props.offspring;
   assert.equal(child.name,'Bonkwif');assert.equal(child.source,'instant');
  }finally{app.close();}
 }
});

test('reversed parent order and different search IDs still use the prepared mint pair',async()=>{
 const app=mount();try{
  const parents=elements(app.tree,n=>n.type==='CoinPicker')[0].props.parents;
  elements(app.tree,n=>n.type==='SpliceShowcase')[0].props.onTry([{...parents[1],id:'search-wif'},{...parents[0],id:'search-bonk'}]);app.render();
  await elements(app.tree,n=>n.props?.className==='btn btn-primary workspace-generate')[0].props.onClick();
  assert.equal(app.events.some(e=>e[0]==='generate'),false);assert.equal(app.timers.size,1);
  const tick=app.timers.get(1);for(let i=0;i<4;i++)tick();app.render();
  assert.equal(elements(app.tree,n=>n.type==='OffspringCard')[0].props.offspring.name,'Bonkwif');
 }finally{app.close();}
});

test('a different mint with the same name and ticker still requests custom generation',async()=>{
 const app=mount();try{
  const parents=elements(app.tree,n=>n.type==='CoinPicker')[0].props.parents;
  const next=[parents[0],{...parents[1],contractAddress:'different-mint'}];
  elements(app.tree,n=>n.type==='SpliceShowcase')[0].props.onTry(next);app.render();
  await elements(app.tree,n=>n.props?.className==='btn btn-primary workspace-generate')[0].props.onClick();
  assert.equal(app.timers.size,0);const calls=app.events.filter(e=>e[0]==='generate');assert.equal(calls.length,1);assert.deepEqual(calls[0][1],next);
 }finally{app.close();}
});

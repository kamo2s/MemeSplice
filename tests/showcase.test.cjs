const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),nativeRequire=Module.createRequire(path.join(root,'package.json'));
function loader(react){
 const cache=new Map();
 function load(file){
  if(file.endsWith('.module.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
  if(!path.extname(file))file=['.tsx','.ts','.json'].map(ext=>file+ext).find(name=>fs.existsSync(name))||file;
  if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file,'utf8'));
  if(cache.has(file))return cache.get(file).exports;
  const mod=new Module(file,module);cache.set(file,mod);mod.filename=file;mod.paths=module.paths;
  mod.require=name=>name==='react'&&react?react:name.startsWith('@/')?load(path.join(root,name.slice(2))):name.startsWith('.')?load(path.resolve(path.dirname(file),name)):nativeRequire(name);
  mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,resolveJsonModule:true}}).outputText,file);
  return mod.exports;
 }
 return load;
}
function elements(node,predicate){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(child=>elements(child,predicate));return [...predicate(node)?[node]:[],...elements(node.props?.children,predicate)];}
function mount({reduced=false}={}){
 const saved={window:global.window,document:global.document,IntersectionObserver:global.IntersectionObserver,setTimeout:global.setTimeout,clearTimeout:global.clearTimeout,fetch:global.fetch};
 const timers=new Map(),mediaListeners=new Set(),visibilityListeners=new Set(),observers=[],requests=[],selected=[];let nextTimer=0,cursor=0,dirty=true,tree,pending=[],unmounted=false;
 const slots=[],media={matches:reduced,addEventListener:(_,fn)=>mediaListeners.add(fn),removeEventListener:(_,fn)=>mediaListeners.delete(fn)};
 global.window={matchMedia:()=>media};global.document={hidden:false,addEventListener:(_,fn)=>visibilityListeners.add(fn),removeEventListener:(_,fn)=>visibilityListeners.delete(fn)};
 global.IntersectionObserver=class{constructor(fn){this.fn=fn;observers.push(this);}observe(el){this.element=el;}disconnect(){this.disconnected=true;}};
 global.setTimeout=(fn,ms)=>{timers.set(++nextTimer,{fn,ms});return nextTimer;};global.clearTimeout=id=>timers.delete(id);
 global.fetch=(...args)=>{requests.push(args);throw Error('Showcase must never call an API');};
 const react={
  useSyncExternalStore(subscribe,snapshot){const [value,setValue]=react.useState(snapshot);react.useEffect(()=>subscribe(()=>setValue(snapshot())),[subscribe]);return value;},
  useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,value=>{const next=typeof value==='function'?value(slots[i].value):value;if(!Object.is(next,slots[i].value)){slots[i].value=next;dirty=true;}}];},
  useRef(value){const i=cursor++;return (slots[i]??={current:value});},
  useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||!deps||deps.some((v,n)=>!Object.is(v,old.deps[n])))pending.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});}
 };
 const load=loader(react),{SpliceShowcase}=load(path.join(root,'components/memesplice/splice-showcase.tsx'));
 const props={onTry:p=>selected.push(p),onMakeOwn:()=>selected.push('make-own')};
 function flush(){let passes=0;do{if(++passes>15)throw Error('Unstable effect');dirty=false;cursor=0;pending=[];tree=SpliceShowcase(props);tree.props.ref.current={};const effects=pending;pending=[];effects.forEach(fn=>fn());}while(dirty);}
 flush();observers[0].fn([{isIntersecting:true}]);flush();
 return {get tree(){return tree;},timers,mediaListeners,visibilityListeners,observers,requests,selected,flush,
  button(name){return elements(tree,n=>n.type==='button'&&n.props['aria-label']===name)[0];},
  click(name){this.button(name).props.onClick();flush();},
  tick(){const [id,timer]=timers.entries().next().value??[];assert.ok(timer,'expected a live rotation timer');assert.equal(timer.ms,7500);timers.delete(id);timer.fn();flush();},
  motion(value){media.matches=value;mediaListeners.forEach(fn=>fn());flush();},
  visibility(value){global.document.hidden=value;visibilityListeners.forEach(fn=>fn());flush();},
  intersection(value){observers[0].fn([{isIntersecting:value}]);flush();},
  restore(){if(unmounted)return;unmounted=true;slots.forEach(slot=>slot.cleanup?.());Object.assign(global,saved);}
 };
}
test('prepared repository has five prepared records with traceable provenance and only local artwork; SSR shows one pairing',()=>{
 const load=loader(),{showcaseItems}=load(path.join(root,'lib/showcase/repository.ts'));
 assert.equal(showcaseItems.length,5);assert.equal(new Set(showcaseItems.map(i=>i.id)).size,5);
 for(const item of showcaseItems){assert.equal(item.prepared,true);if(item.provenance.generationJobId)assert.match(item.provenance.generationJobId,/^[a-f0-9-]{36}$/);else{assert.equal(item.provenance.source,"editorial-imagegen");assert.ok(fs.existsSync(path.join(root,"public",item.provenance.promptFile)));}for(const url of [item.parentA.image.url,item.parentB.image.url,item.offspring.image]){assert.match(url,/^\/images\//);assert.ok(fs.existsSync(path.join(root,'public',url)));}}
 const {SpliceShowcase}=load(path.join(root,'components/memesplice/splice-showcase.tsx')),React=nativeRequire('react');
 const html=nativeRequire('react-dom/server').renderToStaticMarkup(React.createElement(SpliceShowcase,{onTry(){},onMakeOwn(){}}));assert.equal((html.match(/<article/g)||[]).length,1);assert.match(html,/<h3>Boncata/);assert.doesNotMatch(html,/<h3>GasKitty/);
});
test('one active prepared pairing rotates every 7.5 seconds; next, previous and dots pause rotation',()=>{
 const f=mount();try{assert.equal(f.timers.size,1);assert.equal(elements(f.tree,n=>n.type==='article').length,1);f.tick();assert.equal(elements(f.tree,n=>n.props?.['data-showcase-id'])[0].props['data-showcase-id'],'gulp');f.click('Next splice example');assert.equal(f.timers.size,0);assert.equal(elements(f.tree,n=>n.props?.['data-showcase-id'])[0].props['data-showcase-id'],'gaskitty');f.click('Previous splice example');assert.equal(elements(f.tree,n=>n.props?.['data-showcase-id'])[0].props['data-showcase-id'],'gulp');f.click('Show POPCAT × FARTCOIN');assert.equal(elements(f.tree,n=>n.props?.['aria-current']==='true').length,1);f.click('Play showcase');assert.equal(f.timers.size,1);assert.equal(f.requests.length,0);}finally{f.restore();}
});
test('hover, keyboard focus, hidden tab and offscreen pause; re-renders and unmount clean timers/listeners',()=>{
 const f=mount();try{for(let i=0;i<5;i++)f.flush();assert.equal(f.timers.size,1);assert.equal(f.mediaListeners.size,1);assert.equal(f.visibilityListeners.size,1);assert.equal(f.observers.length,1);
 f.tree.props.onPointerEnter({pointerType:'mouse'});f.flush();assert.equal(f.timers.size,0);f.tree.props.onPointerLeave({pointerType:'mouse'});f.flush();assert.equal(f.timers.size,1);
 f.tree.props.onFocusCapture();f.flush();assert.equal(f.timers.size,0);f.tree.props.onBlurCapture({currentTarget:{contains:()=>false},relatedTarget:null});f.flush();assert.equal(f.timers.size,1);
 f.visibility(true);assert.equal(f.timers.size,0);f.visibility(false);assert.equal(f.timers.size,1);f.intersection(false);assert.equal(f.timers.size,0);f.intersection(true);assert.equal(f.timers.size,1);
 }finally{f.restore();}assert.equal(f.timers.size,0);assert.equal(f.mediaListeners.size,0);assert.equal(f.visibilityListeners.size,0);assert.ok(f.observers.every(o=>o.disconnected));
 const remount=mount();try{assert.equal(remount.timers.size,1);assert.equal(remount.observers.length,1);}finally{remount.restore();}
});
test('reduced motion disables automatic rotation but permits manual controls and responds to preference changes',()=>{
 const f=mount({reduced:true});try{assert.equal(f.timers.size,0);assert.equal(f.button('Pause showcase'),undefined);f.click('Next splice example');assert.equal(elements(f.tree,n=>n.props?.['data-showcase-id'])[0].props['data-showcase-id'],'gulp');f.motion(false);f.click('Play showcase');assert.equal(f.timers.size,1);f.motion(true);assert.equal(f.timers.size,0);}finally{f.restore();}
});
test('swipe and Try this splice choose exact prepared parents without fetching or generating',()=>{
 const f=mount();try{let stage=elements(f.tree,n=>n.props?.['aria-roledescription']==='slide')[0];stage.props.onTouchStart({touches:[{clientX:200,clientY:100}]});stage.props.onTouchEnd({changedTouches:[{clientX:50,clientY:110}]});f.flush();assert.equal(f.timers.size,0);
 const cta=elements(f.tree,n=>n.type==='button'&&Array.isArray(n.props.children)&&n.props.children[0]==='Try this splice ')[0];assert.ok(cta);cta.props.onClick();assert.deepEqual(f.selected[0].map(p=>p.ticker),['POPCAT','MOODENG']);assert.equal(f.requests.length,0);
 stage=elements(f.tree,n=>n.props?.['aria-roledescription']==='slide')[0];stage.props.onTouchStart({touches:[{clientX:200,clientY:100}]});stage.props.onTouchEnd({changedTouches:[{clientX:150,clientY:300}]});f.flush();assert.equal(elements(f.tree,n=>n.props?.['data-showcase-id'])[0].props['data-showcase-id'],'gulp');
 }finally{f.restore();}
});

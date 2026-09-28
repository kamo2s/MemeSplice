const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const Module=require('node:module');const path=require('node:path');
function mount(initial={}){
 const values=new Map(Object.entries(initial)),effects=[],events=[],requests=[],children=[];
 const saved={fetch:global.fetch,EventSource:global.EventSource,sessionStorage:global.sessionStorage};
 global.sessionStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 global.EventSource=class{constructor(url){this.url=url;events.push(this);}close(){this.closed=true;}};
 global.fetch=async(url,init={})=>{requests.push([url,init]);if(url==='/api/generation/session')return new Response(null,{status:204});if(init.method==='POST')return Response.json({id:'123e4567-e89b-42d3-a456-426614174000'});return Response.json({id:'123e4567-e89b-42d3-a456-426614174000'});};
 const react={useState:value=>[value,()=>{}],useRef:value=>({current:value}),useEffect:fn=>effects.push(fn)};
 const filename=path.resolve('hooks/use-generation-job.ts'),source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const mod=new Module(filename,module);mod.filename=filename;mod.paths=module.paths;mod.require=name=>name==='react'?react:require(name);mod._compile(source,filename);
 const hook=mod.exports.useGenerationJob(child=>children.push(child));const cleanup=effects.map(fn=>fn());
 return {hook,requests,events,values,children,restore(){cleanup.forEach(fn=>fn?.());Object.assign(global,saved);}};
}
test('refresh watches an active or completed saved job without any new POST',()=>{
 for(const key of ['splice-active-job','splice-last-job']){const f=mount({[key]:'saved-job'});try{assert.equal(f.events.length,1);assert.equal(f.events[0].url,'/api/generation/jobs/saved-job/events');assert.equal(f.requests.length,0);}finally{f.restore();}}
});
test('double click shares one request; Mutate Again gets new identity; stale SSE cannot overwrite',async()=>{
 const f=mount();const parents=[{contractAddress:'a'},{contractAddress:'b'}];try{
 await Promise.all([f.hook.generate(parents),f.hook.generate(parents)]);assert.equal(f.requests.filter(r=>r[1].method==='POST'&&r[0]==='/api/generation/jobs').length,1);
 const firstId=JSON.parse(f.requests.find(r=>r[0]==='/api/generation/jobs')[1].body).requestId;
 f.events[0].onmessage({data:JSON.stringify({status:'COMPLETE',result:{id:'child'},id:'job'})});assert.equal(f.children.length,1);
 await f.hook.generate(parents,'123e4567-e89b-42d3-a456-426614174000');
 const posts=f.requests.filter(r=>r[0]==='/api/generation/jobs');const second=JSON.parse(posts[1][1].body);assert.notEqual(second.requestId,firstId);assert.ok(second.previousJobId);
 f.events[0].onmessage({data:JSON.stringify({status:'COMPLETE',result:{id:'stale'}})});assert.equal(f.children.length,1);
 }finally{f.restore();}
});
test('refresh after uncertain admission looks up pending request and never automatically resubmits',async()=>{
 const f=mount({'splice-pending-request':'123e4567-e89b-42d3-a456-426614174000'});try{await new Promise(resolve=>setImmediate(resolve));assert.equal(f.requests.length,1);assert.equal(f.requests[0][1].method,undefined);assert.ok(f.requests[0][0].includes('requestId='));assert.equal(f.events.length,1);}finally{f.restore();}
});

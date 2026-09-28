const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){
  if(!path.extname(file))file+='.ts';
  if(cache.has(file))return cache.get(file).exports;
  const mod=new Module(file,module);cache.set(file,mod);
  mod.require=name=>name==='server-only'?{}:name.startsWith('@/')?load(path.join(root,name.slice(2))):name.startsWith('.')?load(path.resolve(path.dirname(file),name)):require(name);
  mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
  return mod.exports;
}
const {POST}=load(path.join(root,'app/api/generation/session/route.ts'));
test('public HTTPS origin creates a secure, reusable session behind an internal HTTP proxy; foreign origins stay blocked',async()=>{
  const saved={APP_ORIGIN:process.env.APP_ORIGIN,SESSION_SECRET:process.env.SESSION_SECRET};
  process.env.APP_ORIGIN='https://splice.example';process.env.SESSION_SECRET='test-session-key-with-at-least-32-characters';
  const request=(origin,extra={})=>new Request('http://internal:5173/api/generation/session',{method:'POST',headers:{...(origin?{origin}:{}),...extra}});
  try{
    const first=await POST(request('https://splice.example'));
    assert.equal(first.status,204);
    const cookie=first.headers.get('set-cookie');
    for(const flag of ['HttpOnly','SameSite=Lax','Secure'])assert.ok(cookie.includes(flag));
    const repeat=await POST(request('https://splice.example',{cookie:cookie.split(';')[0]}));
    assert.equal(repeat.status,204);assert.equal(repeat.headers.get('set-cookie'),null);
    for(const origin of [undefined,'null','https://evil.example','http://splice.example','http://internal:5173']){
      const rejected=await POST(request(origin,{'x-forwarded-host':'evil.example','x-forwarded-proto':'https',host:'evil.example'}));
      assert.equal(rejected.status,403);assert.equal(rejected.headers.get('set-cookie'),null);
    }
    process.env.APP_ORIGIN='https://splice.example/not-an-origin';assert.equal((await POST(request('https://splice.example'))).status,403);
    delete process.env.APP_ORIGIN;
    const local=await POST(request('http://internal:5173'));assert.equal(local.status,204);assert.ok(!local.headers.get('set-cookie').includes('Secure'));
  }finally{for(const [key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

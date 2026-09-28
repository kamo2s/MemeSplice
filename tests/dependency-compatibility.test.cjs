const {test}=require('node:test'),assert=require('node:assert/strict'),{createRequire}=require('node:module');

test('patched TOML and UUID preserve Anchor, Jayson and Solflare APIs',()=>{
 const anchor=createRequire(require.resolve('@coral-xyz/anchor'));
 assert.equal(anchor('toml').parse('[provider]\ncluster="mainnet"').provider.cluster,'mainnet');
 for(const consumer of ['jayson','@solflare-wallet/sdk']){
  const nested=createRequire(require.resolve(consumer)),uuid=nested('uuid');
  assert.equal(nested('uuid/package.json').version,'11.1.1');
  assert.match(uuid.v4(),/^[a-f0-9-]{36}$/);assert.equal(uuid.validate(uuid.v4()),true);
 }
 assert.equal(typeof require('@solflare-wallet/sdk').default,'function');
});

test('Solana bigint layouts use bounded Buffers and reject invalid input before native conversion',()=>{
 const layouts=require('@solana/buffer-layout-utils');
 for(const bits of [64,128,192,256]){
  const layout=layouts['u'+bits](),buffer=Buffer.alloc(bits/8),max=(1n<<BigInt(bits))-1n;
  for(const value of [0n,1n,max]){layout.encode(value,buffer,0);assert.equal(layout.decode(buffer),value);}
  for(const invalid of [null,undefined,{},'not a buffer'])assert.throws(()=>layout.decode(invalid));
 }
});


import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
const root=resolve(import.meta.dirname,'..'),build=join(root,'.next');mkdirSync(build,{recursive:true});const output=mkdtempSync(join(build,'pump-tests-'));let status=1;
try{
 const compile=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','lib/launch/reconciliation.ts','lib/server/worker-auth.ts','lib/memesplice/live-lineage.ts','--outDir',output,'--rootDir','.','--noEmit','false','--incremental','false','--module','commonjs','--moduleResolution','node','--target','ES2022','--esModuleInterop','--skipLibCheck','--strict','--resolveJsonModule'],{cwd:root,stdio:'inherit'});
 if(compile.status!==0)throw Error('Pump test compilation failed');writeFileSync(join(output,'package.json'),'{"type":"commonjs"}');
 const tests=spawnSync(process.execPath,['--test','tests/pump.test.cjs','tests/pump-database.test.mjs','tests/pump-client.test.cjs','tests/pump-wallet.test.cjs','tests/live-lineage.test.cjs','tests/reconciliation.test.cjs','tests/reconciler.test.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,SPLICE_PUMP_BUILD:output}});status=tests.status??1;
}finally{if(!resolve(output).startsWith(build+sep))throw Error('Invalid output path');rmSync(output,{recursive:true,force:true});}
process.exitCode=status;

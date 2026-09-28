import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {createLaunchReconciler} from '../scripts/launch-reconciler.mjs';
test('reconciler runs serially, advances cursor, wraps, and stops without submitting',async()=>{
 mock.timers.enable({apis:['setTimeout']});const urls=[];let release;
 const id='00000000-0000-4000-8000-000000000001';
 const worker=createLaunchReconciler({url:'https://app.example/api/launch/reconcile',key:'fixture',log:()=>{},report:()=>{},fetcher:async(url,init)=>{urls.push(String(url));assert.equal(url.pathname,'/api/launch/reconcile');assert.equal(init.redirect,'error');if(urls.length===1)await new Promise(r=>release=r);return Response.json({checked:3,errors:0,verified:0,failed:0,nextCursor:urls.length===1?id:null});}});
 try{const started=worker.start();mock.timers.tick(45000);assert.equal(urls.length,1);release();await started;mock.timers.tick(15000);await new Promise(r=>setImmediate(r));assert.ok(urls[1].includes('after='+id));mock.timers.tick(15000);await new Promise(r=>setImmediate(r));assert.equal(urls[2],'https://app.example/api/launch/reconcile');await worker.stop();mock.timers.tick(60000);assert.equal(urls.length,3);}
 finally{await worker.stop();mock.timers.reset();}
});

import {test,mock} from 'node:test';import assert from 'node:assert/strict';
import {dispatchPolicy} from '../scripts/generation-dispatch-policy.mjs';
import {createDispatcher} from '../scripts/generation-dispatcher.mjs';
test('dispatch policy controls concurrency independently of generation quotas',()=>{
 for(const n of [1,25,100])assert.deepEqual(dispatchPolicy(n),{idlePollMs:1000,maxInFlight:n});
 for(const n of [0,101,1.5,'25',NaN])assert.throws(()=>dispatchPolicy(n));
});
test('actual dispatcher fills available slots immediately, waits at capacity, and drains safely',async()=>{
 mock.timers.enable({apis:['setTimeout']});let calls=0,release=[];
 const d=createDispatcher({url:'http://localhost/worker',key:'fixture',log:()=>{},report:()=>{},fetcher:async(_url,init)=>{
  if(init.method!=='POST')return Response.json({available:true,enabled:true,paused:false,max_worker_concurrency:3,queued:10});
  calls++;await new Promise(resolve=>release.push(resolve));return Response.json({started:true,status:'COMPLETE'});
 }});
 try{
 await d.start();assert.equal(calls,3);assert.equal(d.state().inFlight,3);
 mock.timers.tick(1000);assert.equal(calls,3);
 release.shift()();await new Promise(r=>setImmediate(r));mock.timers.tick(1000);assert.equal(calls,4);
 const stop=d.stop();for(const done of release)done();await stop;mock.timers.tick(30000);assert.equal(calls,4);
 }finally{mock.timers.reset();}
});
test('dispatcher stays alive disabled, observes enable/pause, and avoids empty queue hammering',async()=>{
 mock.timers.enable({apis:['setTimeout']});let enabled=false,paused=false,queued=1,calls=0,health=0;
 const d=createDispatcher({url:'http://localhost/worker',key:'fixture',log:()=>{},report:()=>{},fetcher:async(_url,init)=>{
  if(init.method!=='POST'){health++;return Response.json({available:true,enabled,paused,max_worker_concurrency:25,queued});}
  calls++;return Response.json({started:false,reason:'WAITING'});
 }});
 const turn=()=>new Promise(r=>setImmediate(r));
 try{
 await d.start();assert.equal(calls,0);enabled=true;mock.timers.tick(3000);await turn();mock.timers.tick(1000);await turn();assert.equal(calls,1);
 queued=0;mock.timers.tick(3000);await turn();mock.timers.tick(1000);assert.equal(calls,1);
 paused=true;queued=30;mock.timers.tick(3000);await turn();mock.timers.tick(1000);assert.equal(calls,1);assert.ok(health>=3);
 }finally{await d.stop();mock.timers.reset();}
});

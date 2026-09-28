import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {setup} from './database-fixture.mjs';
test('launch SQL checks actual rolling limits/concurrency/FIFO and rolls back every write',async()=>{
 const db=await setup();try{
 const sql=await readFile(new URL('../supabase/tests/launch_limits.sql',import.meta.url),'utf8'),notices=[];
 await db.exec(sql,{onNotice:n=>notices.push(n.message)});assert.equal(notices.filter(n=>n.startsWith('PASS:')).length,6);
 assert.equal((await db.query('select count(*)::int n from generation_jobs')).rows[0].n,0);
 assert.deepEqual((await db.query('select enabled,max_per_hour,max_per_day,user_per_hour,max_worker_concurrency from generation_settings')).rows[0],{enabled:false,max_per_hour:3000,max_per_day:9000,user_per_hour:3,max_worker_concurrency:25});
 await assert.rejects(db.exec(sql.replace("errcode='ZQ001'","errcode='ZQ002'")),e=>e.code==='ZQ002');
 }finally{await db.close();}
});

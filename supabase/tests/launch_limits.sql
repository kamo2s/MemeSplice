-- Run the WHOLE statement after migration 003. All test writes roll back.
-- Existing completed jobs and AI ledgers are preserved; no provider calls occur.
-- Do not run while a real job is active. A singleton lock isolates this QA transaction.
do $$
declare j jsonb; k jsonb; v jsonb; n integer; i integer; first_id uuid;
  checks text[]:=array[]::text[]; label text;
  prefix text:='launch-qa-'||gen_random_uuid()::text;
  parents jsonb:='[{"contractAddress":"qa-parent-a"},{"contractAddress":"qa-parent-b"}]';
begin
 begin
  perform 1 from public.generation_settings where id=true for update;
  if exists(select 1 from public.generation_jobs where status not in ('COMPLETE','FAILED')) then raise exception 'Wait for existing jobs to finish before QA'; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='generation_settings' and column_name in ('max_per_minute','next_start_at')) then raise exception 'Old minute controls still exist'; end if;
  update public.generation_settings set enabled=false,ai_paused_until='-infinity',max_per_hour=3000,max_per_day=9000,user_per_hour=3,max_worker_concurrency=25;
  if public.splice_claim() is not null then raise exception 'Disabled claim'; end if;
  if public.splice_enqueue(prefix,prefix,gen_random_uuid(),'qa-parent-a','qa-parent-b',parents)->>'error' is distinct from 'DISABLED' then raise exception 'Disabled admission'; end if;
  update public.generation_settings set enabled=true,worker_seen_at='-infinity';
  if public.splice_enqueue(prefix,prefix,gen_random_uuid(),'qa-parent-a','qa-parent-b',parents)->>'error' is distinct from 'WORKER_UNAVAILABLE' then raise exception 'Worker heartbeat not enforced'; end if;
  perform public.splice_worker_heartbeat();
  checks:=array_append(checks,'disabled state, missing worker, no minute columns');
  -- More than the former minute maximum, without any sleeps or clock changes.
  for i in 1..55 loop
   j:=public.splice_enqueue(prefix||i,prefix||i,gen_random_uuid(),'qa-parent-a','qa-parent-b',parents);
   if j->>'id' is null then raise exception 'Admission % failed: %',i,j; end if;
  end loop;
  select id into first_id from public.generation_jobs where session_id=prefix||1;
  if (public.splice_job_status(first_id,prefix||1)->>'position')::int<>1 then raise exception 'Queue position'; end if;
  if public.splice_job_status(first_id,'not-owner') is not null then raise exception 'Private job status'; end if;
  j:=public.splice_claim();if (j->>'id')::uuid<>first_id then raise exception 'FIFO'; end if;
  for i in 2..25 loop if public.splice_claim() is null then raise exception 'Concurrency slot blocked'; end if; end loop;
  if public.splice_claim() is not null then raise exception 'Concurrency cap exceeded'; end if;
  if (public.splice_job_status((select id from public.generation_jobs where session_id=prefix||26),prefix||26)->>'estimatedWaitSeconds')::int<120 then raise exception 'Estimate ignores busy workers'; end if;
  perform public.splice_update((j->>'id')::uuid,(j->>'lease_token')::uuid,'FAILED',null,'QA');
  k:=public.splice_claim();if k->>'session_id'<>prefix||26 then raise exception 'Freed slot did not take next FIFO'; end if;
  update public.generation_jobs set status='FAILED',failed_at=clock_timestamp(),lease_token=null where session_id like prefix||'%' and status<>'QUEUED';
  for i in 27..55 loop
   j:=public.splice_claim();if j is null then raise exception 'Former minute quota still active'; end if;
   perform public.splice_update((j->>'id')::uuid,(j->>'lease_token')::uuid,'FAILED',null,'QA');
  end loop;
  checks:=array_append(checks,'55 immediate starts, 25 shared slots, FIFO and live position/estimate');
  for i in 1..3 loop
   j:=public.splice_enqueue(prefix||'-user',prefix||'-ip',gen_random_uuid(),'qa-parent-a','qa-parent-b',parents);
   if j->>'id' is null then raise exception 'User admission'; end if;
   v:=public.splice_enqueue(prefix||'-user',prefix||'-ip',gen_random_uuid(),'qa-parent-a','qa-parent-b',parents);
   if v->>'id'<>j->>'id' then raise exception 'Active job duplicate'; end if;
   update public.generation_jobs set status='FAILED' where id=(j->>'id')::uuid;
  end loop;
  if public.splice_enqueue(prefix||'-new-session',prefix||'-ip',gen_random_uuid(),'qa-parent-a','qa-parent-b',parents)->>'error' is distinct from 'USER_LIMIT' then raise exception '3/IP/hour'; end if;
  if public.splice_enqueue(prefix||'-user',prefix||'-new-ip',gen_random_uuid(),'qa-parent-a','qa-parent-b',parents)->>'error' is distinct from 'USER_LIMIT' then raise exception '3/session/hour'; end if;
  checks:=array_append(checks,'3/session and IP/hour and active-job idempotency');
  j:=public.splice_enqueue(prefix||'-boundary',prefix||'-boundary',gen_random_uuid(),'qa-parent-a','qa-parent-b',parents);
  -- Fill real rolling boundaries relative to existing history, inside this rollback only.
  select count(*) into n from public.generation_jobs where started_at>clock_timestamp()-interval '1 hour';
  insert into public.generation_jobs(session_id,ip_hash,request_id,parent_a_mint,parent_b_mint,parents,status,started_at)
  select prefix||'-h-'||g,prefix,gen_random_uuid(),'qa-parent-a','qa-parent-b',parents,'FAILED',clock_timestamp()-interval '5 minutes' from generate_series(1,3000-n) g;
  if public.splice_claim() is not null then raise exception '3000/hour claim'; end if;
  if public.splice_enqueue(prefix||'-cap',prefix||'-cap',gen_random_uuid(),'qa-parent-a','qa-parent-b',parents)->>'error' is distinct from 'CAPACITY' then raise exception 'Hourly admission'; end if;
  update public.generation_jobs set started_at=clock_timestamp()-interval '2 hours' where session_id like prefix||'-h-%';
  select count(*) into n from public.generation_jobs where started_at>clock_timestamp()-interval '24 hours';
  insert into public.generation_jobs(session_id,ip_hash,request_id,parent_a_mint,parent_b_mint,parents,status,started_at)
  select prefix||'-d-'||g,prefix,gen_random_uuid(),'qa-parent-a','qa-parent-b',parents,'FAILED',clock_timestamp()-interval '2 hours' from generate_series(1,9000-n) g;
  if public.splice_claim() is not null then raise exception '9000/day claim while hourly available'; end if;
  if public.splice_enqueue(prefix||'-daycap',prefix||'-daycap',gen_random_uuid(),'qa-parent-a','qa-parent-b',parents)->>'error' is distinct from 'CAPACITY' then raise exception 'Daily admission'; end if;
  checks:=array_append(checks,'actual 3000/hour and 9000/day; daily overrides hourly availability');
  update public.generation_jobs set started_at=clock_timestamp()-interval '25 hours' where session_id like prefix||'%' and started_at is not null;
  k:=public.splice_claim();if k->>'id' is distinct from j->>'id' then raise exception 'Capacity did not reopen'; end if;
  update public.generation_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=(k->>'id')::uuid;
  perform public.splice_cleanup();
  if public.splice_update((k->>'id')::uuid,(k->>'lease_token')::uuid,'SPLICING') then raise exception 'Expired lease accepted'; end if;
  if public.splice_claim() is not null then raise exception 'Expired paid job retried'; end if;
  perform public.splice_ai_pause('PROVIDER_RATE_LIMIT',37);
  if public.splice_enqueue(prefix||'-pause',prefix||'-pause',gen_random_uuid(),'qa-parent-a','qa-parent-b',parents)->>'error' is distinct from 'PROVIDER_PAUSED' then raise exception 'Pause admission'; end if;
  if public.splice_claim() is not null then raise exception 'Pause claim'; end if;
  checks:=array_append(checks,'rolling expiry, expired lease, no retry and shared provider pause');
  if has_function_privilege('anon','public.splice_worker_heartbeat()','execute') then raise exception 'Anonymous worker access'; end if;
  raise exception using errcode='ZQ001',message='rollback QA writes';
 exception when sqlstate 'ZQ001' then null;
 end;
 foreach label in array checks loop raise notice 'PASS: %',label; end loop;
 raise notice 'PASS: all launch QA writes rolled back; original settings and rows preserved';
end $$;

-- Phase 2B launch: apply after 001 and 002. No existing jobs/ledger/assets are deleted.
-- Public generation stays disabled until the controlled launch checks pass.
begin;
alter table public.generation_settings
  add column max_worker_concurrency integer not null default 25 check(max_worker_concurrency between 1 and 100),
  add column worker_seen_at timestamptz not null default '-infinity';
update public.generation_settings set enabled=false,max_per_hour=3000,max_per_day=9000,user_per_hour=3;
alter table public.generation_settings alter column max_per_day set default 9000;
create or replace function public.splice_enqueue_ai(p_session text, p_ip text, p_request uuid, p_a text, p_b text, p_parents jsonb,p_previous uuid default null,p_smoke boolean default false,p_instant text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare cfg public.generation_settings; job public.generation_jobs; waiting bigint; t timestamptz;
begin
  select * into cfg from public.generation_settings where id=true for update;
  perform public.splice_cleanup(); t := clock_timestamp();
  select * into job from public.generation_jobs where session_id=p_session and request_id=p_request;
  if found then return jsonb_build_object('id',job.id); end if;
  select * into job from public.generation_jobs where session_id=p_session and status not in ('COMPLETE','FAILED');
  if found then return jsonb_build_object('id',job.id,'existing',true); end if;
  if not cfg.enabled and not p_smoke then return jsonb_build_object('error','DISABLED'); end if;
  if not p_smoke and cfg.worker_seen_at<t-interval '45 seconds' then return jsonb_build_object('error','WORKER_UNAVAILABLE'); end if;
  if cfg.ai_paused_until>t then return jsonb_build_object('error','PROVIDER_PAUSED'); end if;
  if p_smoke and (cfg.enabled or (select count(*) from public.generation_jobs where is_smoke)>=cfg.smoke_max_jobs) then return jsonb_build_object('error','SMOKE_LIMIT'); end if;
  if p_previous is not null and not exists(select 1 from public.generation_jobs where id=p_previous and session_id=p_session and status='COMPLETE' and parent_a_mint=p_a and parent_b_mint=p_b) then return jsonb_build_object('error','INVALID_PREVIOUS'); end if;
  if p_a=p_b then return jsonb_build_object('error','SAME_PARENT'); end if;
  if (select count(*) from public.generation_jobs where (session_id=p_session or ip_hash=p_ip) and created_at>t-interval '1 hour') >= cfg.user_per_hour then
    return jsonb_build_object('error','USER_LIMIT');
  end if;
  select count(*) into waiting from public.generation_jobs where status='QUEUED';
  if waiting>=cfg.max_queued or
     (select count(*) from public.generation_jobs where started_at>t-interval '1 hour')+waiting >= cfg.max_per_hour or
     (select count(*) from public.generation_jobs where started_at>t-interval '24 hours')+waiting >= cfg.max_per_day then
    return jsonb_build_object('error','CAPACITY');
  end if;
  insert into public.generation_jobs(session_id,ip_hash,request_id,parent_a_mint,parent_b_mint,parents,previous_job_id,is_smoke,previous_instant_id)
  values(p_session,p_ip,p_request,p_a,p_b,p_parents,p_previous,p_smoke,p_instant) returning * into job;
  return jsonb_build_object('id',job.id);
end $$;
create or replace function public.splice_claim_ai(p_smoke_id uuid default null) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare cfg public.generation_settings; job public.generation_jobs; t timestamptz;
begin
  select * into cfg from public.generation_settings where id=true for update;
  perform public.splice_cleanup(); t:=clock_timestamp();
  if (not cfg.enabled and p_smoke_id is null) or cfg.ai_paused_until>t then return null; end if;
  if      (select count(*) from public.generation_jobs where started_at>t-interval '1 hour') >= cfg.max_per_hour or
     (select count(*) from public.generation_jobs where started_at>t-interval '24 hours') >= cfg.max_per_day then return null; end if;
  if (select count(*) from public.generation_jobs where status in ('ANALYZING','SPLICING','GENERATING','FINALIZING') and lease_expires_at>t)>=cfg.max_worker_concurrency then return null; end if;
  select * into job from public.generation_jobs where status='QUEUED' and ((p_smoke_id is null and not is_smoke) or (id=p_smoke_id and is_smoke and not cfg.enabled)) order by sequence limit 1 for update;
  if not found then return null; end if;
  update public.generation_jobs set status='ANALYZING',started_at=t,lease_token=gen_random_uuid(),lease_expires_at=t+interval '5 minutes'
  where id=job.id returning * into job;
  return to_jsonb(job);
end $$;
-- Legacy admission also uses the same authoritative checks.
create or replace function public.splice_enqueue(p_session text,p_ip text,p_request uuid,p_a text,p_b text,p_parents jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select public.splice_enqueue_ai(p_session,p_ip,p_request,p_a,p_b,p_parents,null,false,null);
$$;
create or replace function public.splice_job_status(p_id uuid,p_session text) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare job public.generation_jobs; cfg public.generation_settings; pos bigint; wait_seconds integer; active_count bigint; average_seconds numeric;
begin
  update public.generation_jobs set status='FAILED',failed_at=clock_timestamp(),error_code='WORKER_TIMEOUT',lease_token=null
  where id=p_id and session_id=p_session and status in ('ANALYZING','SPLICING','GENERATING','FINALIZING') and lease_expires_at<clock_timestamp();
  update public.generation_jobs set status='FAILED',failed_at=clock_timestamp(),error_code='QUEUE_EXPIRED'
  where id=p_id and session_id=p_session and status='QUEUED' and created_at<clock_timestamp()-interval '24 hours';
  select * into job from public.generation_jobs where id=p_id and session_id=p_session;
  if not found then return null; end if;
  select * into cfg from public.generation_settings where id=true;
  if job.status='QUEUED' then
    select count(*) into pos from public.generation_jobs where status='QUEUED' and sequence<=job.sequence;
    select count(*) into active_count from public.generation_jobs where status in ('ANALYZING','SPLICING','GENERATING','FINALIZING') and lease_expires_at>clock_timestamp();
    select avg(seconds) into average_seconds from (select extract(epoch from completed_at-started_at) as seconds from public.generation_jobs where status='COMPLETE' and completed_at>clock_timestamp()-interval '24 hours' order by completed_at desc limit 100) recent;
    -- Broad estimate in 30-second bands, based on observed duration and shared slots.
    wait_seconds := ceil((floor((active_count+pos-1)::numeric/cfg.max_worker_concurrency)*coalesce(average_seconds,120)+15)/30)*30;
  end if;
  return jsonb_build_object('id',job.id,'status',job.status,'position',pos,'estimatedWaitSeconds',wait_seconds,
    'paused',not cfg.enabled or cfg.ai_paused_until>clock_timestamp() or cfg.worker_seen_at<clock_timestamp()-interval '45 seconds' or (select count(*) from public.generation_jobs where started_at>clock_timestamp()-interval '1 hour')>=cfg.max_per_hour or (select count(*) from public.generation_jobs where started_at>clock_timestamp()-interval '24 hours')>=cfg.max_per_day,
    'result',job.result,'error',job.error_code);
end $$;
-- Authenticated worker health route calls this every 15 seconds, even while disabled.
create function public.splice_worker_heartbeat() returns jsonb language plpgsql security invoker set search_path='' as $$
declare cfg public.generation_settings;
begin
 update public.generation_settings set worker_seen_at=clock_timestamp() where id=true returning * into cfg;
 return jsonb_build_object('enabled',cfg.enabled,'max_worker_concurrency',cfg.max_worker_concurrency,'paused',cfg.ai_paused_until>clock_timestamp(),'queued',(select count(*) from public.generation_jobs where status='QUEUED' and not is_smoke));
end $$;
revoke all on function public.splice_worker_heartbeat() from public,anon,authenticated;
grant execute on function public.splice_worker_heartbeat() to service_role;
-- Drop both the quota and its old spacing clock after replacing every dependent function.
alter table public.generation_settings drop column max_per_minute,drop column next_start_at;
-- A long Retry-After must never resume earlier than the provider requested.
create or replace function public.splice_ai_pause(p_reason text,p_seconds integer) returns void language sql security invoker set search_path='' as $$
 update public.generation_settings set ai_paused_until=greatest(ai_paused_until,case when p_reason='PROVIDER_AUTH' then 'infinity'::timestamptz else clock_timestamp()+make_interval(secs=>greatest(1,p_seconds)) end),ai_pause_reason=p_reason where id=true;
$$;
notify pgrst,'reload schema';
commit;

-- Run once in Supabase SQL Editor. Application callers use server-only service credentials.
create table public.generation_settings (
  id boolean primary key default true check (id), enabled boolean not null default false,
  max_per_minute integer not null default 50 check (max_per_minute between 1 and 50),
  max_per_hour integer not null default 3000 check (max_per_hour >= 0),
  max_per_day integer not null default 15000 check (max_per_day >= 0),
  user_per_hour integer not null default 3 check (user_per_hour between 1 and 100),
  max_queued integer not null default 1000 check (max_queued between 1 and 10000),
  next_start_at timestamptz not null default '-infinity'
);
insert into public.generation_settings(id) values(true);
create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(), sequence bigint generated always as identity unique,
  session_id text not null, ip_hash text not null, request_id uuid not null,
  parent_a_mint text not null, parent_b_mint text not null check (parent_a_mint <> parent_b_mint),
  parents jsonb not null check(jsonb_typeof(parents) = 'array' and jsonb_array_length(parents) = 2),
  status text not null default 'QUEUED' check(status in ('QUEUED','ANALYZING','SPLICING','GENERATING','FINALIZING','COMPLETE','FAILED')),
  created_at timestamptz not null default clock_timestamp(), started_at timestamptz,
  completed_at timestamptz, failed_at timestamptz, lease_expires_at timestamptz,
  lease_token uuid, result jsonb, error_code text,
  unique(session_id, request_id)
);
create unique index generation_one_active_session on public.generation_jobs(session_id) where status not in ('COMPLETE','FAILED');
create index generation_fifo on public.generation_jobs(sequence) where status = 'QUEUED';
create index generation_starts on public.generation_jobs(started_at) where started_at is not null;
create index generation_session_history on public.generation_jobs(session_id, created_at);
create index generation_ip_history on public.generation_jobs(ip_hash, created_at);
create index generation_expired_leases on public.generation_jobs(lease_expires_at) where status in ('ANALYZING','SPLICING','GENERATING','FINALIZING');
create table public.token_cache(kind text not null, key text not null, value jsonb not null, expires_at timestamptz not null, primary key(kind,key));
create table public.token_fetch_leases(kind text not null, key text not null, lease_token uuid not null default gen_random_uuid(), expires_at timestamptz not null, primary key(kind,key));
create table public.search_attempts(id bigint generated always as identity primary key, identity_hash text not null, created_at timestamptz not null default clock_timestamp());
create index search_attempts_identity_time on public.search_attempts(identity_hash,created_at);
create table public.parent_analysis_cache (
  mint_address text primary key, source_fingerprint text not null, analysis_version text not null,
  traits jsonb not null, analyzed_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null
);
create index token_cache_expiry on public.token_cache(expires_at);
create index token_leases_expiry on public.token_fetch_leases(expires_at);

create function public.splice_cleanup() returns void language sql security invoker set search_path = '' as $$
  update public.generation_jobs set status='FAILED', failed_at=clock_timestamp(), error_code='WORKER_TIMEOUT', lease_token=null
  where status in ('ANALYZING','SPLICING','GENERATING','FINALIZING') and lease_expires_at < clock_timestamp();
  update public.generation_jobs set status='FAILED', failed_at=clock_timestamp(), error_code='QUEUE_EXPIRED'
  where status='QUEUED' and created_at < clock_timestamp()-interval '24 hours';
$$;

create function public.splice_enqueue(p_session text, p_ip text, p_request uuid, p_a text, p_b text, p_parents jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare cfg public.generation_settings; job public.generation_jobs; waiting bigint; t timestamptz;
begin
  select * into cfg from public.generation_settings where id=true for update;
  perform public.splice_cleanup(); t := clock_timestamp();
  select * into job from public.generation_jobs where session_id=p_session and request_id=p_request;
  if found then return jsonb_build_object('id',job.id); end if;
  select * into job from public.generation_jobs where session_id=p_session and status not in ('COMPLETE','FAILED');
  if found then return jsonb_build_object('id',job.id,'existing',true); end if;
  if not cfg.enabled then return jsonb_build_object('error','DISABLED'); end if;
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
  insert into public.generation_jobs(session_id,ip_hash,request_id,parent_a_mint,parent_b_mint,parents)
  values(p_session,p_ip,p_request,p_a,p_b,p_parents) returning * into job;
  return jsonb_build_object('id',job.id);
end $$;

-- The singleton row lock serializes all starts across every worker/server.
-- Failed/expired jobs retain started_at, so they still count toward spend caps.
create function public.splice_claim() returns jsonb language plpgsql security invoker set search_path = '' as $$
declare cfg public.generation_settings; job public.generation_jobs; t timestamptz;
begin
  select * into cfg from public.generation_settings where id=true for update;
  perform public.splice_cleanup(); t:=clock_timestamp();
  if not cfg.enabled or t<cfg.next_start_at then return null; end if;
  if (select count(*) from public.generation_jobs where started_at>t-interval '60 seconds') >= least(50,cfg.max_per_minute) or
     (select count(*) from public.generation_jobs where started_at>t-interval '1 hour') >= cfg.max_per_hour or
     (select count(*) from public.generation_jobs where started_at>t-interval '24 hours') >= cfg.max_per_day then return null; end if;
  select * into job from public.generation_jobs where status='QUEUED' order by sequence limit 1 for update;
  if not found then return null; end if;
  update public.generation_settings set next_start_at=t+make_interval(secs=>60.0/cfg.max_per_minute) where id=true;
  update public.generation_jobs set status='ANALYZING',started_at=t,lease_token=gen_random_uuid(),lease_expires_at=t+interval '5 minutes'
  where id=job.id returning * into job;
  return to_jsonb(job);
end $$;

create function public.splice_update(p_id uuid,p_lease uuid,p_status text,p_result jsonb default null,p_error text default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare job public.generation_jobs;
begin
  select * into job from public.generation_jobs where id=p_id for update;
  if not found or job.lease_token is distinct from p_lease or job.status in ('COMPLETE','FAILED','QUEUED') or job.lease_expires_at<clock_timestamp() then return false; end if;
  if p_status not in ('SPLICING','GENERATING','FINALIZING','COMPLETE','FAILED') then return false; end if;
  if p_status <> 'FAILED' and array_position(array['ANALYZING','SPLICING','GENERATING','FINALIZING','COMPLETE'],p_status) <> array_position(array['ANALYZING','SPLICING','GENERATING','FINALIZING','COMPLETE'],job.status)+1 then return false; end if;
  if p_status='COMPLETE' and (p_result is null or jsonb_typeof(p_result)<>'object' or p_result->'parents'->0->>'contractAddress' is distinct from job.parent_a_mint or p_result->'parents'->1->>'contractAddress' is distinct from job.parent_b_mint) then return false; end if;
  update public.generation_jobs set status=p_status,result=case when p_status='COMPLETE' then p_result else result end,
    completed_at=case when p_status='COMPLETE' then clock_timestamp() end, failed_at=case when p_status='FAILED' then clock_timestamp() end,
    error_code=p_error,lease_expires_at=clock_timestamp()+interval '5 minutes',
    lease_token=case when p_status in ('COMPLETE','FAILED') then null else lease_token end
  where id=p_id;
  return true;
end $$;

create function public.splice_job_status(p_id uuid,p_session text) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare job public.generation_jobs; cfg public.generation_settings; pos bigint; wait_seconds integer;
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
    wait_seconds := ceil(greatest(0,extract(epoch from cfg.next_start_at-clock_timestamp()))+(pos-1)*60.0/cfg.max_per_minute);
  end if;
  return jsonb_build_object('id',job.id,'status',job.status,'position',pos,'estimatedWaitSeconds',wait_seconds,
    'paused',not cfg.enabled or (select count(*) from public.generation_jobs where started_at>clock_timestamp()-interval '1 hour')>=cfg.max_per_hour or (select count(*) from public.generation_jobs where started_at>clock_timestamp()-interval '24 hours')>=cfg.max_per_day,
    'result',job.result,'error',job.error_code);
end $$;

create function public.splice_search_permit(p_identity text) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('search:'||p_identity,0));
  delete from public.search_attempts where identity_hash=p_identity and created_at<clock_timestamp()-interval '1 minute';
  if (select count(*) from public.search_attempts where identity_hash=p_identity)>=10 then return false; end if;
  insert into public.search_attempts(identity_hash) values(p_identity); return true;
end $$;
create function public.splice_cache_lease(p_kind text,p_key text) returns uuid language plpgsql security invoker set search_path = '' as $$
declare token uuid;
begin
  insert into public.token_fetch_leases(kind,key,expires_at) values(p_kind,p_key,clock_timestamp()+interval '60 seconds')
  on conflict(kind,key) do update set expires_at=excluded.expires_at,lease_token=excluded.lease_token where public.token_fetch_leases.expires_at<clock_timestamp()
  returning lease_token into token;
  return token;
end $$;

create function public.splice_maintenance() returns void language sql security invoker set search_path = '' as $$
  select public.splice_cleanup();
  delete from public.token_cache where expires_at<clock_timestamp();
  delete from public.token_fetch_leases where expires_at<clock_timestamp();
  delete from public.search_attempts where created_at<clock_timestamp()-interval '2 minutes';
  delete from public.parent_analysis_cache where expires_at<clock_timestamp();
$$;

-- No anonymous/authenticated browser access. Only service_role may invoke these APIs.
do $$ declare name text; fn record; begin
  foreach name in array array['generation_settings','generation_jobs','token_cache','token_fetch_leases','search_attempts','parent_analysis_cache'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on table public.%I from public, anon, authenticated',name);
    execute format('grant all on table public.%I to service_role',name);
  end loop;
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'splice_%' loop
    execute format('revoke all on function %s from public, anon, authenticated',fn.signature);
    execute format('grant execute on function %s to service_role',fn.signature);
  end loop;
end $$;
grant usage,select on sequence public.generation_jobs_sequence_seq,public.search_attempts_id_seq to service_role;

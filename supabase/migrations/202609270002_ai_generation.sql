-- Phase 2B additive extension. Public generation remains disabled.
begin;
alter table public.generation_settings add column ai_paused_until timestamptz not null default '-infinity', add column ai_pause_reason text, add column smoke_max_jobs integer not null default 5 check(smoke_max_jobs between 0 and 100);
alter table public.generation_jobs add column previous_job_id uuid references public.generation_jobs(id), add column previous_instant_id text, add column is_smoke boolean not null default false;
alter table public.parent_analysis_cache drop constraint parent_analysis_cache_pkey;
alter table public.parent_analysis_cache add primary key(mint_address,source_fingerprint,analysis_version);
create table public.ai_runs(
 job_id uuid primary key references public.generation_jobs(id), config jsonb not null, references_info jsonb, concept jsonb,
 started_at timestamptz not null default clock_timestamp(), completed_at timestamptz, duration_ms bigint,
 failure_stage text,error_category text
);
create table public.ai_calls(
 job_id uuid not null references public.generation_jobs(id),stage text not null check(stage in ('parent_a','parent_b','concept','image')),
 model text not null,provider text not null default 'openai',state text not null default 'STARTED' check(state in ('STARTED','COMPLETE','FAILED')),
 started_at timestamptz not null default clock_timestamp(),completed_at timestamptz,request_id text,response_id text,
 usage jsonb,estimated_usd numeric,pricing_version text,error_category text,
 primary key(job_id,stage)
);
create table public.offspring(
 id uuid primary key references public.generation_jobs(id), generation_job_id uuid not null unique references public.generation_jobs(id),
 parent_a_mint text not null,parent_b_mint text not null,generation_number integer not null,
 status text not null default 'draft' check(status='draft'),image_storage_path text not null unique,
 result jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create function public.splice_enqueue_ai(p_session text, p_ip text, p_request uuid, p_a text, p_b text, p_parents jsonb,p_previous uuid default null,p_smoke boolean default false,p_instant text default null)
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

create function public.splice_claim_ai(p_smoke_id uuid default null) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare cfg public.generation_settings; job public.generation_jobs; t timestamptz;
begin
  select * into cfg from public.generation_settings where id=true for update;
  perform public.splice_cleanup(); t:=clock_timestamp();
  if (not cfg.enabled and p_smoke_id is null) or cfg.ai_paused_until>t or t<cfg.next_start_at then return null; end if;
  if (select count(*) from public.generation_jobs where started_at>t-interval '60 seconds') >= least(50,cfg.max_per_minute) or
     (select count(*) from public.generation_jobs where started_at>t-interval '1 hour') >= cfg.max_per_hour or
     (select count(*) from public.generation_jobs where started_at>t-interval '24 hours') >= cfg.max_per_day then return null; end if;
  select * into job from public.generation_jobs where status='QUEUED' and ((p_smoke_id is null and not is_smoke) or (id=p_smoke_id and is_smoke and not cfg.enabled)) order by sequence limit 1 for update;
  if not found then return null; end if;
  update public.generation_settings set next_start_at=t+make_interval(secs=>60.0/cfg.max_per_minute) where id=true;
  update public.generation_jobs set status='ANALYZING',started_at=t,lease_token=gen_random_uuid(),lease_expires_at=t+interval '5 minutes'
  where id=job.id returning * into job;
  return to_jsonb(job);
end $$;


create or replace function public.splice_claim() returns jsonb language sql security invoker set search_path='' as $$ select public.splice_claim_ai(null); $$;
create function public.splice_ai_begin(p_id uuid,p_lease uuid,p_config jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.generation_jobs where id=p_id and lease_token=p_lease and status='ANALYZING' and lease_expires_at>clock_timestamp() for update;
 if not found then return false; end if;
 insert into public.ai_runs(job_id,config) values(p_id,p_config) on conflict do nothing;
 return found;
end $$;
create function public.splice_ai_reserve(p_id uuid,p_lease uuid,p_stage text,p_model text) returns boolean language plpgsql security invoker set search_path='' as $$
declare current_status text;
begin
 perform 1 from public.generation_settings where id=true and ai_paused_until<=clock_timestamp() for share;
 if not found then return false; end if;
 select status into current_status from public.generation_jobs where id=p_id and lease_token=p_lease and lease_expires_at>clock_timestamp() for update;
 if not found or current_status is distinct from (case p_stage when 'parent_a' then 'ANALYZING' when 'parent_b' then 'ANALYZING' when 'concept' then 'SPLICING' when 'image' then 'GENERATING' end) then return false; end if;
 insert into public.ai_calls(job_id,stage,model) values(p_id,p_stage,p_model) on conflict do nothing;
 return found;
end $$;
create function public.splice_ai_pause(p_reason text,p_seconds integer) returns void language sql security invoker set search_path='' as $$
 update public.generation_settings set ai_paused_until=greatest(ai_paused_until,case when p_reason='PROVIDER_AUTH' then 'infinity'::timestamptz else clock_timestamp()+make_interval(secs=>greatest(1,least(p_seconds,86400))) end),ai_pause_reason=p_reason where id=true;
$$;
create function public.splice_complete_ai(p_id uuid,p_lease uuid,p_result jsonb,p_path text) returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.generation_jobs;
begin
 select * into job from public.generation_jobs where id=p_id and lease_token=p_lease and status='FINALIZING' and lease_expires_at>clock_timestamp() for update;
 if not found or p_result->>'status' is distinct from 'draft' or p_path is distinct from 'custom/'||p_id::text||'/offspring.webp' then return false; end if;
 if not public.splice_update(p_id,p_lease,'COMPLETE',p_result,null) then return false; end if;
 insert into public.offspring(id,generation_job_id,parent_a_mint,parent_b_mint,generation_number,image_storage_path,result)
 values(p_id,p_id,job.parent_a_mint,job.parent_b_mint,(p_result->>'generation')::integer,p_path,p_result);
 update public.ai_runs set completed_at=clock_timestamp(),duration_ms=(extract(epoch from clock_timestamp()-started_at)*1000)::bigint where job_id=p_id;
 return true;
end $$;
-- Only the backend service key can read drafts, usage, or invoke paid-call controls.
do $$ declare item text; fn record; begin
 foreach item in array array['ai_runs','ai_calls','offspring'] loop
 execute format('alter table public.%I enable row level security',item);
 execute format('revoke all on public.%I from public, anon, authenticated',item);
 execute format('grant all on public.%I to service_role',item);
 end loop;
 for fn in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in ('splice_enqueue_ai','splice_claim_ai','splice_ai_begin','splice_ai_reserve','splice_ai_pause','splice_complete_ai') loop
 execute format('revoke all on function %s from public, anon, authenticated',fn.signature);
 execute format('grant execute on function %s to service_role',fn.signature);
 end loop;
end $$;
-- Create/verify the bucket through the Storage API: node scripts/setup-ai-storage.mjs.
commit;

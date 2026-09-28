-- Admin exemption applies only to the browser's personal hourly quota.
-- Queue capacity, shared budgets, provider pauses and ownership remain enforced.
begin;
create table public.generation_admin_sessions (
 session_id text primary key, label text not null,
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz
);
alter table public.generation_admin_sessions enable row level security;
revoke all on public.generation_admin_sessions from public,anon,authenticated;
grant select,insert,update,delete on public.generation_admin_sessions to service_role;
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
  if not exists(select 1 from public.generation_admin_sessions where session_id=p_session and (expires_at is null or expires_at>t))
     and (select count(*) from public.generation_jobs where (session_id=p_session or ip_hash=p_ip) and created_at>t-interval '1 hour') >= cfg.user_per_hour then
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

notify pgrst,'reload schema';
commit;

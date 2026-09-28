-- Additive Phase 3. No generation settings or queue functions are changed.
begin;
alter table public.offspring drop constraint offspring_status_check;
alter table public.offspring add constraint offspring_status_check check(status in ('draft','launching','launched'));
create table public.offspring_launch_assets (
 offspring_id uuid primary key references public.offspring(id),
 identity jsonb not null, metadata_json jsonb, image_uri text, metadata_uri text,
 image_started boolean not null default false, metadata_started boolean not null default false,
 lease_token uuid, lease_until timestamptz, created_at timestamptz not null default now()
);
create table public.offspring_launches (
 id uuid primary key default gen_random_uuid(), offspring_id uuid not null references public.offspring(id),
 session_id text not null, provider text not null default 'pump.fun' check(provider='pump.fun'),
 network text not null check(network in ('devnet','mainnet-beta')), creator_wallet text not null,
 mint_address text not null unique, transaction_signature text unique,
 metadata_uri text, image_uri text,
 status text not null default 'PREPARING' check(status in ('PREPARING','AWAITING_SIGNATURE','SUBMITTED','CONFIRMING','CONFIRMED','VERIFIED','FAILED')),
 message_base64 text, unsigned_transaction text, last_valid_block_height bigint,
 network_fee_lamports bigint, error_code text, error_message_safe text,
 created_at timestamptz not null default now(), submitted_at timestamptz, confirmed_at timestamptz, verified_at timestamptz,
 check(status not in ('SUBMITTED','CONFIRMING','CONFIRMED','VERIFIED') or transaction_signature is not null),
 check(status<>'VERIFIED' or verified_at is not null)
);
-- One active attempt across networks; a devnet test must use a separate offspring.
create unique index offspring_one_active_launch on public.offspring_launches(offspring_id) where status<>'FAILED';
create table public.offspring_lineage (
 offspring_id uuid primary key references public.offspring(id), launch_id uuid not null unique references public.offspring_launches(id),
 parent_a_mint text not null, parent_b_mint text not null, offspring_mint text not null unique,
 generation_number integer not null check(generation_number>=1), creator_wallet text not null,
 launch_provider text not null check(launch_provider='pump.fun'), launch_tx text not null unique,
 network text not null check(network='mainnet-beta'), launched_at timestamptz not null
);
create function public.splice_begin_launch(p_session text,p_offspring uuid,p_wallet text,p_mint text,p_network text,p_identity jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o offspring; attempt offspring_launches;
begin
 select x.* into o from offspring x join generation_jobs j on j.id=x.generation_job_id
 where x.id=p_offspring and j.session_id=p_session and j.status='COMPLETE' for update of x;
 if not found then raise exception 'NOT_OWNED'; end if;
 select * into attempt from offspring_launches where offspring_id=o.id and status<>'FAILED';
 if found then return to_jsonb(attempt); end if;
 if o.status='launched' then raise exception 'ALREADY_LAUNCHED'; end if;
 insert into offspring_launch_assets(offspring_id,identity) values(o.id,p_identity) on conflict do nothing;
 insert into offspring_launches(offspring_id,session_id,creator_wallet,mint_address,network)
 values(o.id,p_session,p_wallet,p_mint,p_network) returning * into attempt;
 -- The generated draft remains a draft until verified on mainnet.
 return to_jsonb(attempt);
end $$;
create function public.splice_launch_lease(p_offspring uuid,p_token uuid)
returns setof public.offspring_launch_assets language sql security definer set search_path=public as $$
 update offspring_launch_assets set lease_token=p_token,lease_until=now()+interval '10 minutes'
 where offspring_id=p_offspring and (lease_until is null or lease_until<now()) returning *;
$$;
-- Called only by the server after finalized on-chain verification. Never browser accessible.
create function public.splice_verify_launch(p_id uuid,p_signature text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare l offspring_launches; o offspring; gen integer; finished timestamptz:=now(); result_json jsonb; identity_json jsonb;
begin
 select * into l from offspring_launches where id=p_id for update;
 if not found or l.transaction_signature is distinct from p_signature then raise exception 'INVALID_LAUNCH'; end if;
 if l.status='VERIFIED' then return to_jsonb(l); end if;
 if l.status not in ('SUBMITTED','CONFIRMING','CONFIRMED') then raise exception 'INVALID_STATE'; end if;
 update offspring_launches set status='VERIFIED',verified_at=finished,confirmed_at=coalesce(confirmed_at,finished),error_code=null,error_message_safe=null where id=l.id returning * into l;
 if l.network='mainnet-beta' then
  select * into o from offspring where id=l.offspring_id for update;
  select coalesce(max(generation_number),0)+1 into gen from offspring_lineage where offspring_mint in(o.parent_a_mint,o.parent_b_mint);
  insert into offspring_lineage values(o.id,l.id,o.parent_a_mint,o.parent_b_mint,l.mint_address,gen,l.creator_wallet,l.provider,l.transaction_signature,l.network,finished);
  select identity into identity_json from offspring_launch_assets where offspring_id=o.id;
  result_json:=o.result || jsonb_build_object('name',identity_json->>'name','ticker',identity_json->>'symbol','lore',identity_json->>'description','status','launched','generation',gen,'launchedAt',finished,'launch',jsonb_build_object('mint',l.mint_address,'signature',l.transaction_signature,'provider',l.provider,'network',l.network));
  update offspring set status='launched',generation_number=gen,result=result_json where id=o.id;
  update generation_jobs set result=result_json where id=o.generation_job_id;
 end if;
 return to_jsonb(l);
end $$;
alter table public.offspring_launches enable row level security;
alter table public.offspring_launch_assets enable row level security;
alter table public.offspring_lineage enable row level security;
revoke all on public.offspring_launches,public.offspring_launch_assets,public.offspring_lineage from public,anon,authenticated;
grant all on public.offspring_launches,public.offspring_launch_assets,public.offspring_lineage to service_role;
revoke all on function public.splice_begin_launch(text,uuid,text,text,text,jsonb),public.splice_launch_lease(uuid,uuid),public.splice_verify_launch(uuid,text) from public,anon,authenticated;
grant execute on function public.splice_begin_launch(text,uuid,text,text,text,jsonb),public.splice_launch_lease(uuid,uuid),public.splice_verify_launch(uuid,text) to service_role;
commit;



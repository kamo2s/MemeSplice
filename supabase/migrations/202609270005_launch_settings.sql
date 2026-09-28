-- Additive launch configuration. Does not enable launches or alter generation.
begin;
alter table public.offspring_launches
 add column initial_buy_lamports bigint not null default 0 check(initial_buy_lamports=0 or initial_buy_lamports between 1000000 and 10000000000),
 add column holder_reward boolean not null default false,
 add column holder_reward_acknowledged boolean not null default false,
 add column mayhem_mode boolean not null default false,
 add column quote_asset text not null default 'SOL' check(quote_asset='SOL'),
 add column cashback boolean not null default false check(not cashback),
 add column slippage_bps integer not null default 100 check(slippage_bps=100),
 add column estimated_wallet_cost_lamports bigint check(estimated_wallet_cost_lamports>=0),
 add column max_wallet_cost_lamports bigint check(max_wallet_cost_lamports>=estimated_wallet_cost_lamports),
 add column account_cost_lamports bigint check(account_cost_lamports>=0),
 add column compute_units integer check(compute_units>=0),
 add constraint holder_reward_ack_required check(not holder_reward or holder_reward_acknowledged);

-- Freeze as soon as a signable message is exposed, stronger than SUBMITTED.
-- Reconciliation may update status/signature but cannot rewrite what was signed.
create function public.splice_guard_launch_settings() returns trigger
language plpgsql set search_path=public as $$
begin
 if old.status<>'PREPARING' and
 (new.initial_buy_lamports,new.holder_reward,new.holder_reward_acknowledged,new.mayhem_mode,new.quote_asset,new.cashback,new.slippage_bps,
  new.estimated_wallet_cost_lamports,new.max_wallet_cost_lamports,new.account_cost_lamports,new.compute_units,
  new.creator_wallet,new.mint_address,new.network,new.message_base64,new.unsigned_transaction,new.last_valid_block_height,new.metadata_uri,new.image_uri)
 is distinct from
 (old.initial_buy_lamports,old.holder_reward,old.holder_reward_acknowledged,old.mayhem_mode,old.quote_asset,old.cashback,old.slippage_bps,
  old.estimated_wallet_cost_lamports,old.max_wallet_cost_lamports,old.account_cost_lamports,old.compute_units,
  old.creator_wallet,old.mint_address,old.network,old.message_base64,old.unsigned_transaction,old.last_valid_block_height,old.metadata_uri,old.image_uri)
 then raise exception 'LAUNCH_SETTINGS_FROZEN'; end if;
 if old.status<>'PREPARING' and new.status='PREPARING' then raise exception 'INVALID_STATE'; end if;
 if old.transaction_signature is not null and new.transaction_signature is distinct from old.transaction_signature then raise exception 'LAUNCH_SIGNATURE_FROZEN'; end if;
 return new;
end $$;
create trigger guard_launch_settings before update on public.offspring_launches
 for each row execute function public.splice_guard_launch_settings();
revoke all on function public.splice_guard_launch_settings() from public,anon,authenticated;
commit;

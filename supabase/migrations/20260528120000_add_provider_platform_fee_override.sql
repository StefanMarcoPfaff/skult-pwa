alter table public.provider_payout_profiles
  add column if not exists platform_fee_percent_override numeric null,
  add column if not exists platform_fee_override_note text null,
  add column if not exists platform_fee_override_updated_at timestamptz null;

alter table public.provider_payout_profiles
  drop constraint if exists provider_payout_profiles_platform_fee_override_check;

alter table public.provider_payout_profiles
  add constraint provider_payout_profiles_platform_fee_override_check check (
    platform_fee_percent_override is null
    or (
      platform_fee_percent_override >= 0
      and platform_fee_percent_override <= 0.30
    )
  );

create or replace function public.prevent_provider_platform_fee_override_self_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated'
    and (
      coalesce(new.platform_fee_percent_override, -1) is distinct from coalesce(old.platform_fee_percent_override, -1)
      or coalesce(new.platform_fee_override_note, '') is distinct from coalesce(old.platform_fee_override_note, '')
      or coalesce(new.platform_fee_override_updated_at, 'epoch'::timestamptz) is distinct from coalesce(old.platform_fee_override_updated_at, 'epoch'::timestamptz)
    )
  then
    raise exception 'platform fee override can only be changed by admins';
  end if;

  return new;
end;
$$;

drop trigger if exists provider_payout_profiles_prevent_platform_fee_override_self_update
  on public.provider_payout_profiles;

create trigger provider_payout_profiles_prevent_platform_fee_override_self_update
before update on public.provider_payout_profiles
for each row
execute function public.prevent_provider_platform_fee_override_self_write();

create or replace function public.prevent_provider_platform_fee_override_self_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated'
    and (
      new.platform_fee_percent_override is not null
      or new.platform_fee_override_note is not null
      or new.platform_fee_override_updated_at is not null
    )
  then
    raise exception 'platform fee override can only be changed by admins';
  end if;

  return new;
end;
$$;

drop trigger if exists provider_payout_profiles_prevent_platform_fee_override_self_insert
  on public.provider_payout_profiles;

create trigger provider_payout_profiles_prevent_platform_fee_override_self_insert
before insert on public.provider_payout_profiles
for each row
execute function public.prevent_provider_platform_fee_override_self_insert();

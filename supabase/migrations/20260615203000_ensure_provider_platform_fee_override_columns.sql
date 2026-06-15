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

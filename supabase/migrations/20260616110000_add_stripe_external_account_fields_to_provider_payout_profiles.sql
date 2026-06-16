alter table public.provider_payout_profiles
  add column if not exists stripe_external_account_id text null,
  add column if not exists stripe_external_account_last4 text null,
  add column if not exists stripe_external_account_status text null,
  add column if not exists stripe_external_account_last_sync_at timestamptz null;

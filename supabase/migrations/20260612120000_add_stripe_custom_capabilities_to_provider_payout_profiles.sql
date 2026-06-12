alter table public.provider_payout_profiles
  add column if not exists stripe_capability_card_payments text null,
  add column if not exists stripe_capability_transfers text null;

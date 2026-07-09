alter table public.subscription_charges
  add column if not exists provider_payout_profile_id uuid null references public.provider_payout_profiles(id) on delete set null,
  add column if not exists payout_batch_id uuid null references public.payout_batches(id) on delete set null,
  add column if not exists transfer_status text not null default 'pending',
  add column if not exists stripe_transfer_id text null,
  add column if not exists transferred_at timestamptz null,
  add column if not exists transfer_attempted_at timestamptz null,
  add column if not exists transfer_error text null;

alter table public.subscription_charges
  drop constraint if exists subscription_charges_transfer_status_check;

alter table public.subscription_charges
  add constraint subscription_charges_transfer_status_check check (
    transfer_status in ('pending', 'payout_scheduled', 'transfer_created', 'transfer_failed')
  );

alter table public.payout_batches
  add column if not exists batch_key text null,
  add column if not exists transfer_type text null,
  add column if not exists provider_payout_profile_id uuid null references public.provider_payout_profiles(id) on delete set null,
  add column if not exists provider_id uuid null references public.profiles(id) on delete set null,
  add column if not exists service_month date null,
  add column if not exists gross_amount_cents integer not null default 0,
  add column if not exists platform_fee_cents integer not null default 0,
  add column if not exists provider_net_amount_cents integer not null default 0,
  add column if not exists charge_count integer not null default 0,
  add column if not exists stripe_transfer_id text null,
  add column if not exists error_message text null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.payout_batches
  drop constraint if exists payout_batches_transfer_type_check;

alter table public.payout_batches
  add constraint payout_batches_transfer_type_check check (
    transfer_type is null or transfer_type in ('subscription_monthly_provider_transfer')
  );

alter table public.payout_batches
  drop constraint if exists payout_batches_subscription_transfer_amounts_nonnegative_check;

alter table public.payout_batches
  add constraint payout_batches_subscription_transfer_amounts_nonnegative_check check (
    gross_amount_cents >= 0
    and platform_fee_cents >= 0
    and provider_net_amount_cents >= 0
    and charge_count >= 0
  );

create unique index if not exists payout_batches_batch_key_key
  on public.payout_batches (batch_key)
  where batch_key is not null;

create index if not exists payout_batches_subscription_transfer_idx
  on public.payout_batches (transfer_type, provider_id, service_month, currency)
  where transfer_type = 'subscription_monthly_provider_transfer';

create index if not exists subscription_charges_transfer_status_idx
  on public.subscription_charges (transfer_status);

create index if not exists subscription_charges_payout_batch_id_idx
  on public.subscription_charges (payout_batch_id)
  where payout_batch_id is not null;

create index if not exists subscription_charges_provider_payout_profile_id_idx
  on public.subscription_charges (provider_payout_profile_id)
  where provider_payout_profile_id is not null;

create index if not exists subscription_charges_stripe_transfer_id_idx
  on public.subscription_charges (stripe_transfer_id)
  where stripe_transfer_id is not null;

alter table public.subscription_charges
  add column if not exists ledger_entry_id uuid null references public.ledger_entries(id) on delete set null,
  add column if not exists platform_fee_cents integer not null default 0,
  add column if not exists provider_net_cents integer not null default 0,
  add column if not exists stripe_invoice_id text null,
  add column if not exists stripe_payment_intent_id text null,
  add column if not exists stripe_charge_id text null,
  add column if not exists failure_code text null,
  add column if not exists failure_message text null,
  add column if not exists next_payment_attempt timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_charges_platform_fee_nonnegative_check'
      and conrelid = 'public.subscription_charges'::regclass
  ) then
    alter table public.subscription_charges
      add constraint subscription_charges_platform_fee_nonnegative_check
      check (platform_fee_cents >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_charges_provider_net_nonnegative_check'
      and conrelid = 'public.subscription_charges'::regclass
  ) then
    alter table public.subscription_charges
      add constraint subscription_charges_provider_net_nonnegative_check
      check (provider_net_cents >= 0);
  end if;
end $$;

create index if not exists subscription_charges_ledger_entry_id_idx
  on public.subscription_charges (ledger_entry_id)
  where ledger_entry_id is not null;

create unique index if not exists subscription_charges_provider_stripe_invoice_key
  on public.subscription_charges (provider, stripe_invoice_id)
  where stripe_invoice_id is not null;

create index if not exists subscription_charges_stripe_payment_intent_id_idx
  on public.subscription_charges (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists subscription_charges_stripe_charge_id_idx
  on public.subscription_charges (stripe_charge_id)
  where stripe_charge_id is not null;

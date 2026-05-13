create table if not exists public.provider_payout_profiles (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid null references public.profiles(id) on delete set null,
  payout_method text not null,
  iban_encrypted text null,
  iban_last4 text null,
  paypal_email text null,
  account_holder_name text not null,
  tax_number text null,
  vat_id text null,
  verification_status text not null default 'pending',
  provider text not null,
  provider_account_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_payout_profiles_payout_method_check check (
    payout_method in ('bank_transfer', 'paypal', 'stripe', 'manual', 'other')
  ),
  constraint provider_payout_profiles_verification_status_check check (
    verification_status in ('pending', 'verified', 'rejected', 'requires_action', 'disabled')
  ),
  constraint provider_payout_profiles_provider_nonempty_check check (char_length(trim(provider)) > 0),
  constraint provider_payout_profiles_account_holder_name_nonempty_check check (
    char_length(trim(account_holder_name)) > 0
  ),
  constraint provider_payout_profiles_payment_destination_check check (
    iban_encrypted is not null
    or iban_last4 is not null
    or paypal_email is not null
    or provider_account_id is not null
  )
);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid null references public.bookings(id) on delete set null,
  course_registration_intent_id uuid null references public.course_registration_intents(id) on delete set null,
  provider text not null,
  provider_payment_id text null,
  provider_checkout_id text null,
  provider_customer_id text null,
  provider_subscription_id text null,
  amount_cents integer not null,
  currency text not null,
  payment_method text null,
  status text not null default 'pending',
  paid_at timestamptz null,
  refunded_at timestamptz null,
  failed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_transactions_status_check check (
    status in ('pending', 'paid', 'failed', 'cancelled', 'refunded', 'requires_action', 'unknown')
  ),
  constraint payment_transactions_amount_nonnegative_check check (amount_cents >= 0),
  constraint payment_transactions_provider_nonempty_check check (char_length(trim(provider)) > 0),
  constraint payment_transactions_currency_nonempty_check check (char_length(trim(currency)) > 0),
  constraint payment_transactions_relation_present_check check (
    booking_id is not null or course_registration_intent_id is not null
  )
);

create table if not exists public.payout_batches (
  id uuid primary key default gen_random_uuid(),
  payout_provider text not null,
  payout_method text not null,
  total_amount_cents integer not null,
  currency text not null,
  status text not null default 'scheduled',
  scheduled_for timestamptz null,
  executed_at timestamptz null,
  failed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payout_batches_status_check check (
    status in ('scheduled', 'processing', 'paid', 'failed', 'cancelled')
  ),
  constraint payout_batches_total_amount_nonnegative_check check (total_amount_cents >= 0),
  constraint payout_batches_provider_nonempty_check check (char_length(trim(payout_provider)) > 0),
  constraint payout_batches_currency_nonempty_check check (char_length(trim(currency)) > 0),
  constraint payout_batches_method_check check (
    payout_method in ('bank_transfer', 'paypal', 'stripe', 'manual', 'other')
  )
);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  provider_payout_profile_id uuid null references public.provider_payout_profiles(id) on delete set null,
  source_type text not null,
  source_id uuid not null,
  entry_type text not null,
  gross_amount_cents integer not null,
  platform_fee_cents integer not null default 0,
  provider_fee_cents integer not null default 0,
  net_amount_cents integer not null,
  currency text not null,
  payout_status text not null default 'pending',
  available_at timestamptz null,
  payout_batch_id uuid null references public.payout_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ledger_entries_source_type_check check (
    source_type in ('booking', 'course_registration_intent', 'payment_transaction', 'refund_record', 'manual_adjustment')
  ),
  constraint ledger_entries_entry_type_check check (
    entry_type in ('payment', 'refund', 'platform_fee', 'provider_fee', 'payout', 'adjustment', 'reserve')
  ),
  constraint ledger_entries_payout_status_check check (
    payout_status in ('pending', 'available', 'scheduled', 'paid', 'failed', 'cancelled', 'held')
  ),
  constraint ledger_entries_currency_nonempty_check check (char_length(trim(currency)) > 0),
  constraint ledger_entries_source_id_present_check check (source_id is not null),
  constraint ledger_entries_provider_amounts_nonnegative_check check (
    gross_amount_cents >= 0 and platform_fee_cents >= 0 and provider_fee_cents >= 0
  )
);

create table if not exists public.payout_items (
  id uuid primary key default gen_random_uuid(),
  payout_batch_id uuid not null references public.payout_batches(id) on delete cascade,
  provider_payout_profile_id uuid not null references public.provider_payout_profiles(id) on delete restrict,
  ledger_entry_id uuid not null references public.ledger_entries(id) on delete restrict,
  amount_cents integer not null,
  currency text not null,
  status text not null default 'scheduled',
  executed_at timestamptz null,
  failed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payout_items_status_check check (
    status in ('scheduled', 'processing', 'paid', 'failed', 'cancelled')
  ),
  constraint payout_items_amount_nonnegative_check check (amount_cents >= 0),
  constraint payout_items_currency_nonempty_check check (char_length(trim(currency)) > 0)
);

create table if not exists public.refund_records (
  id uuid primary key default gen_random_uuid(),
  payment_transaction_id uuid not null references public.payment_transactions(id) on delete cascade,
  provider_refund_id text null,
  amount_cents integer not null,
  reason text null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint refund_records_status_check check (
    status in ('pending', 'succeeded', 'failed', 'cancelled')
  ),
  constraint refund_records_amount_nonnegative_check check (amount_cents >= 0)
);

create table if not exists public.provider_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processing_status text not null default 'pending',
  processed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_webhook_events_provider_nonempty_check check (char_length(trim(provider)) > 0),
  constraint provider_webhook_events_event_type_nonempty_check check (char_length(trim(event_type)) > 0),
  constraint provider_webhook_events_event_id_nonempty_check check (char_length(trim(provider_event_id)) > 0),
  constraint provider_webhook_events_processing_status_check check (
    processing_status in ('pending', 'processing', 'processed', 'failed', 'ignored')
  )
);

create table if not exists public.monthly_statements (
  id uuid primary key default gen_random_uuid(),
  provider_payout_profile_id uuid not null references public.provider_payout_profiles(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  gross_amount_cents integer not null default 0,
  platform_fee_cents integer not null default 0,
  provider_fee_cents integer not null default 0,
  net_amount_cents integer not null default 0,
  refund_amount_cents integer not null default 0,
  payout_amount_cents integer not null default 0,
  currency text not null,
  pdf_url text null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_statements_status_check check (
    status in ('draft', 'finalized', 'published', 'paid', 'cancelled')
  ),
  constraint monthly_statements_currency_nonempty_check check (char_length(trim(currency)) > 0),
  constraint monthly_statements_period_check check (period_end >= period_start),
  constraint monthly_statements_amounts_nonnegative_check check (
    gross_amount_cents >= 0
    and platform_fee_cents >= 0
    and provider_fee_cents >= 0
    and net_amount_cents >= 0
    and refund_amount_cents >= 0
    and payout_amount_cents >= 0
  )
);

create unique index if not exists provider_payout_profiles_provider_account_id_key
  on public.provider_payout_profiles (provider, provider_account_id)
  where provider_account_id is not null;

create index if not exists provider_payout_profiles_teacher_id_idx
  on public.provider_payout_profiles (teacher_id);

create index if not exists provider_payout_profiles_provider_idx
  on public.provider_payout_profiles (provider);

create index if not exists provider_payout_profiles_verification_status_idx
  on public.provider_payout_profiles (verification_status);

create index if not exists payment_transactions_provider_idx
  on public.payment_transactions (provider);

create index if not exists payment_transactions_status_idx
  on public.payment_transactions (status);

create index if not exists payment_transactions_booking_id_idx
  on public.payment_transactions (booking_id);

create index if not exists payment_transactions_course_registration_intent_id_idx
  on public.payment_transactions (course_registration_intent_id);

create index if not exists payment_transactions_provider_checkout_id_idx
  on public.payment_transactions (provider_checkout_id)
  where provider_checkout_id is not null;

create index if not exists payment_transactions_provider_subscription_id_idx
  on public.payment_transactions (provider_subscription_id)
  where provider_subscription_id is not null;

create unique index if not exists payment_transactions_provider_payment_id_key
  on public.payment_transactions (provider, provider_payment_id)
  where provider_payment_id is not null;

create index if not exists ledger_entries_provider_payout_profile_id_idx
  on public.ledger_entries (provider_payout_profile_id);

create index if not exists ledger_entries_payout_status_idx
  on public.ledger_entries (payout_status);

create index if not exists ledger_entries_payout_batch_id_idx
  on public.ledger_entries (payout_batch_id);

create index if not exists ledger_entries_source_type_source_id_idx
  on public.ledger_entries (source_type, source_id);

create index if not exists payout_batches_payout_provider_idx
  on public.payout_batches (payout_provider);

create index if not exists payout_batches_status_idx
  on public.payout_batches (status);

create index if not exists payout_items_payout_batch_id_idx
  on public.payout_items (payout_batch_id);

create index if not exists payout_items_provider_payout_profile_id_idx
  on public.payout_items (provider_payout_profile_id);

create index if not exists payout_items_status_idx
  on public.payout_items (status);

create unique index if not exists payout_items_ledger_entry_id_key
  on public.payout_items (ledger_entry_id);

create index if not exists refund_records_payment_transaction_id_idx
  on public.refund_records (payment_transaction_id);

create index if not exists refund_records_status_idx
  on public.refund_records (status);

create unique index if not exists refund_records_provider_refund_id_key
  on public.refund_records (provider_refund_id)
  where provider_refund_id is not null;

create index if not exists provider_webhook_events_provider_idx
  on public.provider_webhook_events (provider);

create index if not exists provider_webhook_events_processing_status_idx
  on public.provider_webhook_events (processing_status);

create unique index if not exists provider_webhook_events_provider_event_id_key
  on public.provider_webhook_events (provider, provider_event_id);

create index if not exists monthly_statements_provider_payout_profile_id_idx
  on public.monthly_statements (provider_payout_profile_id);

create index if not exists monthly_statements_status_idx
  on public.monthly_statements (status);

create unique index if not exists monthly_statements_profile_period_key
  on public.monthly_statements (provider_payout_profile_id, period_start, period_end);

create or replace function public.set_reser_payment_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists provider_payout_profiles_set_updated_at on public.provider_payout_profiles;
create trigger provider_payout_profiles_set_updated_at
before update on public.provider_payout_profiles
for each row
execute function public.set_reser_payment_updated_at();

drop trigger if exists payment_transactions_set_updated_at on public.payment_transactions;
create trigger payment_transactions_set_updated_at
before update on public.payment_transactions
for each row
execute function public.set_reser_payment_updated_at();

drop trigger if exists payout_batches_set_updated_at on public.payout_batches;
create trigger payout_batches_set_updated_at
before update on public.payout_batches
for each row
execute function public.set_reser_payment_updated_at();

drop trigger if exists payout_items_set_updated_at on public.payout_items;
create trigger payout_items_set_updated_at
before update on public.payout_items
for each row
execute function public.set_reser_payment_updated_at();

drop trigger if exists refund_records_set_updated_at on public.refund_records;
create trigger refund_records_set_updated_at
before update on public.refund_records
for each row
execute function public.set_reser_payment_updated_at();

drop trigger if exists provider_webhook_events_set_updated_at on public.provider_webhook_events;
create trigger provider_webhook_events_set_updated_at
before update on public.provider_webhook_events
for each row
execute function public.set_reser_payment_updated_at();

drop trigger if exists monthly_statements_set_updated_at on public.monthly_statements;
create trigger monthly_statements_set_updated_at
before update on public.monthly_statements
for each row
execute function public.set_reser_payment_updated_at();

alter table public.provider_payout_profiles enable row level security;
alter table public.provider_payout_profiles force row level security;

alter table public.payment_transactions enable row level security;
alter table public.payment_transactions force row level security;

alter table public.ledger_entries enable row level security;
alter table public.ledger_entries force row level security;

alter table public.payout_batches enable row level security;
alter table public.payout_batches force row level security;

alter table public.payout_items enable row level security;
alter table public.payout_items force row level security;

alter table public.refund_records enable row level security;
alter table public.refund_records force row level security;

alter table public.provider_webhook_events enable row level security;
alter table public.provider_webhook_events force row level security;

alter table public.monthly_statements enable row level security;
alter table public.monthly_statements force row level security;

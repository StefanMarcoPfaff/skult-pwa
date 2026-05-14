create table if not exists public.subscription_contracts (
  id uuid primary key default gen_random_uuid(),
  course_registration_intent_id uuid null references public.course_registration_intents(id) on delete set null,
  course_id uuid not null references public.courses(id) on delete restrict,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  customer_email text not null,
  provider text not null,
  provider_subscription_id text null,
  provider_customer_id text null,
  provider_mandate_id text null,
  status text not null default 'draft',
  interval_unit text not null default 'month',
  interval_count integer not null default 1,
  base_amount_cents integer not null,
  currency text not null,
  billing_anchor_day integer not null default 1,
  next_charge_at timestamptz null,
  started_at timestamptz null,
  ended_at timestamptz null,
  cancel_effective_date date null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_contracts_status_check check (
    status in ('draft', 'pending_initial_payment', 'active', 'pause_scheduled', 'paused', 'cancel_scheduled', 'cancelled', 'ended', 'payment_holding', 'legacy_external')
  ),
  constraint subscription_contracts_provider_nonempty_check check (char_length(trim(provider)) > 0),
  constraint subscription_contracts_currency_nonempty_check check (char_length(trim(currency)) > 0),
  constraint subscription_contracts_customer_email_nonempty_check check (char_length(trim(customer_email)) > 0),
  constraint subscription_contracts_interval_unit_check check (interval_unit in ('month')),
  constraint subscription_contracts_interval_count_positive_check check (interval_count > 0),
  constraint subscription_contracts_base_amount_nonnegative_check check (base_amount_cents >= 0),
  constraint subscription_contracts_billing_anchor_day_check check (billing_anchor_day between 1 and 31)
);

create table if not exists public.subscription_periods (
  id uuid primary key default gen_random_uuid(),
  subscription_contract_id uuid not null references public.subscription_contracts(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  service_month date not null,
  status text not null default 'planned',
  planned_charge_at timestamptz null,
  charged_at timestamptz null,
  pause_mode text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_periods_status_check check (
    status in ('planned', 'paused', 'charge_pending', 'charged', 'partially_credited', 'credited', 'failed', 'cancelled')
  ),
  constraint subscription_periods_pause_mode_check check (
    pause_mode is null or pause_mode in ('course_pause', 'participant_pause')
  ),
  constraint subscription_periods_period_order_check check (period_end >= period_start),
  constraint subscription_periods_service_month_first_day_check check (
    service_month = date_trunc('month', service_month)::date
  )
);

create table if not exists public.subscription_charges (
  id uuid primary key default gen_random_uuid(),
  subscription_contract_id uuid not null references public.subscription_contracts(id) on delete cascade,
  subscription_period_id uuid null references public.subscription_periods(id) on delete set null,
  payment_transaction_id uuid null references public.payment_transactions(id) on delete set null,
  provider text not null,
  provider_charge_id text null,
  provider_invoice_id text null,
  provider_payment_reference text null,
  charge_type text not null,
  gross_amount_cents integer not null,
  currency text not null,
  status text not null default 'draft',
  charged_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_charges_provider_nonempty_check check (char_length(trim(provider)) > 0),
  constraint subscription_charges_currency_nonempty_check check (char_length(trim(currency)) > 0),
  constraint subscription_charges_charge_type_check check (
    charge_type in ('initial_proration', 'monthly_recurring', 'credit', 'refund_adjustment', 'manual_adjustment')
  ),
  constraint subscription_charges_status_check check (
    status in ('draft', 'scheduled', 'pending_provider', 'paid', 'failed', 'refunded', 'credited', 'cancelled')
  ),
  constraint subscription_charges_amount_nonnegative_check check (gross_amount_cents >= 0)
);

create table if not exists public.subscription_pause_windows (
  id uuid primary key default gen_random_uuid(),
  subscription_contract_id uuid null references public.subscription_contracts(id) on delete cascade,
  scope_type text not null,
  scope_id uuid not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'scheduled',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_pause_windows_scope_type_check check (
    scope_type in ('course', 'participant', 'contract')
  ),
  constraint subscription_pause_windows_status_check check (
    status in ('scheduled', 'active', 'completed', 'cancelled')
  ),
  constraint subscription_pause_windows_date_order_check check (end_date >= start_date)
);

create table if not exists public.subscription_credits (
  id uuid primary key default gen_random_uuid(),
  subscription_contract_id uuid not null references public.subscription_contracts(id) on delete cascade,
  origin_type text not null,
  origin_id uuid null,
  amount_cents integer not null,
  remaining_amount_cents integer not null,
  currency text not null,
  status text not null default 'available',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_credits_origin_type_check check (
    origin_type in ('refund', 'overpayment', 'manual_adjustment', 'carry_forward')
  ),
  constraint subscription_credits_currency_nonempty_check check (char_length(trim(currency)) > 0),
  constraint subscription_credits_status_check check (
    status in ('available', 'partially_applied', 'applied', 'expired', 'cancelled')
  ),
  constraint subscription_credits_amount_nonnegative_check check (
    amount_cents >= 0 and remaining_amount_cents >= 0 and remaining_amount_cents <= amount_cents
  )
);

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_contract_id uuid null references public.subscription_contracts(id) on delete cascade,
  subscription_period_id uuid null references public.subscription_periods(id) on delete cascade,
  subscription_charge_id uuid null references public.subscription_charges(id) on delete cascade,
  event_type text not null,
  event_source text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint subscription_events_event_type_nonempty_check check (char_length(trim(event_type)) > 0),
  constraint subscription_events_event_source_check check (
    event_source in ('system', 'stripe', 'admin', 'migration')
  )
);

create unique index if not exists subscription_contracts_intent_id_key
  on public.subscription_contracts (course_registration_intent_id)
  where course_registration_intent_id is not null;

create unique index if not exists subscription_contracts_provider_subscription_key
  on public.subscription_contracts (provider, provider_subscription_id)
  where provider_subscription_id is not null;

create index if not exists subscription_contracts_course_id_idx
  on public.subscription_contracts (course_id);

create index if not exists subscription_contracts_teacher_id_idx
  on public.subscription_contracts (teacher_id);

create index if not exists subscription_contracts_status_idx
  on public.subscription_contracts (status);

create index if not exists subscription_contracts_provider_customer_id_idx
  on public.subscription_contracts (provider, provider_customer_id)
  where provider_customer_id is not null;

create unique index if not exists subscription_periods_contract_service_month_key
  on public.subscription_periods (subscription_contract_id, service_month);

create index if not exists subscription_periods_contract_id_idx
  on public.subscription_periods (subscription_contract_id);

create index if not exists subscription_periods_status_idx
  on public.subscription_periods (status);

create index if not exists subscription_periods_planned_charge_at_idx
  on public.subscription_periods (planned_charge_at);

create index if not exists subscription_charges_contract_id_idx
  on public.subscription_charges (subscription_contract_id);

create index if not exists subscription_charges_period_id_idx
  on public.subscription_charges (subscription_period_id);

create index if not exists subscription_charges_status_idx
  on public.subscription_charges (status);

create index if not exists subscription_charges_payment_transaction_id_idx
  on public.subscription_charges (payment_transaction_id)
  where payment_transaction_id is not null;

create unique index if not exists subscription_charges_provider_invoice_key
  on public.subscription_charges (provider, provider_invoice_id)
  where provider_invoice_id is not null;

create unique index if not exists subscription_charges_provider_charge_key
  on public.subscription_charges (provider, provider_charge_id)
  where provider_charge_id is not null;

create index if not exists subscription_charges_provider_payment_reference_idx
  on public.subscription_charges (provider, provider_payment_reference)
  where provider_payment_reference is not null;

create index if not exists subscription_pause_windows_contract_id_idx
  on public.subscription_pause_windows (subscription_contract_id);

create index if not exists subscription_pause_windows_scope_idx
  on public.subscription_pause_windows (scope_type, scope_id);

create index if not exists subscription_pause_windows_status_idx
  on public.subscription_pause_windows (status);

create index if not exists subscription_credits_contract_id_idx
  on public.subscription_credits (subscription_contract_id);

create index if not exists subscription_credits_status_idx
  on public.subscription_credits (status);

create index if not exists subscription_events_contract_id_idx
  on public.subscription_events (subscription_contract_id);

create index if not exists subscription_events_period_id_idx
  on public.subscription_events (subscription_period_id);

create index if not exists subscription_events_charge_id_idx
  on public.subscription_events (subscription_charge_id);

create index if not exists subscription_events_event_type_idx
  on public.subscription_events (event_type);

alter table public.course_registration_intents
  add column if not exists subscription_contract_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'course_registration_intents_subscription_contract_id_fkey'
      and conrelid = 'public.course_registration_intents'::regclass
  ) then
    alter table public.course_registration_intents
      add constraint course_registration_intents_subscription_contract_id_fkey
      foreign key (subscription_contract_id)
      references public.subscription_contracts(id)
      on delete set null;
  end if;
end $$;

create index if not exists course_registration_intents_subscription_contract_id_idx
  on public.course_registration_intents (subscription_contract_id)
  where subscription_contract_id is not null;

alter table public.payment_transactions
  add column if not exists subscription_contract_id uuid null,
  add column if not exists subscription_charge_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_transactions_subscription_contract_id_fkey'
      and conrelid = 'public.payment_transactions'::regclass
  ) then
    alter table public.payment_transactions
      add constraint payment_transactions_subscription_contract_id_fkey
      foreign key (subscription_contract_id)
      references public.subscription_contracts(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_transactions_subscription_charge_id_fkey'
      and conrelid = 'public.payment_transactions'::regclass
  ) then
    alter table public.payment_transactions
      add constraint payment_transactions_subscription_charge_id_fkey
      foreign key (subscription_charge_id)
      references public.subscription_charges(id)
      on delete set null;
  end if;
end $$;

create index if not exists payment_transactions_subscription_contract_id_idx
  on public.payment_transactions (subscription_contract_id)
  where subscription_contract_id is not null;

create index if not exists payment_transactions_subscription_charge_id_idx
  on public.payment_transactions (subscription_charge_id)
  where subscription_charge_id is not null;

alter table public.ledger_entries
  add column if not exists subscription_contract_id uuid null,
  add column if not exists subscription_charge_id uuid null,
  add column if not exists service_period_start date null,
  add column if not exists service_period_end date null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ledger_entries_subscription_contract_id_fkey'
      and conrelid = 'public.ledger_entries'::regclass
  ) then
    alter table public.ledger_entries
      add constraint ledger_entries_subscription_contract_id_fkey
      foreign key (subscription_contract_id)
      references public.subscription_contracts(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ledger_entries_subscription_charge_id_fkey'
      and conrelid = 'public.ledger_entries'::regclass
  ) then
    alter table public.ledger_entries
      add constraint ledger_entries_subscription_charge_id_fkey
      foreign key (subscription_charge_id)
      references public.subscription_charges(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ledger_entries_service_period_order_check'
      and conrelid = 'public.ledger_entries'::regclass
  ) then
    alter table public.ledger_entries
      add constraint ledger_entries_service_period_order_check
      check (
        service_period_start is null
        or service_period_end is null
        or service_period_end >= service_period_start
      );
  end if;
end $$;

create index if not exists ledger_entries_subscription_contract_id_idx
  on public.ledger_entries (subscription_contract_id)
  where subscription_contract_id is not null;

create index if not exists ledger_entries_subscription_charge_id_idx
  on public.ledger_entries (subscription_charge_id)
  where subscription_charge_id is not null;

create index if not exists ledger_entries_service_period_idx
  on public.ledger_entries (service_period_start, service_period_end)
  where service_period_start is not null or service_period_end is not null;

drop trigger if exists subscription_contracts_set_updated_at on public.subscription_contracts;
create trigger subscription_contracts_set_updated_at
before update on public.subscription_contracts
for each row
execute function public.set_reser_payment_updated_at();

drop trigger if exists subscription_periods_set_updated_at on public.subscription_periods;
create trigger subscription_periods_set_updated_at
before update on public.subscription_periods
for each row
execute function public.set_reser_payment_updated_at();

drop trigger if exists subscription_charges_set_updated_at on public.subscription_charges;
create trigger subscription_charges_set_updated_at
before update on public.subscription_charges
for each row
execute function public.set_reser_payment_updated_at();

drop trigger if exists subscription_pause_windows_set_updated_at on public.subscription_pause_windows;
create trigger subscription_pause_windows_set_updated_at
before update on public.subscription_pause_windows
for each row
execute function public.set_reser_payment_updated_at();

drop trigger if exists subscription_credits_set_updated_at on public.subscription_credits;
create trigger subscription_credits_set_updated_at
before update on public.subscription_credits
for each row
execute function public.set_reser_payment_updated_at();

alter table public.subscription_contracts enable row level security;
alter table public.subscription_contracts force row level security;

alter table public.subscription_periods enable row level security;
alter table public.subscription_periods force row level security;

alter table public.subscription_charges enable row level security;
alter table public.subscription_charges force row level security;

alter table public.subscription_pause_windows enable row level security;
alter table public.subscription_pause_windows force row level security;

alter table public.subscription_credits enable row level security;
alter table public.subscription_credits force row level security;

alter table public.subscription_events enable row level security;
alter table public.subscription_events force row level security;

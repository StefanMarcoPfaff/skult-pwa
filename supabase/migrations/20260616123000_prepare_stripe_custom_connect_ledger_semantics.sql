alter table public.payment_transactions
  add column if not exists provider_payout_profile_id uuid null references public.provider_payout_profiles(id) on delete set null,
  add column if not exists stripe_charge_id text null,
  add column if not exists stripe_payment_intent_id text null,
  add column if not exists stripe_balance_transaction_id text null,
  add column if not exists stripe_application_fee_id text null,
  add column if not exists stripe_transfer_id text null,
  add column if not exists stripe_payout_id text null,
  add column if not exists stripe_refund_id text null,
  add column if not exists stripe_dispute_id text null,
  add column if not exists refunded_amount_cents integer not null default 0,
  add column if not exists refund_status text not null default 'none';

alter table public.payment_transactions
  drop constraint if exists payment_transactions_status_check;

alter table public.payment_transactions
  add constraint payment_transactions_status_check check (
    status in (
      'pending',
      'paid',
      'failed',
      'cancelled',
      'refunded',
      'refunded_partial',
      'refunded_full',
      'requires_action',
      'disputed',
      'chargeback_lost',
      'chargeback_won',
      'unknown'
    )
  );

alter table public.payment_transactions
  drop constraint if exists payment_transactions_refund_status_check;

alter table public.payment_transactions
  add constraint payment_transactions_refund_status_check check (
    refund_status in ('none', 'partial', 'full')
  );

alter table public.payment_transactions
  drop constraint if exists payment_transactions_refunded_amount_nonnegative_check;

alter table public.payment_transactions
  add constraint payment_transactions_refunded_amount_nonnegative_check check (
    refunded_amount_cents >= 0 and refunded_amount_cents <= amount_cents
  );

alter table public.ledger_entries
  add column if not exists stripe_charge_id text null,
  add column if not exists stripe_payment_intent_id text null,
  add column if not exists stripe_balance_transaction_id text null,
  add column if not exists stripe_application_fee_id text null,
  add column if not exists stripe_transfer_id text null,
  add column if not exists stripe_payout_id text null,
  add column if not exists stripe_refund_id text null,
  add column if not exists stripe_dispute_id text null;

alter table public.ledger_entries
  drop constraint if exists ledger_entries_payout_status_check;

alter table public.ledger_entries
  add constraint ledger_entries_payout_status_check check (
    payout_status in (
      'pending',
      'reserved',
      'pending_event_completion',
      'payable',
      'transfer_created',
      'paid_by_stripe',
      'refunded_partial',
      'refunded_full',
      'disputed',
      'chargeback_lost',
      'chargeback_won',
      'batched',
      'available',
      'scheduled',
      'paid',
      'failed',
      'cancelled',
      'held'
    )
  );

alter table public.refund_records
  add column if not exists stripe_refund_id text null,
  add column if not exists stripe_charge_id text null,
  add column if not exists stripe_payment_intent_id text null,
  add column if not exists refund_kind text not null default 'unknown';

alter table public.refund_records
  drop constraint if exists refund_records_refund_kind_check;

alter table public.refund_records
  add constraint refund_records_refund_kind_check check (
    refund_kind in ('partial', 'full', 'unknown')
  );

alter table public.payout_batches
  add column if not exists stripe_payout_id text null,
  add column if not exists stripe_balance_transaction_id text null,
  add column if not exists settlement_reference text null;

alter table public.payout_items
  add column if not exists stripe_payout_id text null,
  add column if not exists stripe_transfer_id text null,
  add column if not exists stripe_balance_transaction_id text null,
  add column if not exists settlement_reference text null;

create index if not exists payment_transactions_provider_payout_profile_id_idx
  on public.payment_transactions (provider_payout_profile_id)
  where provider_payout_profile_id is not null;

create index if not exists payment_transactions_stripe_charge_id_idx
  on public.payment_transactions (stripe_charge_id)
  where stripe_charge_id is not null;

create index if not exists payment_transactions_stripe_payment_intent_id_idx
  on public.payment_transactions (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists payment_transactions_stripe_transfer_id_idx
  on public.payment_transactions (stripe_transfer_id)
  where stripe_transfer_id is not null;

create index if not exists payment_transactions_stripe_payout_id_idx
  on public.payment_transactions (stripe_payout_id)
  where stripe_payout_id is not null;

create index if not exists payment_transactions_stripe_refund_id_idx
  on public.payment_transactions (stripe_refund_id)
  where stripe_refund_id is not null;

create index if not exists payment_transactions_stripe_dispute_id_idx
  on public.payment_transactions (stripe_dispute_id)
  where stripe_dispute_id is not null;

create index if not exists ledger_entries_stripe_charge_id_idx
  on public.ledger_entries (stripe_charge_id)
  where stripe_charge_id is not null;

create index if not exists ledger_entries_stripe_payment_intent_id_idx
  on public.ledger_entries (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists ledger_entries_stripe_transfer_id_idx
  on public.ledger_entries (stripe_transfer_id)
  where stripe_transfer_id is not null;

create index if not exists ledger_entries_stripe_payout_id_idx
  on public.ledger_entries (stripe_payout_id)
  where stripe_payout_id is not null;

create index if not exists ledger_entries_stripe_refund_id_idx
  on public.ledger_entries (stripe_refund_id)
  where stripe_refund_id is not null;

create index if not exists ledger_entries_stripe_dispute_id_idx
  on public.ledger_entries (stripe_dispute_id)
  where stripe_dispute_id is not null;

create index if not exists refund_records_stripe_refund_id_idx
  on public.refund_records (stripe_refund_id)
  where stripe_refund_id is not null;

create index if not exists payout_batches_stripe_payout_id_idx
  on public.payout_batches (stripe_payout_id)
  where stripe_payout_id is not null;

create index if not exists payout_items_stripe_payout_id_idx
  on public.payout_items (stripe_payout_id)
  where stripe_payout_id is not null;

comment on column public.payment_transactions.provider_payout_profile_id is
  'Provider payout profile used for ledger attribution. Stripe Custom Connect payments must keep this set even when RESER never holds the provider share.';

comment on column public.payment_transactions.refund_status is
  'Aggregate refund state for the payment transaction. Partial refunds must not force status=refunded_full.';

comment on column public.payment_transactions.refunded_amount_cents is
  'Cumulative succeeded refund amount in cents. Prepared for partial/full refund distinction.';

comment on table public.payout_batches is
  'Stripe settlement mirror for provider-visible accounting. Rows document Stripe payout/settlement state and must not be interpreted as RESER initiating money movement.';

comment on table public.payout_items is
  'Stripe settlement line items linked to ledger entries. Rows document Stripe transfers/payouts and must not be interpreted as RESER initiating money movement.';

comment on column public.payout_batches.settlement_reference is
  'External settlement reference, typically Stripe payout or balance transaction context.';

comment on column public.payout_items.settlement_reference is
  'External settlement line reference, typically Stripe transfer, payout, or balance transaction context.';

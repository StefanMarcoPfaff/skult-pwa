create table if not exists public.financial_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  status text not null default 'draft',
  document_number text null,
  provider_id uuid null references public.profiles(id) on delete set null,
  customer_email text null,
  booking_id uuid null references public.bookings(id) on delete set null,
  course_id uuid null references public.courses(id) on delete set null,
  course_registration_intent_id uuid null references public.course_registration_intents(id) on delete set null,
  subscription_contract_id uuid null references public.subscription_contracts(id) on delete set null,
  payout_batch_id uuid null references public.payout_batches(id) on delete set null,
  payout_item_id uuid null references public.payout_items(id) on delete set null,
  payment_transaction_id uuid null references public.payment_transactions(id) on delete set null,
  refund_record_id uuid null references public.refund_records(id) on delete set null,
  ledger_entry_id uuid null references public.ledger_entries(id) on delete set null,
  period_start date null,
  period_end date null,
  currency text not null default 'EUR',
  gross_amount_cents integer not null default 0,
  platform_fee_cents integer not null default 0,
  provider_payout_cents integer not null default 0,
  tax_amount_cents integer null,
  metadata jsonb not null default '{}'::jsonb,
  pdf_path text null,
  issued_at timestamptz null,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_documents_document_type_check check (
    document_type in (
      'customer_receipt',
      'provider_payout_statement',
      'provider_platform_fee_invoice',
      'platform_revenue_statement',
      'refund_receipt'
    )
  ),
  constraint financial_documents_status_check check (
    status in ('draft', 'issued', 'voided')
  ),
  constraint financial_documents_currency_nonempty_check check (char_length(trim(currency)) > 0),
  constraint financial_documents_customer_email_nonempty_check check (
    customer_email is null or char_length(trim(customer_email)) > 0
  ),
  constraint financial_documents_amounts_nonnegative_check check (
    gross_amount_cents >= 0
    and platform_fee_cents >= 0
    and provider_payout_cents >= 0
    and (tax_amount_cents is null or tax_amount_cents >= 0)
  ),
  constraint financial_documents_period_order_check check (
    period_start is null or period_end is null or period_end >= period_start
  )
);

create unique index if not exists financial_documents_document_number_key
  on public.financial_documents (document_number)
  where document_number is not null;

create index if not exists financial_documents_provider_id_idx
  on public.financial_documents (provider_id);

create index if not exists financial_documents_booking_id_idx
  on public.financial_documents (booking_id);

create index if not exists financial_documents_course_id_idx
  on public.financial_documents (course_id);

create index if not exists financial_documents_document_type_idx
  on public.financial_documents (document_type);

create index if not exists financial_documents_issued_at_idx
  on public.financial_documents (issued_at);

create index if not exists financial_documents_payout_batch_id_idx
  on public.financial_documents (payout_batch_id);

create index if not exists financial_documents_payment_transaction_id_idx
  on public.financial_documents (payment_transaction_id);

drop trigger if exists financial_documents_set_updated_at on public.financial_documents;
create trigger financial_documents_set_updated_at
before update on public.financial_documents
for each row
execute function public.set_reser_payment_updated_at();

alter table public.financial_documents enable row level security;
alter table public.financial_documents force row level security;

drop policy if exists "financial_documents_select_own" on public.financial_documents;
create policy "financial_documents_select_own"
on public.financial_documents
for select
to authenticated
using (provider_id = auth.uid());

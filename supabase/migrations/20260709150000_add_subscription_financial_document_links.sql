alter table public.financial_documents
  add column if not exists subscription_charge_id uuid null references public.subscription_charges(id) on delete set null;

create index if not exists financial_documents_subscription_charge_id_idx
  on public.financial_documents (subscription_charge_id)
  where subscription_charge_id is not null;

create unique index if not exists financial_documents_subscription_monthly_payout_batch_key
  on public.financial_documents (payout_batch_id)
  where document_type = 'provider_payout_statement'
    and payout_batch_id is not null
    and metadata ->> 'documentScope' = 'subscription_monthly_payout';

create unique index if not exists financial_documents_subscription_monthly_fee_batch_key
  on public.financial_documents (payout_batch_id)
  where document_type = 'provider_platform_fee_invoice'
    and payout_batch_id is not null
    and metadata ->> 'documentScope' = 'subscription_monthly_platform_fee';

create unique index if not exists financial_documents_subscription_monthly_customer_receipt_key
  on public.financial_documents (subscription_charge_id)
  where document_type = 'customer_receipt'
    and subscription_charge_id is not null
    and metadata ->> 'documentScope' = 'subscription_monthly_customer_receipt';

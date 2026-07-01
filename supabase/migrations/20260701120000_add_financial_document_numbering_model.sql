alter table public.financial_documents
  add column if not exists document_country text not null default 'DE',
  add column if not exists document_locale text not null default 'de-DE',
  add column if not exists document_template_version text not null default '1.0',
  add column if not exists tax_regime text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'financial_documents_document_country_nonempty_check'
  ) then
    alter table public.financial_documents
      add constraint financial_documents_document_country_nonempty_check
      check (char_length(trim(document_country)) > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'financial_documents_document_locale_nonempty_check'
  ) then
    alter table public.financial_documents
      add constraint financial_documents_document_locale_nonempty_check
      check (char_length(trim(document_locale)) > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'financial_documents_document_template_version_nonempty_check'
  ) then
    alter table public.financial_documents
      add constraint financial_documents_document_template_version_nonempty_check
      check (char_length(trim(document_template_version)) > 0);
  end if;
end $$;

create table if not exists public.financial_document_counters (
  document_country text not null,
  document_type text not null,
  document_year integer not null,
  last_number integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (document_country, document_type, document_year),
  constraint financial_document_counters_country_nonempty_check check (char_length(trim(document_country)) > 0),
  constraint financial_document_counters_type_check check (
    document_type in (
      'customer_receipt',
      'provider_payout_statement',
      'provider_platform_fee_invoice',
      'platform_revenue_statement',
      'refund_receipt'
    )
  ),
  constraint financial_document_counters_year_check check (document_year between 2000 and 9999),
  constraint financial_document_counters_last_number_check check (last_number >= 0)
);

drop trigger if exists financial_document_counters_set_updated_at on public.financial_document_counters;
create trigger financial_document_counters_set_updated_at
before update on public.financial_document_counters
for each row
execute function public.set_reser_payment_updated_at();

create or replace function public.financial_document_number_prefix(p_document_type text)
returns text
language sql
immutable
as $$
  select case p_document_type
    when 'customer_receipt' then 'CUST'
    when 'provider_platform_fee_invoice' then 'FEE'
    when 'provider_payout_statement' then 'PAY'
    when 'refund_receipt' then 'REF'
    when 'platform_revenue_statement' then 'REV'
    else null
  end
$$;

create or replace function public.ensure_financial_document_number(p_document_id uuid)
returns table (
  id uuid,
  document_number text,
  document_country text,
  document_year integer,
  sequence_number integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.financial_documents%rowtype;
  v_country text;
  v_prefix text;
  v_year integer;
  v_next integer;
  v_number text;
begin
  select *
  into v_document
  from public.financial_documents
  where financial_documents.id = p_document_id
  for update;

  if not found then
    raise exception 'Financial document not found: %', p_document_id;
  end if;

  if v_document.document_number is not null and btrim(v_document.document_number) <> '' then
    id := v_document.id;
    document_number := v_document.document_number;
    document_country := v_document.document_country;
    document_year := extract(year from coalesce(v_document.issued_at, v_document.created_at, now()))::integer;
    sequence_number := null;
    return next;
    return;
  end if;

  v_country := upper(coalesce(nullif(btrim(v_document.document_country), ''), 'DE'));
  v_prefix := public.financial_document_number_prefix(v_document.document_type);
  if v_prefix is null then
    raise exception 'Unsupported financial document type for numbering: %', v_document.document_type;
  end if;
  v_year := extract(year from coalesce(v_document.issued_at, v_document.created_at, now()))::integer;

  insert into public.financial_document_counters (
    document_country,
    document_type,
    document_year,
    last_number
  )
  values (
    v_country,
    v_document.document_type,
    v_year,
    1
  )
  on conflict (document_country, document_type, document_year)
  do update set last_number = public.financial_document_counters.last_number + 1
  returning last_number into v_next;

  v_number := format('%s-%s-%s-%s', v_country, v_prefix, v_year, lpad(v_next::text, 6, '0'));

  update public.financial_documents
  set
    document_number = v_number,
    document_country = v_country,
    document_locale = coalesce(nullif(btrim(document_locale), ''), 'de-DE'),
    document_template_version = coalesce(nullif(btrim(document_template_version), ''), '1.0')
  where financial_documents.id = p_document_id
  returning financial_documents.id into id;

  document_number := v_number;
  document_country := v_country;
  document_year := v_year;
  sequence_number := v_next;
  return next;
end;
$$;

grant execute on function public.ensure_financial_document_number(uuid) to authenticated, service_role;

alter table public.bookings
  add column if not exists customer_billing_company_name text;

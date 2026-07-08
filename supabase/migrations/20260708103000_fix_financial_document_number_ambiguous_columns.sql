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
  select fd.*
  into v_document
  from public.financial_documents as fd
  where fd.id = p_document_id
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
  on conflict on constraint financial_document_counters_pkey
  do update set last_number = public.financial_document_counters.last_number + 1
  returning public.financial_document_counters.last_number into v_next;

  v_number := format('%s-%s-%s-%s', v_country, v_prefix, v_year, lpad(v_next::text, 6, '0'));

  update public.financial_documents as fd
  set
    document_number = v_number,
    document_country = v_country,
    document_locale = coalesce(nullif(btrim(fd.document_locale), ''), 'de-DE'),
    document_template_version = coalesce(nullif(btrim(fd.document_template_version), ''), '1.0')
  where fd.id = p_document_id
  returning fd.id into id;

  document_number := v_number;
  document_country := v_country;
  document_year := v_year;
  sequence_number := v_next;
  return next;
end;
$$;

grant execute on function public.ensure_financial_document_number(uuid) to authenticated, service_role;

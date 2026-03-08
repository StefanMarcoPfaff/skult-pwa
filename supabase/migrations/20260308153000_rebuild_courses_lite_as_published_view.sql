do $$
declare
  relkind "char";
begin
  select c.relkind
  into relkind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'courses_lite'
  limit 1;

  if relkind = 'v' then
    execute 'drop view public.courses_lite';
  elsif relkind = 'r' then
    -- Keep old rows as backup if courses_lite was a physical table (often source of stale data).
    execute 'alter table public.courses_lite rename to courses_lite_legacy_20260308';
  end if;

  execute $view$
    create view public.courses_lite
    with (security_invoker = true) as
    select
      c.id,
      c.kind,
      c.kind as offer_type,
      c.title,
      c.description,
      c.description as subtitle,
      c.location,
      c.starts_at,
      c.capacity,
      null::integer as seats_taken,
      c.price_cents,
      c.currency,
      case
        when c.price_cents is null or c.price_cents <= 0 then 'free'
        else 'paid'
      end::text as price_type,
      c.weekday,
      c.start_time,
      c.recurrence_type,
      c.is_published,
      c.created_at
    from public.courses c
    where c.is_published = true
  $view$;

  grant select on public.courses_lite to anon, authenticated;
end $$;


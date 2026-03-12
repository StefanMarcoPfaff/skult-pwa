create or replace view public.courses_lite
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
  c.duration_minutes,
  c.recurrence_type,
  coalesce(c.trial_mode, 'all_sessions') as trial_mode,
  c.is_published,
  c.created_at
from public.courses c
where c.is_published = true;

grant select on public.courses_lite to anon, authenticated;

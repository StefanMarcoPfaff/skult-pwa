alter table public.courses
  add column if not exists visibility text;

update public.courses
set visibility = 'public'
where visibility is null
  and coalesce(is_published, false) = true;

update public.courses
set visibility = coalesce(visibility, 'public');

alter table public.courses
  alter column visibility set default 'public';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'courses_visibility_check'
      and conrelid = 'public.courses'::regclass
  ) then
    alter table public.courses
      add constraint courses_visibility_check
      check (visibility in ('public', 'private_link'));
  end if;
end
$$;

create index if not exists courses_visibility_idx
  on public.courses (visibility);

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
  c.ends_at,
  c.capacity,
  null::integer as seats_taken,
  c.price_cents,
  c.currency,
  case
    when c.price_cents is null or c.price_cents <= 0 then 'free'
    else 'paid'
  end::text as price_type,
  c.weekday::integer as weekday,
  c.start_time::text as start_time,
  c.duration_minutes::integer as duration_minutes,
  c.recurrence_type::text as recurrence_type,
  coalesce(c.trial_mode, 'all_sessions')::text as trial_mode,
  c.is_published,
  c.status,
  c.pause_start_date,
  c.pause_end_date,
  c.stop_date,
  c.visibility,
  case
    when c.visibility <> 'public' then false
    when c.kind = 'workshop' then
      c.status = 'active'
      and c.starts_at is not null
      and c.starts_at >= now()
    when c.kind = 'course' then
      c.status = 'active'
      and c.starts_at is not null
      and (c.ends_at is null or c.ends_at >= now())
    else false
  end as is_publicly_visible,
  c.created_at
from public.courses c
where c.is_published = true;

grant select on public.courses_lite to anon, authenticated;

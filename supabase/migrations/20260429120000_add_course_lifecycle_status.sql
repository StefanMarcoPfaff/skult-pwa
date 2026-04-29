do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'course_status'
  ) then
    create type public.course_status as enum (
      'draft',
      'active',
      'pause_scheduled',
      'paused',
      'stop_scheduled',
      'ended'
    );
  end if;
end
$$;

alter table public.courses
  add column if not exists status public.course_status,
  add column if not exists pause_start_date date,
  add column if not exists pause_end_date date,
  add column if not exists stop_date date;

update public.courses
set status = case
  when kind = 'course' and ends_at is not null and ends_at < now() then 'ended'::public.course_status
  when coalesce(is_published, false) then 'active'::public.course_status
  else 'draft'::public.course_status
end
where status is null;

update public.courses
set is_published = false
where status = 'ended'::public.course_status
  and coalesce(is_published, false) = true;

alter table public.courses
  alter column status set default 'draft'::public.course_status,
  alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'courses_pause_start_last_day_check'
  ) then
    alter table public.courses
      add constraint courses_pause_start_last_day_check
      check (
        pause_start_date is null
        or pause_start_date
          = (date_trunc('month', pause_start_date::timestamp) + interval '1 month - 1 day')::date
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'courses_pause_end_first_day_check'
  ) then
    alter table public.courses
      add constraint courses_pause_end_first_day_check
      check (pause_end_date is null or extract(day from pause_end_date) = 1);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'courses_pause_window_order_check'
  ) then
    alter table public.courses
      add constraint courses_pause_window_order_check
      check (
        pause_start_date is null
        or pause_end_date is null
        or pause_end_date > pause_start_date
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'courses_stop_date_last_day_check'
  ) then
    alter table public.courses
      add constraint courses_stop_date_last_day_check
      check (
        stop_date is null
        or stop_date
          = (date_trunc('month', stop_date::timestamp) + interval '1 month - 1 day')::date
      );
  end if;
end
$$;

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
  case
    when c.kind = 'workshop' then c.starts_at is not null and c.starts_at >= now()
    when c.kind = 'course' then
      c.status in ('active', 'pause_scheduled', 'stop_scheduled')
      and c.starts_at is not null
      and (c.ends_at is null or c.ends_at >= now())
    else false
  end as is_publicly_visible,
  c.created_at
from public.courses c
where c.is_published = true;

grant select on public.courses_lite to anon, authenticated;

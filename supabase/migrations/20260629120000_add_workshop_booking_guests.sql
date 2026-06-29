alter table public.courses
  add column if not exists max_guest_count_per_booking integer not null default 0;

update public.courses
set max_guest_count_per_booking = 0
where max_guest_count_per_booking is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'courses_max_guest_count_per_booking_check'
  ) then
    alter table public.courses
      add constraint courses_max_guest_count_per_booking_check
      check (max_guest_count_per_booking >= 0);
  end if;
end $$;

create table if not exists public.workshop_booking_guests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  course_id uuid null references public.courses(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text null,
  position integer not null,
  confirmation_email_sent_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint workshop_booking_guests_name_check check (
    length(btrim(first_name)) > 0 and length(btrim(last_name)) > 0
  ),
  constraint workshop_booking_guests_position_check check (position >= 1)
);

create unique index if not exists workshop_booking_guests_booking_position_key
  on public.workshop_booking_guests (booking_id, position);

create index if not exists workshop_booking_guests_booking_id_idx
  on public.workshop_booking_guests (booking_id);

create index if not exists workshop_booking_guests_course_id_idx
  on public.workshop_booking_guests (course_id);

alter table public.tickets
  add column if not exists workshop_booking_guest_id uuid null references public.workshop_booking_guests(id) on delete cascade;

drop index if exists tickets_booking_id_key;

create unique index if not exists tickets_primary_booking_id_key
  on public.tickets (booking_id)
  where booking_id is not null and workshop_booking_guest_id is null;

create unique index if not exists tickets_workshop_booking_guest_id_key
  on public.tickets (workshop_booking_guest_id)
  where workshop_booking_guest_id is not null;

create index if not exists tickets_workshop_booking_guest_id_idx
  on public.tickets (workshop_booking_guest_id);

create or replace function public.create_workshop_with_sessions(
  p_title text,
  p_description text,
  p_location text,
  p_location_details text,
  p_instructor_name text,
  p_workshop_storno_policy text,
  p_capacity integer,
  p_max_guest_count_per_booking integer,
  p_price_cents integer,
  p_currency text,
  p_sessions jsonb
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_course_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.courses (
    teacher_id,
    kind,
    title,
    description,
    location,
    location_details,
    instructor_name,
    workshop_storno_policy,
    capacity,
    max_guest_count_per_booking,
    price_cents,
    currency,
    is_published,
    starts_at
  ) values (
    auth.uid(),
    'workshop',
    p_title,
    p_description,
    p_location,
    p_location_details,
    p_instructor_name,
    p_workshop_storno_policy,
    p_capacity,
    greatest(0, coalesce(p_max_guest_count_per_booking, 0)),
    p_price_cents,
    p_currency,
    false,
    (p_sessions->0->>'starts_at')::timestamptz
  )
  returning id into v_course_id;

  insert into public.course_sessions (course_id, starts_at, ends_at)
  select
    v_course_id,
    (value->>'starts_at')::timestamptz,
    (value->>'ends_at')::timestamptz
  from jsonb_array_elements(p_sessions) as value;

  return v_course_id;
end;
$$;

grant execute on function public.create_workshop_with_sessions(
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  text,
  jsonb
) to authenticated;

create or replace function public.is_capacity_active_workshop_booking(
  p_status text,
  p_payment_status text,
  p_refunded_at timestamptz,
  p_archived_at timestamptz
) returns boolean
language sql
immutable
as $$
  select
    p_archived_at is null
    and p_refunded_at is null
    and coalesce(lower(p_status), '') in ('pending', 'paid')
    and coalesce(lower(p_payment_status), '') not in ('cancelled', 'refunded');
$$;

create or replace function public.workshop_reserved_seat_count(p_course_id uuid, p_exclude_booking_id uuid default null)
returns integer
language sql
stable
as $$
  select coalesce(sum(1 + coalesce(guest_counts.guest_count, 0)), 0)::integer
  from public.bookings b
  left join (
    select booking_id, count(*)::integer as guest_count
    from public.workshop_booking_guests
    group by booking_id
  ) guest_counts on guest_counts.booking_id = b.id
  where b.course_id = p_course_id
    and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
    and public.is_capacity_active_workshop_booking(b.status, b.payment_status, b.refunded_at, b.archived_at);
$$;

create or replace function public.prevent_workshop_booking_capacity_overrun()
returns trigger
language plpgsql
as $$
declare
  v_capacity integer;
  v_reserved integer;
begin
  if new.course_id is null then
    return new;
  end if;

  if not public.is_capacity_active_workshop_booking(new.status, new.payment_status, new.refunded_at, new.archived_at) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('workshop-capacity:' || new.course_id::text));

  select capacity into v_capacity
  from public.courses
  where id = new.course_id
    and kind in ('workshop', 'exclusive_offer');

  if v_capacity is null then
    return new;
  end if;

  v_reserved := public.workshop_reserved_seat_count(
    new.course_id,
    case when tg_op = 'UPDATE' then new.id else null end
  );

  if v_reserved + 1 > v_capacity then
    raise exception 'Dieses Angebot hat nicht mehr genuegend freie Plaetze.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_workshop_booking_capacity_overrun on public.bookings;
create trigger prevent_workshop_booking_capacity_overrun
before insert or update of course_id, status, payment_status, refunded_at, archived_at
on public.bookings
for each row
execute function public.prevent_workshop_booking_capacity_overrun();

create or replace function public.prevent_workshop_guest_capacity_overrun()
returns trigger
language plpgsql
as $$
declare
  v_course_id uuid;
  v_capacity integer;
  v_reserved integer;
begin
  select b.course_id into v_course_id
  from public.bookings b
  where b.id = new.booking_id
    and public.is_capacity_active_workshop_booking(b.status, b.payment_status, b.refunded_at, b.archived_at);

  if v_course_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('workshop-capacity:' || v_course_id::text));

  select capacity into v_capacity
  from public.courses
  where id = v_course_id
    and kind in ('workshop', 'exclusive_offer');

  if v_capacity is null then
    new.course_id := coalesce(new.course_id, v_course_id);
    return new;
  end if;

  v_reserved := public.workshop_reserved_seat_count(v_course_id, null);
  if v_reserved + 1 > v_capacity then
    raise exception 'Dieses Angebot hat nicht mehr genuegend freie Plaetze.';
  end if;

  new.course_id := coalesce(new.course_id, v_course_id);
  return new;
end;
$$;

drop trigger if exists prevent_workshop_guest_capacity_overrun on public.workshop_booking_guests;
create trigger prevent_workshop_guest_capacity_overrun
before insert
on public.workshop_booking_guests
for each row
execute function public.prevent_workshop_guest_capacity_overrun();

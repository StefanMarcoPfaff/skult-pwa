alter table public.courses
  add column if not exists workshop_storno_policy text;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'courses_workshop_storno_policy_check'
      and conrelid = 'public.courses'::regclass
  ) then
    alter table public.courses
      drop constraint courses_workshop_storno_policy_check;
  end if;

  alter table public.courses
    add constraint courses_workshop_storno_policy_check
    check (
      workshop_storno_policy is null
      or workshop_storno_policy in (
        'no_refund',
        'free_until_14_days_then_100',
        'free_until_7_days_then_100',
        'fifty_until_14_days_then_100'
      )
    );
end $$;

create or replace function public.create_workshop_with_sessions(
  p_title text,
  p_description text,
  p_location text,
  p_location_details text,
  p_instructor_name text,
  p_workshop_storno_policy text,
  p_capacity integer,
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
  text,
  jsonb
) to authenticated;

create or replace function public.create_workshop_with_sessions(
  p_title text,
  p_description text,
  p_location text,
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
  integer,
  integer,
  text,
  jsonb
) to authenticated;

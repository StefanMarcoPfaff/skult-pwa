alter table public.courses
  add column if not exists location_details text;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'courses_cancellation_model_check'
      and conrelid = 'public.courses'::regclass
  ) then
    alter table public.courses
      drop constraint courses_cancellation_model_check;
  end if;

  alter table public.courses
    add constraint courses_cancellation_model_check
    check (
      cancellation_model is null
      or cancellation_model in (
        'monthly',
        'quarterly',
        'semiannual',
        'minimum_3_months',
        'minimum_6_months',
        'fixed_course'
      )
    );
end $$;

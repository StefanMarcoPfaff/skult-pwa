do $$
begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles
      add column if not exists provider_type text,
      add column if not exists organization_name text;

    update public.profiles
    set provider_type = 'independent_teacher'
    where provider_type is null;

    alter table public.profiles
      alter column provider_type set default 'independent_teacher';

    alter table public.profiles
      alter column provider_type set not null;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'profiles_provider_type_check'
        and conrelid = 'public.profiles'::regclass
    ) then
      alter table public.profiles
        add constraint profiles_provider_type_check
        check (provider_type in ('independent_teacher', 'studio_provider'));
    end if;
  end if;
end $$;

do $$
begin
  if to_regclass('public.courses') is not null then
    alter table public.courses
      add column if not exists instructor_name text,
      add column if not exists cancellation_model text;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'courses_cancellation_model_check'
        and conrelid = 'public.courses'::regclass
    ) then
      alter table public.courses
        add constraint courses_cancellation_model_check
        check (
          cancellation_model is null
          or cancellation_model in (
            'monthly',
            'quarterly',
            'minimum_3_months',
            'minimum_6_months',
            'fixed_course'
          )
        );
    end if;
  end if;
end $$;

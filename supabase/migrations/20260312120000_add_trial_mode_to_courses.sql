alter table public.courses
  add column if not exists trial_mode text;

update public.courses
set trial_mode = 'all_sessions'
where trial_mode is null;

alter table public.courses
  alter column trial_mode set default 'all_sessions';

alter table public.courses
  alter column trial_mode set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'courses_trial_mode_check'
      and conrelid = 'public.courses'::regclass
  ) then
    alter table public.courses
      add constraint courses_trial_mode_check
      check (trial_mode in ('all_sessions', 'manual'));
  end if;
end $$;

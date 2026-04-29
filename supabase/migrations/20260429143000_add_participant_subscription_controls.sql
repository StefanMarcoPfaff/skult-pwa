alter table public.course_registration_intents
  add column if not exists subscription_pause_start_date date,
  add column if not exists subscription_pause_end_date date,
  add column if not exists subscription_status text not null default 'active',
  add column if not exists subscription_cancel_scheduled_at timestamptz,
  add column if not exists subscription_cancelled_at timestamptz;

update public.course_registration_intents
set subscription_status = case
  when status = 'checkout_completed' then 'active'
  else 'inactive'
end
where subscription_status is null
   or subscription_status = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'course_registration_intents_subscription_status_check'
      and conrelid = 'public.course_registration_intents'::regclass
  ) then
    alter table public.course_registration_intents
      add constraint course_registration_intents_subscription_status_check
      check (
        subscription_status in ('inactive', 'active', 'paused', 'cancel_scheduled', 'cancelled')
      );
  end if;
end $$;

create index if not exists course_registration_intents_subscription_status_idx
  on public.course_registration_intents (subscription_status);

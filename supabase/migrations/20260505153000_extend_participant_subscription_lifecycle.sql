alter table public.course_registration_intents
  add column if not exists subscription_stop_date date;

update public.course_registration_intents
set subscription_stop_date = null
where subscription_stop_date is not null
  and subscription_status not in ('cancel_scheduled', 'cancelled');

alter table public.course_registration_intents
  drop constraint if exists course_registration_intents_subscription_status_check;

alter table public.course_registration_intents
  add constraint course_registration_intents_subscription_status_check
  check (
    subscription_status in (
      'inactive',
      'active',
      'pause_scheduled',
      'paused',
      'cancel_scheduled',
      'cancelled'
    )
  );

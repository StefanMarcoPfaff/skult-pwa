alter table public.course_registration_intents
  add column if not exists course_pause_notification_sent_for_start_date date,
  add column if not exists course_stop_notification_sent_for_stop_date date,
  add column if not exists participant_pause_notification_sent_for_start_date date;

alter table public.trial_reservations
  add column if not exists course_stop_notification_sent_for_stop_date date;

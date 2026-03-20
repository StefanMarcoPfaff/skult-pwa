alter table public.course_registration_intents
  add column if not exists provider_notification_email_sent_at timestamptz;

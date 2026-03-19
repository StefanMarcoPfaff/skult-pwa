alter table public.course_registration_intents
  add column if not exists registration_confirmation_email_sent_at timestamptz;

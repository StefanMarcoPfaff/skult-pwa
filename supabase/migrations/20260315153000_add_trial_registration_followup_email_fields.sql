alter table public.trial_reservations
  add column if not exists registration_reminder_24h_sent_at timestamptz,
  add column if not exists registration_reminder_48h_sent_at timestamptz,
  add column if not exists registration_reminder_72h_sent_at timestamptz,
  add column if not exists registration_expired_email_sent_at timestamptz;

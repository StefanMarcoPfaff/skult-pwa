alter table public.bookings
  add column if not exists workshop_provider_notification_email_sent_at timestamptz;

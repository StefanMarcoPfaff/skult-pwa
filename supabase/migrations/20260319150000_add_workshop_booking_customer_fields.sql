alter table public.bookings
  add column if not exists customer_first_name text,
  add column if not exists customer_last_name text,
  add column if not exists customer_email text,
  add column if not exists customer_phone text,
  add column if not exists workshop_confirmation_email_sent_at timestamptz;

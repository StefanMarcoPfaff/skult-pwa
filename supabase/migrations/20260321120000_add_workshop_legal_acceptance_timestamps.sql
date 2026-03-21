alter table public.bookings
  add column if not exists agb_accepted_at timestamptz,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists workshop_storno_terms_accepted_at timestamptz;

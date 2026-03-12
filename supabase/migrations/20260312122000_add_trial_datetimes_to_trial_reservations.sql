alter table public.trial_reservations
  add column if not exists trial_starts_at timestamptz,
  add column if not exists trial_ends_at timestamptz;

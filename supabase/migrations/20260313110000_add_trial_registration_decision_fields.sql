alter table public.trial_reservations
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists registration_token text,
  add column if not exists registration_expires_at timestamptz;

create unique index if not exists trial_reservations_registration_token_key
  on public.trial_reservations (registration_token)
  where registration_token is not null;

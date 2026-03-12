alter table public.trial_reservations
  add column if not exists cancel_token text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists confirmation_sent_at timestamptz,
  add column if not exists teacher_notification_sent_at timestamptz;

create unique index if not exists trial_reservations_cancel_token_key
  on public.trial_reservations (cancel_token)
  where cancel_token is not null;

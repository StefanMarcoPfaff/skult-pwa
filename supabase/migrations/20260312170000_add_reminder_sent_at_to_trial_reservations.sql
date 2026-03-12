alter table public.trial_reservations
add column if not exists reminder_sent_at timestamptz;

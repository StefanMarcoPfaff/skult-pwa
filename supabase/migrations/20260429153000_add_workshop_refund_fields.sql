alter table public.bookings
  add column if not exists refunded_at timestamptz,
  add column if not exists stripe_refund_id text,
  add column if not exists refund_amount_cents integer;

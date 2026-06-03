alter table public.bookings
  drop constraint if exists bookings_payment_status_check;

alter table public.bookings
  add constraint bookings_payment_status_check
  check (payment_status in ('pending', 'paid', 'free', 'refunded', 'cancelled', 'refund_pending'));

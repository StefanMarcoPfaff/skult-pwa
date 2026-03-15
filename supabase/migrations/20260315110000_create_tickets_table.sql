create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('workshop', 'trial', 'course_session')),
  booking_id uuid null,
  trial_reservation_id uuid null,
  subscription_id uuid null,
  course_id uuid null,
  customer_name text not null,
  customer_email text not null,
  qr_token text not null unique,
  status text not null default 'issued' check (status in ('issued', 'checked_in', 'cancelled', 'expired')),
  checked_in_at timestamptz null,
  checked_in_by uuid null,
  created_at timestamptz not null default now()
);

create unique index if not exists tickets_booking_id_key
  on public.tickets (booking_id)
  where booking_id is not null;

create unique index if not exists tickets_trial_reservation_id_key
  on public.tickets (trial_reservation_id)
  where trial_reservation_id is not null;

create index if not exists tickets_qr_token_idx
  on public.tickets (qr_token);

create index if not exists tickets_booking_id_idx
  on public.tickets (booking_id);

create index if not exists tickets_trial_reservation_id_idx
  on public.tickets (trial_reservation_id);

create index if not exists tickets_course_id_idx
  on public.tickets (course_id);

alter table public.courses
  add column if not exists archived_at timestamptz;

alter table public.trial_reservations
  add column if not exists archived_at timestamptz;

alter table public.course_registration_intents
  add column if not exists archived_at timestamptz;

alter table public.bookings
  add column if not exists archived_at timestamptz;

create index if not exists courses_archived_at_idx
  on public.courses (archived_at);

create index if not exists trial_reservations_archived_at_idx
  on public.trial_reservations (archived_at);

create index if not exists course_registration_intents_archived_at_idx
  on public.course_registration_intents (archived_at);

create index if not exists bookings_archived_at_idx
  on public.bookings (archived_at);

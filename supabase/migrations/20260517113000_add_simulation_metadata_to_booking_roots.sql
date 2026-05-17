alter table public.bookings
  add column if not exists simulation_metadata jsonb null;

alter table public.bookings
  add column if not exists simulation_key text null;

alter table public.bookings
  add column if not exists is_simulation boolean not null default false;

alter table public.trial_reservations
  add column if not exists simulation_metadata jsonb null;

alter table public.trial_reservations
  add column if not exists simulation_key text null;

alter table public.trial_reservations
  add column if not exists is_simulation boolean not null default false;

alter table public.course_registration_intents
  add column if not exists simulation_metadata jsonb null;

alter table public.course_registration_intents
  add column if not exists simulation_key text null;

alter table public.course_registration_intents
  add column if not exists is_simulation boolean not null default false;

create index if not exists bookings_is_simulation_idx
  on public.bookings (is_simulation);

create index if not exists bookings_simulation_key_idx
  on public.bookings (simulation_key);

create index if not exists trial_reservations_is_simulation_idx
  on public.trial_reservations (is_simulation);

create index if not exists trial_reservations_simulation_key_idx
  on public.trial_reservations (simulation_key);

create index if not exists course_registration_intents_is_simulation_idx
  on public.course_registration_intents (is_simulation);

create index if not exists course_registration_intents_simulation_key_idx
  on public.course_registration_intents (simulation_key);

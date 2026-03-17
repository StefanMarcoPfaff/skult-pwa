create table if not exists public.course_registration_intents (
  id uuid primary key default gen_random_uuid(),
  trial_reservation_id uuid not null references public.trial_reservations(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  registration_token text not null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  street_and_number text not null,
  postal_code text not null,
  city text not null,
  country text not null,
  notes text null,
  binding_registration_confirmed_at timestamptz not null,
  agb_accepted_at timestamptz not null,
  privacy_accepted_at timestamptz not null,
  cancellation_terms_accepted_at timestamptz not null,
  stripe_checkout_session_id text null,
  stripe_customer_id text null,
  stripe_subscription_id text null,
  status text not null default 'pending_checkout',
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists course_registration_intents_trial_reservation_id_key
  on public.course_registration_intents (trial_reservation_id);

create index if not exists course_registration_intents_course_id_idx
  on public.course_registration_intents (course_id);

create index if not exists course_registration_intents_registration_token_idx
  on public.course_registration_intents (registration_token);

create index if not exists course_registration_intents_status_idx
  on public.course_registration_intents (status);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'course_registration_intents_status_check'
      and conrelid = 'public.course_registration_intents'::regclass
  ) then
    alter table public.course_registration_intents
      add constraint course_registration_intents_status_check
      check (status in ('pending_checkout', 'checkout_started', 'checkout_completed', 'checkout_cancelled'));
  end if;
end $$;

create or replace function public.set_course_registration_intents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists course_registration_intents_set_updated_at on public.course_registration_intents;
create trigger course_registration_intents_set_updated_at
before update on public.course_registration_intents
for each row
execute function public.set_course_registration_intents_updated_at();

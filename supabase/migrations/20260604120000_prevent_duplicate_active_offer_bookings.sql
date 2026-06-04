create or replace function public.normalize_booking_email(value text)
returns text
language sql
immutable
as $$
  select nullif(lower(btrim(value)), '');
$$;

create or replace function public.prevent_duplicate_active_workshop_booking()
returns trigger
language plpgsql
as $$
declare
  normalized_email text;
begin
  normalized_email := public.normalize_booking_email(new.customer_email);
  if new.course_id is null or normalized_email is null then
    return new;
  end if;

  if new.archived_at is not null
    or new.refunded_at is not null
    or coalesce(lower(new.status), '') in ('cancelled', 'refunded')
    or coalesce(lower(new.payment_status), '') in ('cancelled', 'refunded') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('active-booking:' || new.course_id::text || ':' || normalized_email));

  if exists (
    select 1
    from public.bookings existing
    where existing.course_id = new.course_id
      and public.normalize_booking_email(existing.customer_email) = normalized_email
      and existing.id is distinct from new.id
      and existing.archived_at is null
      and existing.refunded_at is null
      and coalesce(lower(existing.status), '') not in ('cancelled', 'refunded')
      and coalesce(lower(existing.payment_status), '') not in ('cancelled', 'refunded')
  ) then
    raise exception 'Für diese E-Mail-Adresse besteht bereits eine aktive Anmeldung für dieses Angebot.'
      using errcode = '23505';
  end if;

  new.customer_email := normalized_email;
  return new;
end;
$$;

drop trigger if exists prevent_duplicate_active_workshop_booking on public.bookings;
create trigger prevent_duplicate_active_workshop_booking
before insert or update of course_id, customer_email, status, payment_status, refunded_at, archived_at
on public.bookings
for each row
execute function public.prevent_duplicate_active_workshop_booking();

create or replace function public.prevent_duplicate_active_trial_reservation()
returns trigger
language plpgsql
as $$
declare
  normalized_email text;
begin
  normalized_email := public.normalize_booking_email(new.email);
  if new.course_id is null or normalized_email is null then
    return new;
  end if;

  if new.archived_at is not null
    or new.cancelled_at is not null
    or new.converted_at is not null
    or coalesce(lower(new.status), '') in ('cancelled', 'rejected')
    or coalesce(lower(new.decision_status), '') = 'rejected' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('active-trial-reservation:' || new.course_id::text || ':' || normalized_email));

  if exists (
    select 1
    from public.trial_reservations existing
    where existing.course_id = new.course_id
      and public.normalize_booking_email(existing.email) = normalized_email
      and existing.id is distinct from new.id
      and existing.archived_at is null
      and existing.cancelled_at is null
      and existing.converted_at is null
      and coalesce(lower(existing.status), '') not in ('cancelled', 'rejected')
      and coalesce(lower(existing.decision_status), '') <> 'rejected'
  ) then
    raise exception 'Für diese E-Mail-Adresse besteht bereits eine aktive Anmeldung für dieses Angebot.'
      using errcode = '23505';
  end if;

  new.email := normalized_email;
  return new;
end;
$$;

drop trigger if exists prevent_duplicate_active_trial_reservation on public.trial_reservations;
create trigger prevent_duplicate_active_trial_reservation
before insert or update of course_id, email, status, decision_status, cancelled_at, converted_at, archived_at
on public.trial_reservations
for each row
execute function public.prevent_duplicate_active_trial_reservation();

create or replace function public.prevent_duplicate_active_course_registration()
returns trigger
language plpgsql
as $$
declare
  normalized_email text;
begin
  normalized_email := public.normalize_booking_email(new.email);
  if new.course_id is null or normalized_email is null then
    return new;
  end if;

  if new.archived_at is not null
    or coalesce(lower(new.status), '') = 'checkout_cancelled'
    or (
      coalesce(lower(new.status), '') = 'checkout_completed'
      and coalesce(lower(new.subscription_status), '') in ('inactive', 'cancelled', 'ended')
    ) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('active-course-registration:' || new.course_id::text || ':' || normalized_email));

  if exists (
    select 1
    from public.course_registration_intents existing
    where existing.course_id = new.course_id
      and public.normalize_booking_email(existing.email) = normalized_email
      and existing.id is distinct from new.id
      and existing.archived_at is null
      and coalesce(lower(existing.status), '') <> 'checkout_cancelled'
      and not (
        coalesce(lower(existing.status), '') = 'checkout_completed'
        and coalesce(lower(existing.subscription_status), '') in ('inactive', 'cancelled', 'ended')
      )
  ) then
    raise exception 'Für diese E-Mail-Adresse besteht bereits eine aktive Anmeldung für dieses Angebot.'
      using errcode = '23505';
  end if;

  new.email := normalized_email;
  return new;
end;
$$;

drop trigger if exists prevent_duplicate_active_course_registration on public.course_registration_intents;
create trigger prevent_duplicate_active_course_registration
before insert or update of course_id, email, status, subscription_status, archived_at
on public.course_registration_intents
for each row
execute function public.prevent_duplicate_active_course_registration();

create index if not exists bookings_course_customer_email_lookup_idx
  on public.bookings (course_id, lower(btrim(customer_email)))
  where customer_email is not null;

create index if not exists trial_reservations_course_email_lookup_idx
  on public.trial_reservations (course_id, lower(btrim(email)))
  where email is not null;

create index if not exists course_registration_intents_course_email_lookup_idx
  on public.course_registration_intents (course_id, lower(btrim(email)))
  where email is not null;

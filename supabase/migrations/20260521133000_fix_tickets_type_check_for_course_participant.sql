alter table public.tickets
  drop constraint if exists tickets_type_check;

alter table public.tickets
  add constraint tickets_type_check
  check (type in ('workshop', 'trial', 'course_session', 'course_participant'));

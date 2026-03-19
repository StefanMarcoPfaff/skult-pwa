alter table public.tickets
  drop constraint if exists tickets_type_check;

alter table public.tickets
  alter column subscription_id type text
  using subscription_id::text;

alter table public.tickets
  add constraint tickets_type_check
  check (type in ('workshop', 'trial', 'course_session', 'course_participant'));

create unique index if not exists tickets_subscription_id_key
  on public.tickets (subscription_id)
  where subscription_id is not null;

create index if not exists tickets_subscription_id_idx
  on public.tickets (subscription_id);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  session_id uuid null references public.course_sessions(id) on delete cascade,
  event_date date null,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  booking_id uuid null references public.bookings(id) on delete cascade,
  trial_reservation_id uuid null references public.trial_reservations(id) on delete cascade,
  subscription_id text null,
  attendance_status text not null default 'present',
  checked_in_at timestamptz not null default now(),
  marked_at timestamptz not null default now(),
  checked_in_by uuid null references auth.users(id) on delete set null,
  method text not null default 'manual',
  source text null,
  checkin_access_link_id uuid null references public.checkin_access_links(id) on delete set null,
  checked_in_by_label text null,
  room text null,
  instructor_name text null,
  created_at timestamptz not null default now(),
  constraint attendance_records_session_or_date_check check (
    session_id is not null or event_date is not null
  )
);

alter table public.attendance_records
  add column if not exists attendance_status text not null default 'present',
  add column if not exists marked_at timestamptz not null default now(),
  add column if not exists source text null,
  add column if not exists checkin_access_link_id uuid null references public.checkin_access_links(id) on delete set null,
  add column if not exists checked_in_by_label text null;

alter table public.attendance_records
  drop constraint if exists attendance_records_attendance_status_check;

alter table public.attendance_records
  add constraint attendance_records_attendance_status_check
  check (attendance_status in ('present', 'excused', 'absent'));

alter table public.attendance_records
  drop constraint if exists attendance_records_method_check;

alter table public.attendance_records
  add constraint attendance_records_method_check
  check (method in ('teacher_scan', 'participant_scan', 'manual', 'qr_scan'));

create unique index if not exists attendance_records_session_ticket_key
  on public.attendance_records (session_id, ticket_id)
  where session_id is not null;

create unique index if not exists attendance_records_event_date_ticket_key
  on public.attendance_records (course_id, event_date, ticket_id)
  where session_id is null and event_date is not null;

create index if not exists attendance_records_course_id_idx
  on public.attendance_records (course_id);

create index if not exists attendance_records_ticket_id_idx
  on public.attendance_records (ticket_id);

create index if not exists attendance_records_checkin_access_link_id_idx
  on public.attendance_records (checkin_access_link_id);

create index if not exists attendance_records_source_idx
  on public.attendance_records (source);

create index if not exists attendance_records_event_date_idx
  on public.attendance_records (event_date);

alter table public.attendance_records enable row level security;

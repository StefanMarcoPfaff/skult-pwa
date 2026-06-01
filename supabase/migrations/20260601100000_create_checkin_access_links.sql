create table if not exists public.checkin_access_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  course_id uuid not null references public.courses(id) on delete cascade,
  scope text not null default 'workshop',
  valid_from timestamptz null,
  expires_at timestamptz not null,
  pin_hash text null,
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz null,
  last_used_at timestamptz null,
  metadata jsonb not null default '{}',
  constraint checkin_access_links_scope_check check (
    scope in ('workshop', 'course_session', 'course_range')
  )
);

create index if not exists checkin_access_links_token_hash_idx
  on public.checkin_access_links (token_hash);

create index if not exists checkin_access_links_course_id_idx
  on public.checkin_access_links (course_id);

create index if not exists checkin_access_links_expires_at_idx
  on public.checkin_access_links (expires_at);

create index if not exists checkin_access_links_revoked_at_idx
  on public.checkin_access_links (revoked_at);

alter table public.checkin_access_links enable row level security;

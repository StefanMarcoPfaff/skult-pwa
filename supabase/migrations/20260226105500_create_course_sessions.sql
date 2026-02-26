create table if not exists public.course_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists course_sessions_course_id_idx
  on public.course_sessions(course_id);

alter table public.course_sessions enable row level security;

create policy "course_sessions_select_own"
  on public.course_sessions
  for select
  using (
    exists (
      select 1
      from public.courses
      where public.courses.id = public.course_sessions.course_id
        and public.courses.teacher_id = auth.uid()
    )
  );

create policy "course_sessions_insert_own"
  on public.course_sessions
  for insert
  with check (
    exists (
      select 1
      from public.courses
      where public.courses.id = public.course_sessions.course_id
        and public.courses.teacher_id = auth.uid()
    )
  );

create policy "course_sessions_update_own"
  on public.course_sessions
  for update
  using (
    exists (
      select 1
      from public.courses
      where public.courses.id = public.course_sessions.course_id
        and public.courses.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.courses
      where public.courses.id = public.course_sessions.course_id
        and public.courses.teacher_id = auth.uid()
    )
  );

create policy "course_sessions_delete_own"
  on public.course_sessions
  for delete
  using (
    exists (
      select 1
      from public.courses
      where public.courses.id = public.course_sessions.course_id
        and public.courses.teacher_id = auth.uid()
    )
  );

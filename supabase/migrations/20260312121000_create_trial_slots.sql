create table if not exists public.trial_slots (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_open boolean not null default true,
  source_type text not null default 'manual',
  created_at timestamptz not null default now(),
  constraint trial_slots_time_check check (ends_at > starts_at),
  constraint trial_slots_source_type_check check (source_type in ('manual', 'auto'))
);

create index if not exists trial_slots_course_id_idx
  on public.trial_slots(course_id);

alter table public.trial_slots enable row level security;

drop policy if exists "trial_slots_select_own" on public.trial_slots;
create policy "trial_slots_select_own"
  on public.trial_slots
  for select
  using (
    exists (
      select 1
      from public.courses
      where public.courses.id = public.trial_slots.course_id
        and public.courses.teacher_id = auth.uid()
    )
  );

drop policy if exists "trial_slots_insert_own" on public.trial_slots;
create policy "trial_slots_insert_own"
  on public.trial_slots
  for insert
  with check (
    exists (
      select 1
      from public.courses
      where public.courses.id = public.trial_slots.course_id
        and public.courses.teacher_id = auth.uid()
    )
  );

drop policy if exists "trial_slots_update_own" on public.trial_slots;
create policy "trial_slots_update_own"
  on public.trial_slots
  for update
  using (
    exists (
      select 1
      from public.courses
      where public.courses.id = public.trial_slots.course_id
        and public.courses.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.courses
      where public.courses.id = public.trial_slots.course_id
        and public.courses.teacher_id = auth.uid()
    )
  );

drop policy if exists "trial_slots_delete_own" on public.trial_slots;
create policy "trial_slots_delete_own"
  on public.trial_slots
  for delete
  using (
    exists (
      select 1
      from public.courses
      where public.courses.id = public.trial_slots.course_id
        and public.courses.teacher_id = auth.uid()
    )
  );

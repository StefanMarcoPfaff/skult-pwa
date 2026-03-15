alter table public.trial_reservations
  add column if not exists decision_status text,
  add column if not exists decision_taken_at timestamptz,
  add column if not exists decided_by uuid,
  add column if not exists approval_email_sent_at timestamptz,
  add column if not exists rejection_email_sent_at timestamptz,
  add column if not exists teacher_decision_reminder_sent_at timestamptz;

update public.trial_reservations
set decision_status = case
  when status = 'approved' then 'approved'
  when status = 'rejected' then 'rejected'
  else 'pending'
end
where decision_status is null;

update public.trial_reservations
set decision_taken_at = coalesce(decision_taken_at, approved_at, rejected_at)
where decision_taken_at is null;

alter table public.trial_reservations
  alter column decision_status set default 'pending';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trial_reservations_decision_status_check'
  ) then
    alter table public.trial_reservations
      add constraint trial_reservations_decision_status_check
      check (decision_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

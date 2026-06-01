do $$
begin
  if to_regclass('public.attendance_records') is not null then
    alter table public.attendance_records
      add column if not exists source text null,
      add column if not exists checkin_access_link_id uuid null references public.checkin_access_links(id) on delete set null,
      add column if not exists checked_in_by_label text null;

    create index if not exists attendance_records_checkin_access_link_id_idx
      on public.attendance_records (checkin_access_link_id);

    create index if not exists attendance_records_source_idx
      on public.attendance_records (source);
  end if;
end $$;

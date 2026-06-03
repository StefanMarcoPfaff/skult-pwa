alter table public.courses
  add column if not exists reservation_notice text;

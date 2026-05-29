alter table public.profiles
  add column if not exists company_logo_url text null;

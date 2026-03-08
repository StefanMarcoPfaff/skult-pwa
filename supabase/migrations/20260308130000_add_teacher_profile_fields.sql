do $$
begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles
      add column if not exists first_name text,
      add column if not exists last_name text,
      add column if not exists bio text,
      add column if not exists account_holder_name text,
      add column if not exists iban text;
  end if;
end $$;


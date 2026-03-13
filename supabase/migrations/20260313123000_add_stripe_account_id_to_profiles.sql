do $$
begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles
      add column if not exists stripe_account_id text;
  end if;
end $$;

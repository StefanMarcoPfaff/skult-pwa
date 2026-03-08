do $$
begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles
      add column if not exists photo_url text,
      add column if not exists intro_video_url text;
  end if;
end $$;


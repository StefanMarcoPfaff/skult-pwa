alter table public.bookings
  add column if not exists payment_status text;

update public.bookings
set payment_status = case
  when refunded_at is not null or stripe_refund_id is not null or status = 'refunded' then 'refunded'
  when coalesce(payment_provider, '') = 'free' then 'free'
  when status = 'paid' then 'paid'
  when status = 'cancelled' then 'cancelled'
  else 'pending'
end
where payment_status is null;

alter table public.bookings
  alter column payment_status set default 'pending';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_payment_status_check'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_payment_status_check
      check (payment_status in ('pending', 'paid', 'free', 'refunded', 'cancelled'));
  end if;
end
$$;

update public.courses
set visibility = 'private_link'
where kind = 'exclusive_offer';

do $$
begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles
      add column if not exists payout_method text,
      add column if not exists billing_name text,
      add column if not exists billing_company_name text,
      add column if not exists billing_address_line_1 text,
      add column if not exists billing_address_line_2 text,
      add column if not exists billing_postal_code text,
      add column if not exists billing_city text,
      add column if not exists billing_country text,
      add column if not exists tax_number text,
      add column if not exists vat_id text,
      add column if not exists vat_status text,
      add column if not exists payout_iban text,
      add column if not exists payout_paypal_email text;

    update public.profiles
    set payout_method = 'iban'
    where payout_method is null;

    update public.profiles
    set payout_iban = iban
    where payout_iban is null
      and iban is not null;

    alter table public.profiles
      alter column payout_method set default 'iban';

    alter table public.profiles
      alter column payout_method set not null;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'profiles_payout_method_check'
        and conrelid = 'public.profiles'::regclass
    ) then
      alter table public.profiles
        add constraint profiles_payout_method_check
        check (payout_method in ('iban', 'paypal'));
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'profiles_vat_status_check'
        and conrelid = 'public.profiles'::regclass
    ) then
      alter table public.profiles
        add constraint profiles_vat_status_check
        check (
          vat_status is null
          or vat_status in ('small_business', 'vat_registered', 'tax_exempt')
        );
    end if;
  end if;
end $$;

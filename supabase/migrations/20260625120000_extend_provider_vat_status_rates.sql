alter table public.profiles
  drop constraint if exists profiles_vat_status_check;

alter table public.profiles
  add constraint profiles_vat_status_check
  check (
    vat_status is null
    or vat_status in ('small_business', 'vat_registered', 'vat_19', 'vat_7', 'tax_exempt')
  );

alter table public.provider_payout_profiles
  drop constraint if exists provider_payout_profiles_vat_status_check;

alter table public.provider_payout_profiles
  add constraint provider_payout_profiles_vat_status_check
  check (
    vat_status is null
    or vat_status in ('small_business', 'vat_registered', 'vat_19', 'vat_7', 'tax_exempt')
  );

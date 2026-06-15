update public.provider_payout_profiles
set
  payout_method = 'iban',
  paypal_email = null,
  updated_at = now()
where provider = 'reser_payment_v2'
  and (
    payout_method = 'paypal'
    or paypal_email is not null
  );

update public.profiles
set
  payout_method = 'iban',
  payout_paypal_email = null
where payout_method = 'paypal'
  or payout_paypal_email is not null;

alter table public.provider_payout_profiles
  drop constraint if exists provider_payout_profiles_reser_payment_v2_sepa_only_check;

alter table public.provider_payout_profiles
  add constraint provider_payout_profiles_reser_payment_v2_sepa_only_check check (
    provider <> 'reser_payment_v2'
    or (
      payout_method = 'iban'
      and paypal_email is null
    )
  );

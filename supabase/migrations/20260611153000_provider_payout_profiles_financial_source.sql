alter table public.provider_payout_profiles
  add column if not exists billing_name text null,
  add column if not exists billing_company_name text null,
  add column if not exists billing_address_line_1 text null,
  add column if not exists billing_address_line_2 text null,
  add column if not exists billing_postal_code text null,
  add column if not exists billing_city text null,
  add column if not exists billing_country text null,
  add column if not exists vat_status text null,
  add column if not exists is_non_profit boolean null;

alter table public.provider_payout_profiles
  drop constraint if exists provider_payout_profiles_vat_status_check;

alter table public.provider_payout_profiles
  add constraint provider_payout_profiles_vat_status_check
  check (
    vat_status is null
    or vat_status in ('small_business', 'vat_registered', 'tax_exempt')
  );

alter table public.provider_payout_profiles
  drop constraint if exists provider_payout_profiles_payment_destination_check;

alter table public.provider_payout_profiles
  add constraint provider_payout_profiles_payment_destination_check check (
    provider = 'reser_payment_v2'
    or iban_encrypted is not null
    or iban_last4 is not null
    or paypal_email is not null
    or provider_account_id is not null
  );

alter table public.provider_payout_profiles
  drop constraint if exists provider_payout_profiles_reser_manual_profile_check;

insert into public.provider_payout_profiles (
  teacher_id,
  payout_method,
  iban_last4,
  paypal_email,
  account_holder_name,
  address,
  tax_number,
  vat_id,
  vat_status,
  provider,
  billing_name,
  billing_company_name,
  billing_address_line_1,
  billing_address_line_2,
  billing_postal_code,
  billing_city,
  billing_country,
  verification_status
)
select
  p.id,
  case when p.payout_method = 'paypal' then 'paypal' else 'iban' end,
  case
    when p.payout_method = 'iban' and nullif(trim(p.payout_iban), '') is not null
      then right(regexp_replace(upper(p.payout_iban), '\s+', '', 'g'), 4)
    else null
  end,
  case
    when p.payout_method = 'paypal' then lower(nullif(trim(p.payout_paypal_email), ''))
    else null
  end,
  coalesce(
    nullif(trim(p.billing_company_name), ''),
    nullif(trim(p.billing_name), ''),
    nullif(trim(p.organization_name), ''),
    nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
    'Anbieter*in'
  ),
  nullif(
    concat_ws(
      E'\n',
      nullif(trim(p.billing_address_line_1), ''),
      nullif(trim(p.billing_address_line_2), ''),
      nullif(trim(concat_ws(' ', p.billing_postal_code, p.billing_city)), ''),
      nullif(trim(p.billing_country), '')
    ),
    ''
  ),
  nullif(trim(p.tax_number), ''),
  nullif(trim(p.vat_id), ''),
  nullif(trim(p.vat_status), ''),
  'reser_payment_v2',
  nullif(trim(p.billing_name), ''),
  nullif(trim(p.billing_company_name), ''),
  nullif(trim(p.billing_address_line_1), ''),
  nullif(trim(p.billing_address_line_2), ''),
  nullif(trim(p.billing_postal_code), ''),
  nullif(trim(p.billing_city), ''),
  nullif(trim(p.billing_country), ''),
  'pending'
from public.profiles p
where (
  nullif(trim(coalesce(p.payout_method, '')), '') is not null
  or nullif(trim(coalesce(p.payout_iban, '')), '') is not null
  or nullif(trim(coalesce(p.payout_paypal_email, '')), '') is not null
  or nullif(trim(coalesce(p.billing_name, '')), '') is not null
  or nullif(trim(coalesce(p.billing_company_name, '')), '') is not null
  or nullif(trim(coalesce(p.billing_address_line_1, '')), '') is not null
  or nullif(trim(coalesce(p.billing_address_line_2, '')), '') is not null
  or nullif(trim(coalesce(p.billing_postal_code, '')), '') is not null
  or nullif(trim(coalesce(p.billing_city, '')), '') is not null
  or nullif(trim(coalesce(p.billing_country, '')), '') is not null
  or nullif(trim(coalesce(p.tax_number, '')), '') is not null
  or nullif(trim(coalesce(p.vat_id, '')), '') is not null
  or nullif(trim(coalesce(p.vat_status, '')), '') is not null
)
on conflict (teacher_id, provider)
where teacher_id is not null
do update set
  payout_method = coalesce(excluded.payout_method, provider_payout_profiles.payout_method),
  iban_last4 = coalesce(provider_payout_profiles.iban_last4, excluded.iban_last4),
  paypal_email = coalesce(provider_payout_profiles.paypal_email, excluded.paypal_email),
  account_holder_name = coalesce(nullif(trim(provider_payout_profiles.account_holder_name), ''), excluded.account_holder_name),
  address = coalesce(nullif(trim(provider_payout_profiles.address), ''), excluded.address),
  tax_number = coalesce(nullif(trim(provider_payout_profiles.tax_number), ''), excluded.tax_number),
  vat_id = coalesce(nullif(trim(provider_payout_profiles.vat_id), ''), excluded.vat_id),
  vat_status = coalesce(provider_payout_profiles.vat_status, excluded.vat_status),
  billing_name = coalesce(nullif(trim(provider_payout_profiles.billing_name), ''), excluded.billing_name),
  billing_company_name = coalesce(nullif(trim(provider_payout_profiles.billing_company_name), ''), excluded.billing_company_name),
  billing_address_line_1 = coalesce(nullif(trim(provider_payout_profiles.billing_address_line_1), ''), excluded.billing_address_line_1),
  billing_address_line_2 = coalesce(nullif(trim(provider_payout_profiles.billing_address_line_2), ''), excluded.billing_address_line_2),
  billing_postal_code = coalesce(nullif(trim(provider_payout_profiles.billing_postal_code), ''), excluded.billing_postal_code),
  billing_city = coalesce(nullif(trim(provider_payout_profiles.billing_city), ''), excluded.billing_city),
  billing_country = coalesce(nullif(trim(provider_payout_profiles.billing_country), ''), excluded.billing_country);

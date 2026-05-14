alter table public.provider_payout_profiles
  add column if not exists address text null,
  add column if not exists data_transfer_consent_accepted_at timestamptz null;

alter table public.provider_payout_profiles
  drop constraint if exists provider_payout_profiles_payout_method_check;

alter table public.provider_payout_profiles
  add constraint provider_payout_profiles_payout_method_check check (
    payout_method in ('iban', 'paypal', 'bank_transfer', 'stripe', 'manual', 'other')
  );

alter table public.provider_payout_profiles
  drop constraint if exists provider_payout_profiles_payment_destination_check;

alter table public.provider_payout_profiles
  add constraint provider_payout_profiles_payment_destination_check check (
    iban_encrypted is not null
    or iban_last4 is not null
    or paypal_email is not null
    or provider_account_id is not null
  );

alter table public.provider_payout_profiles
  drop constraint if exists provider_payout_profiles_reser_manual_profile_check;

alter table public.provider_payout_profiles
  add constraint provider_payout_profiles_reser_manual_profile_check check (
    provider <> 'reser_payment_v2'
    or (
      payout_method in ('iban', 'paypal')
      and char_length(trim(account_holder_name)) > 0
      and address is not null
      and char_length(trim(address)) > 0
      and data_transfer_consent_accepted_at is not null
      and (
        (payout_method = 'iban' and iban_last4 is not null and paypal_email is null)
        or (payout_method = 'paypal' and paypal_email is not null and iban_last4 is null and iban_encrypted is null)
      )
    )
  );

create unique index if not exists provider_payout_profiles_teacher_provider_key
  on public.provider_payout_profiles (teacher_id, provider)
  where teacher_id is not null;

drop policy if exists "provider_payout_profiles_select_own" on public.provider_payout_profiles;
create policy "provider_payout_profiles_select_own"
on public.provider_payout_profiles
for select
to authenticated
using (teacher_id = auth.uid());

drop policy if exists "provider_payout_profiles_insert_own" on public.provider_payout_profiles;
create policy "provider_payout_profiles_insert_own"
on public.provider_payout_profiles
for insert
to authenticated
with check (teacher_id = auth.uid());

drop policy if exists "provider_payout_profiles_update_own" on public.provider_payout_profiles;
create policy "provider_payout_profiles_update_own"
on public.provider_payout_profiles
for update
to authenticated
using (teacher_id = auth.uid())
with check (teacher_id = auth.uid());

drop policy if exists "provider_payout_profiles_delete_own" on public.provider_payout_profiles;
create policy "provider_payout_profiles_delete_own"
on public.provider_payout_profiles
for delete
to authenticated
using (teacher_id = auth.uid());

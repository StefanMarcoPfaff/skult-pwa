alter table public.payout_batches
  drop constraint if exists payout_batches_method_check;

alter table public.payout_batches
  add constraint payout_batches_method_check check (
    payout_method in (
      'bank_transfer',
      'paypal',
      'stripe',
      'manual',
      'other',
      'internal_simulation'
    )
  );

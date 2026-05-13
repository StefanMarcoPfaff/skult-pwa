alter table public.ledger_entries
  drop constraint if exists ledger_entries_payout_status_check;

alter table public.ledger_entries
  add constraint ledger_entries_payout_status_check check (
    payout_status in (
      'pending',
      'pending_event_completion',
      'payable',
      'batched',
      'available',
      'scheduled',
      'paid',
      'failed',
      'cancelled',
      'held'
    )
  );

alter table public.payout_batches
  drop constraint if exists payout_batches_status_check;

alter table public.payout_batches
  add constraint payout_batches_status_check check (
    status in ('simulated_pending', 'planned', 'scheduled', 'processing', 'paid', 'failed', 'cancelled')
  );

alter table public.payout_items
  drop constraint if exists payout_items_status_check;

alter table public.payout_items
  add constraint payout_items_status_check check (
    status in ('simulated_pending', 'planned', 'scheduled', 'processing', 'paid', 'failed', 'cancelled')
  );

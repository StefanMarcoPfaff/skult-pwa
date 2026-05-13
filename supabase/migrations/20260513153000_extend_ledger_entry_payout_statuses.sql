alter table public.ledger_entries
  drop constraint if exists ledger_entries_payout_status_check;

alter table public.ledger_entries
  add constraint ledger_entries_payout_status_check check (
    payout_status in (
      'pending',
      'pending_event_completion',
      'payable',
      'available',
      'scheduled',
      'paid',
      'failed',
      'cancelled',
      'held'
    )
  );

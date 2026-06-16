# Stripe Custom Connect Ledger Semantics

PR 5B prepares schema and domain types only. Checkout, webhook routing, transfers,
payouts, PDF generation, email triggers, free bookings, and HCWA flows stay unchanged.

## Ownership

Stripe moves the money.

RESER records, explains, calculates, and documents the money. Ledger rows are the
accounting mirror for dashboards, documents, support, and tax evidence.

## Core Mapping

`payment_transactions` records the participant-side payment object and the Stripe
references that explain it:

- `stripe_payment_intent_id`
- `stripe_charge_id`
- `stripe_balance_transaction_id`
- `stripe_application_fee_id`
- `stripe_transfer_id`
- `stripe_payout_id`
- `stripe_refund_id`
- `stripe_dispute_id`

`ledger_entries` records RESER's accounting split for the same money:

- gross participant payment
- RESER platform fee
- provider net amount
- Stripe transfer/payout/refund/dispute references when known
- payout/settlement state

`provider_payout_profile_id` must remain set for provider attribution even when
the provider share never touches a RESER bank account.

## Settlement Mirror

`payout_batches` and `payout_items` are settlement mirrors for Stripe Custom
Connect. They document Stripe payout/settlement state for accounting and
provider dashboards. They must not be treated as instructions for RESER to move
money.

Existing internal simulation tooling can still use these tables, but production
Stripe Custom Connect integration should write them from Stripe settlement events.

## Refunds

Partial refunds must not collapse a payment into a full refund state.

Use:

- `payment_transactions.refunded_amount_cents`
- `payment_transactions.refund_status`
- `payment_transactions.status = refunded_partial | refunded_full`
- `refund_records.refund_kind = partial | full | unknown`

Full refunds may set `refunded_at`; partial refunds should keep the original
payment visible as paid/partially refunded for provider dashboards and documents.

## PR 5C Target

PR 5C wires Stripe events into these prepared fields without triggering PDFs,
emails, transfers, or payouts:

- successful charge/payment
- application fee
- transfer
- provider payout
- RESER payout
- partial/full refund
- dispute/chargeback

Handled as ledger mirrors:

- `payment_intent.succeeded` / `charge.succeeded` / `charge.updated`: payment
  and charge references.
- `application_fee.created` / `application_fee.refunded`: application fee and
  balance transaction references.
- `transfer.created` / `transfer.paid` / `transfer.failed`: transfer references
  and `transfer_created` / `failed` ledger state. Future-dated
  `pending_event_completion` rows keep their 24h hold status until `available_at`.
- `payout.paid` / `payout.failed`: `payout_batches` settlement mirror rows and
  optional metadata-linked ledger status.
- `refund.created` / `refund.updated` / `charge.refunded`: partial/full refund
  mirror state.
- `charge.dispute.created` / `charge.dispute.closed`: dispute and chargeback
  mirror state.

PR 5D should move provider statement and platform-fee document creation away from
internal payout simulation and onto Stripe settlement/ledger status events.

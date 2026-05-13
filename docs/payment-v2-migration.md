# RESER Payment System V2 Migration

Stand: 2026-05-12

## Zielbild

RESER soll von `Stripe Connect + Stripe Checkout + Stripe Billing + Stripe Webhooks` auf ein internes Payment-System V2 wechseln, ohne die bestehenden Stripe-Flows sofort abzuschalten.

Wesentliche Produktziele:

- Anbieter*innen registrieren sich nur bei RESER.
- Keine externe Anbieter-Onboarding-UI von Stripe oder Mollie.
- Kundenzahlungen laufen ueber einen PSP wie Mollie.
- RESER fuehrt das wirtschaftliche Nebenbuch selbst: Forderungen, PSP-Gebuehren, Anbieteranteile, Provisionen, Refunds, Chargebacks, Auszahlungen.
- Bestehende Stripe-Flows fuer Bestandsdaten, Bestands-Subscriptions und offene Tickets bleiben bis zur kontrollierten Abschaltung stabil.

## Aktueller Stand in der Codebasis

### Direkt an Stripe gekoppelte Laufwege

- Workshop-Checkout: `src/app/api/stripe/checkout/route.ts`
- Kurs-Subscription-Checkout: `src/app/api/stripe/course-registration/checkout/route.ts`
- Stripe-Webhooks: `src/app/api/stripe/webhook/route.ts`
- Kurs-Finalisierung: `src/lib/course-registration-finalization.ts`
- Workshop-Finalisierung: `src/lib/workshop-booking-finalization.ts`
- Stripe-Client: `src/lib/stripe.ts`
- Stripe-Connect-Logik: `src/lib/stripe-connect.ts`
- Connect-Onboarding: `src/app/api/stripe/connect/route.ts`
- Connect-Login: `src/app/api/stripe/connect/login/route.ts`
- Revenue-Ansicht mit heuristischer Netto-Berechnung: `src/app/dashboard/revenue/page.tsx`

### Bereits vorhandene Daten, die relevant bleiben

- Anbieterprofil: `profiles`
- Einmalige Buchungen: `bookings`
- Laufende Kursanmeldungen: `course_registration_intents`
- Tickets: `tickets`
- Trial- und Lifecycle-Flows: `trial_reservations`, `course_registration_intents`, `attendance_records`

### Bereits problematische Kopplungen

- Provider-Payout-Faehigkeit wird heute aus `profiles.stripe_account_id` abgeleitet.
- Zahlungsabschluss ist an Stripe-Session-Status gebunden.
- Subscription-Status und Teilnehmer-Tickets referenzieren `stripe_subscription_id`.
- Revenue-Dashboard rechnet aus Angebotsdaten, nicht aus einem echten Ledger.

## Empfohlene Zielarchitektur

## Grundsatz

Nicht `Stripe -> Mollie` 1:1 umverdrahten. Stattdessen eine eigene Payment-Domaene einfuehren und Stripe danach als Legacy-Provider hinter einem Adapter weiterbetreiben.

## Zielkomponenten

### 1. Payment Domain Layer

Neue interne Schicht unter `src/lib/payments/`:

- `src/lib/payments/types.ts`
- `src/lib/payments/config.ts`
- `src/lib/payments/providers/stripe-legacy.ts`
- `src/lib/payments/providers/mollie.ts`
- `src/lib/payments/providers/index.ts`
- `src/lib/payments/orders.ts`
- `src/lib/payments/webhooks.ts`
- `src/lib/payments/subscriptions.ts`
- `src/lib/payments/refunds.ts`
- `src/lib/payments/payouts.ts`
- `src/lib/payments/ledger.ts`
- `src/lib/payments/reconciliation.ts`

Diese Schicht kapselt:

- Payment-Intent/Order-Erzeugung
- Redirect/Hosted Checkout
- Webhook-Normalisierung
- Subscription-Erstzahlung und Folgezahlungen
- Refunds
- Ledger-Buchungen
- Payout-Generierung
- Reconciliation

### 2. PSP Adapter Layer

Zwei Provider parallel:

- `stripe-legacy`
  - bedient Bestands-Workflows
  - bleibt fuer alte Webhooks und Bestands-Subscriptions aktiv
- `mollie`
  - bedient neue Checkouts
  - liefert neue Events an das interne Ledger

Wichtig: Die App spricht nicht mehr direkt mit `stripe.checkout.sessions.create()` oder `stripe.webhooks.constructEvent()` ausserhalb des Adapter-Layers.

### 3. Internal Ledger

Das Ledger ist die autoritative Quelle fuer:

- Brutto-Zahlung
- PSP-Gebuehr
- RESER-Provision
- Anbieter-Verbindlichkeit
- Refund
- Chargeback
- Auszahlung
- Auszahlungsruecknahme / Korrektur

Dashboards, Statements und Payout-Jobs duerfen nur noch aus dem Ledger lesen.

### 4. Payout Engine

Neue RESER-interne Auszahlungslogik:

- Provider-Stammdaten in `profiles` plus eigener `provider_payout_accounts` Tabelle
- Auszahlungsfaehige Salden aus Ledger berechnen
- Payout-Batches erzeugen
- SEPA- oder PayPal-Payout ausloesen
- Ergebnis asynchron verbuchen

### 5. Dual-Run / Legacy Compatibility

Technisch zwingend:

- Stripe-Routen bleiben bestehen.
- Stripe-Webhooks bleiben aktiv.
- Bestands-Subscriptions bleiben auf Stripe bis zur planvollen Ueberfuehrung oder zum natuerlichen Auslaufen.
- Neue Buchungen und neue Kursanmeldungen koennen per Feature Flag auf Payment V2 geroutet werden.

## Zahlungsfluesse im Zielbild

### A. Einmaliges Angebot / Workshop

1. UI erzeugt interne `payment_order`.
2. PSP-Adapter erstellt Mollie-Payment.
3. Kunde bezahlt im Hosted Checkout.
4. PSP-Webhook wird als `payment_event` gespeichert.
5. `payment_status = paid` fuehrt zur Finalisierung der Buchung.
6. Ledger schreibt:
   - Forderung Kunde beglichen
   - PSP-Clearing
   - PSP-Fee
   - RESER-Provision
   - Anbieter-Verbindlichkeit
7. Ticket und Mails werden wie heute ausgeloest, aber nicht mehr direkt von Stripe-Objekten abhaengig.

### B. Laufendes Angebot / Subscription

1. Trial-Freigabe und Intent bleiben fachlich bestehen.
2. Erstanmeldung erzeugt internen `subscription_contract`.
3. Erste Zahlung wird ueber Mollie Checkout erzeugt, damit ein Mandat entsteht.
4. Nach erfolgreicher Erstzahlung:
   - `course_registration_intents.status = checkout_completed`
   - internes `subscription_contract` wird aktiv
   - Teilnehmer-Ticket wird erzeugt
5. Folgezahlungen kommen ueber:
   - Mollie Recurring Payments oder
   - Mollie Subscriptions API
6. Jeder Zahlungslauf erzeugt neue Ledger-Buchungen.
7. Teilnehmer-Lifecycle bleibt intern; PSP-Subscription ist nur ein Ausfuehrungskanal, nicht die fachliche Wahrheit.

## Datenmodell

## Leitprinzipien

- Bestehende Stripe-Spalten nicht sofort entfernen.
- Neue generische Payment-Referenzen zusaetzlich einfuehren.
- Buchungssaetze append-only modellieren.
- Payouts und Refunds niemals nur als Status auf der Ursprungstabelle modellieren.

## Bestehende Tabellen erweitern

### `profiles`

Vorhandene Felder wie `iban`, `first_name`, `last_name`, `provider_type`, `organization_name` bleiben.

Ergaenzungen:

- `legal_entity_type text`
- `legal_name text`
- `company_name text`
- `street text`
- `house_number text`
- `postal_code text`
- `city text`
- `country text`
- `tax_number text`
- `vat_id text`
- `payout_method text check in ('sepa','paypal')`
- `paypal_payout_email text`
- `payments_v2_status text check in ('draft','pending_review','active','blocked')`
- `payments_v2_enabled_at timestamptz`
- `legacy_stripe_mode text check in ('legacy_only','dual_run','disabled')`

### `bookings`

Bestehende Felder wie `stripe_session_id`, `payment_provider`, `payment_session_id`, `payment_status`, `stripe_refund_id` bleiben vorerst.

Ergaenzungen:

- `payment_order_id uuid null`
- `payment_capture_id uuid null`
- `active_refund_total_cents integer not null default 0`
- `payment_provider_reference text null`
- `ledger_finalized_at timestamptz null`

### `course_registration_intents`

Stripe-Spalten bleiben erhalten.

Ergaenzungen:

- `payment_order_id uuid null`
- `payment_customer_id text null`
- `payment_mandate_id text null`
- `payment_subscription_id text null`
- `payment_provider text null`
- `first_paid_at timestamptz null`
- `ledger_finalized_at timestamptz null`

## Neue Tabellen

### `provider_payout_accounts`

Pro Anbieter*in mindestens ein Auszahlungsziel.

- `id uuid pk`
- `provider_id uuid not null references profiles(id)`
- `method text not null check in ('sepa','paypal')`
- `account_holder_name text null`
- `iban_encrypted text null`
- `iban_last4 text null`
- `bic text null`
- `paypal_email text null`
- `currency text not null default 'EUR'`
- `is_default boolean not null default false`
- `verification_status text not null check in ('unverified','pending','verified','rejected')`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `payment_orders`

Autoritatives Objekt pro Checkout/Erstzahlung.

- `id uuid pk`
- `kind text not null check in ('workshop_booking','course_registration','subscription_renewal','manual_invoice')`
- `subject_type text not null`
- `subject_id uuid not null`
- `customer_email text not null`
- `currency text not null`
- `gross_amount_cents integer not null`
- `status text not null check in ('draft','pending','authorized','paid','failed','cancelled','expired','partially_refunded','refunded')`
- `provider text not null check in ('stripe','mollie','free','manual')`
- `provider_order_id text null`
- `provider_checkout_url text null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `payment_transactions`

Jeder PSP-Vorgang oder interne Zahlungsschritt.

- `id uuid pk`
- `payment_order_id uuid not null references payment_orders(id)`
- `transaction_type text not null check in ('payment','authorization','capture','refund','chargeback','adjustment','payout_funding_hold','payout_funding_release')`
- `provider text not null`
- `provider_transaction_id text null`
- `provider_customer_id text null`
- `provider_mandate_id text null`
- `provider_subscription_id text null`
- `amount_cents integer not null`
- `currency text not null`
- `status text not null check in ('pending','succeeded','failed','cancelled','disputed')`
- `occurred_at timestamptz not null`
- `raw_payload jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

### `payment_events`

Idempotente Rohpersistenz aller Webhooks.

- `id uuid pk`
- `provider text not null`
- `event_key text not null`
- `event_type text not null`
- `signature_valid boolean not null`
- `processed_at timestamptz null`
- `processing_status text not null check in ('received','processed','ignored','failed')`
- `payload jsonb not null`
- `created_at timestamptz not null default now()`
- unique `(provider, event_key)`

### `subscription_contracts`

Interne Wahrheit fuer wiederkehrende Vertraege.

- `id uuid pk`
- `course_registration_intent_id uuid null references course_registration_intents(id)`
- `course_id uuid not null references courses(id)`
- `customer_email text not null`
- `provider_id uuid not null references profiles(id)`
- `provider text not null check in ('stripe','mollie','manual')`
- `provider_subscription_id text null`
- `provider_customer_id text null`
- `provider_mandate_id text null`
- `status text not null check in ('pending','active','paused','cancel_scheduled','cancelled','ended')`
- `interval_unit text not null default 'month'`
- `interval_count integer not null default 1`
- `amount_cents integer not null`
- `currency text not null`
- `next_charge_at timestamptz null`
- `cancel_at timestamptz null`
- `started_at timestamptz null`
- `ended_at timestamptz null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `ledger_accounts`

Chart of accounts fuer das Nebenbuch.

- `id uuid pk`
- `code text not null unique`
- `name text not null`
- `account_type text not null check in ('asset','liability','revenue','expense','contra_revenue','clearing')`
- `scope text not null check in ('platform','provider','customer','psp')`
- `currency text not null default 'EUR'`
- `provider_id uuid null`
- `created_at timestamptz not null default now()`

Beispielkonten:

- `cash_psp_mollie`
- `receivable_customer`
- `liability_provider:{providerId}`
- `revenue_platform_fee`
- `expense_psp_fee`
- `refunds_payable`
- `payouts_in_transit`

### `ledger_entries`

Kopf einer fachlichen Buchung.

- `id uuid pk`
- `entry_type text not null check in ('payment_capture','refund','chargeback','payout','payout_reversal','manual_adjustment','subscription_charge')`
- `reference_type text not null`
- `reference_id uuid not null`
- `provider text null`
- `event_occurred_at timestamptz not null`
- `created_by text not null default 'system'`
- `created_at timestamptz not null default now()`

### `ledger_postings`

Einzelne Soll/Haben-Positionen.

- `id uuid pk`
- `entry_id uuid not null references ledger_entries(id) on delete cascade`
- `account_id uuid not null references ledger_accounts(id)`
- `direction text not null check in ('debit','credit')`
- `amount_cents integer not null check (amount_cents > 0)`
- `currency text not null`
- `created_at timestamptz not null default now()`

Regel: Pro `entry_id` muss Summe Soll = Summe Haben sein.

### `refunds`

- `id uuid pk`
- `payment_order_id uuid not null references payment_orders(id)`
- `payment_transaction_id uuid null references payment_transactions(id)`
- `provider text not null`
- `provider_refund_id text null`
- `reason text null`
- `amount_cents integer not null`
- `currency text not null`
- `status text not null check in ('pending','succeeded','failed','cancelled')`
- `reverse_payout_required boolean not null default false`
- `occurred_at timestamptz not null`
- `created_at timestamptz not null default now()`

### `payout_batches`

- `id uuid pk`
- `period_start date not null`
- `period_end date not null`
- `status text not null check in ('draft','queued','submitted','partially_paid','paid','failed','cancelled')`
- `currency text not null default 'EUR'`
- `created_at timestamptz not null default now()`
- `submitted_at timestamptz null`
- `completed_at timestamptz null`

### `payout_items`

- `id uuid pk`
- `batch_id uuid not null references payout_batches(id)`
- `provider_id uuid not null references profiles(id)`
- `payout_account_id uuid not null references provider_payout_accounts(id)`
- `method text not null check in ('sepa','paypal')`
- `gross_earnings_cents integer not null`
- `refunds_cents integer not null default 0`
- `chargebacks_cents integer not null default 0`
- `platform_fees_cents integer not null default 0`
- `psp_fees_cents integer not null default 0`
- `adjustments_cents integer not null default 0`
- `net_payout_cents integer not null`
- `status text not null check in ('pending','submitted','paid','failed','reversed')`
- `external_payout_id text null`
- `statement_id uuid null`
- `created_at timestamptz not null default now()`

### `provider_statements`

Abrechnung pro Anbieter und Zeitraum.

- `id uuid pk`
- `provider_id uuid not null references profiles(id)`
- `period_start date not null`
- `period_end date not null`
- `currency text not null`
- `gross_amount_cents integer not null`
- `platform_fee_cents integer not null`
- `psp_fee_cents integer not null`
- `refund_cents integer not null`
- `chargeback_cents integer not null`
- `adjustment_cents integer not null`
- `net_payout_cents integer not null`
- `payout_batch_id uuid null references payout_batches(id)`
- `finalized_at timestamptz null`
- `created_at timestamptz not null default now()`

## Beispiel-Buchungssaetze

### Erfolgreiche Workshop-Zahlung 100,00 EUR

Annahmen:

- PSP fee: 2,50 EUR
- RESER Provision: 15,00 EUR
- Anbieteranteil: 82,50 EUR

Ledger:

1. `debit cash_psp_mollie 10000`
2. `credit receivable_customer 10000`
3. `debit expense_psp_fee 250`
4. `credit cash_psp_mollie 250`
5. `debit cash_psp_mollie 1500`
6. `credit revenue_platform_fee 1500`
7. `debit cash_psp_mollie 8250`
8. `credit liability_provider:{providerId} 8250`

In der Implementierung kann das in 2-3 Ledger-Entries statt einer Sammelbuchung modelliert werden. Wichtig ist nur: doppelte Buchfuehrung und reproduzierbare Herleitung.

### Vollrefund vor Auszahlung

1. Anbieter-Verbindlichkeit reduzieren
2. PSP-Cash reduzieren
3. Refund-Objekt speichern
4. Falls Provider-Anteil bereits ausgezahlt wurde: negativer Saldo oder Payout-Reversal vormerken

## Migrationsroadmap

## Phase 0: Discovery und Absicherung

- Bestehende Stripe-Flows einfrieren und dokumentieren.
- Alle Stripe-Ereignisse mit echten IDs und Tabellenbezug inventarisieren.
- Feature Flags einfuehren:
  - `PAYMENTS_V2_ENABLED`
  - `PAYMENTS_V2_NEW_WORKSHOP_CHECKOUT`
  - `PAYMENTS_V2_NEW_SUBSCRIPTIONS`
  - `PAYMENTS_V2_PROVIDER_PAYOUTS`
- Sentry/Logs fuer alle Zahlungsfluesse standardisieren.

Exit-Kriterien:

- Jeder bestehende Flow hat Owner, Trigger, Tabelle und Failure-Mode.

## Phase 1: Payment Domain Foundation

- Neue Tabellen fuer `payment_orders`, `payment_transactions`, `payment_events`, `ledger_*`, `refunds`, `payout_*`, `provider_statements`, `subscription_contracts`, `provider_payout_accounts`.
- Generische Payment-Service-Schicht unter `src/lib/payments/`.
- Stripe-Legacy-Adapter baut auf existierenden Modulen auf.
- Revenue-Dashboard liest noch nicht um, aber Dual-Write startet.

Exit-Kriterien:

- Neue Zahlungen koennen intern modelliert werden, ohne dass alte Routen geaendert werden muessen.

## Phase 2: Stripe entkoppeln, noch ohne Produktumschaltung

- Bestehende Stripe-Routen schreiben parallel in `payment_orders`, `payment_transactions`, `payment_events`, `ledger_entries`.
- Stripe-Webhooks werden ueber neuen Event-Ingest verarbeitet.
- `course_registration_finalization` und `workshop_booking_finalization` lesen generische Payment-Referenzen, akzeptieren aber noch Stripe-IDs.

Exit-Kriterien:

- Ledger kann Bestands-Stripe-Zahlungen korrekt nachzeichnen.
- Revenue-Ansicht kann testweise aus Ledger und Altlogik verglichen werden.

## Phase 3: Provider Payment Profile V2

- Profilformular erweitern um:
  - Rechtsform
  - Steuerdaten
  - Auszahlungsart
  - IBAN oder PayPal-Adresse
- Interne Prüfstrecke fuer Vollstaendigkeit und Review.
- Stripe Connect Onboarding im UI ausblenden fuer neu aktivierte Anbieter*innen.

Exit-Kriterien:

- Neue Anbieter*innen koennen ohne Stripe-Connect durch das Onboarding.

## Phase 4: Workshops auf Payment V2

- Neuer Workshop-Checkout nicht mehr unter `/api/stripe/checkout`, sondern zusaetzlich unter:
  - `src/app/api/payments/workshops/checkout/route.ts`
- `src/app/courses/[id]/PayButton.tsx` per Feature Flag auf neue Route umstellen.
- Mollie-Webhooks verarbeiten:
  - `paid`
  - `failed`
  - `expired`
  - `canceled`
  - `refunded`
  - `charged_back`

Exit-Kriterien:

- Neue Workshop-Buchungen laufen vollstaendig ueber Payment V2.
- Alte Stripe-Workshops bleiben lesbar und supportbar.

## Phase 5: Neue Kursanmeldungen / Subscriptions auf Payment V2

- Neue Route:
  - `src/app/api/payments/course-registration/checkout/route.ts`
- Erstanmeldung erzeugt Mandat und internes `subscription_contract`.
- Wiederkehrende Belastungen werden ueber Mollie-Recurring bzw. Mollie-Subscriptions verarbeitet.
- Teilnehmer-Lifecycle entkoppeln von `stripe_subscription_id`.

Exit-Kriterien:

- Neue Kursanmeldungen werden ohne Stripe erzeugt.
- Bestands-Subscriptions bleiben auf Stripe, neue auf V2.

## Phase 6: Payout Engine

- Auszahlungsfaehige Anbieter-Salden aus Ledger bestimmen.
- `provider_statements` und `payout_batches` erzeugen.
- Payout-Connector fuer SEPA oder PayPal Payouts anbinden.
- Manueller Review-Schritt vor ersten Live-Auszahlungen.

Exit-Kriterien:

- Payouts sind reproduzierbar, stornierbar und mit Statements belegbar.

## Phase 7: Reconciliation und Ablösung

- Tägliche Abstimmung:
  - PSP settlements
  - interne Ledger-Summen
  - Refunds
  - Chargebacks
  - Payouts
- Revenue-Dashboard komplett auf Ledger umstellen.
- Stripe Connect fuer Neugeschaeft deaktivieren.
- Stripe-Bestandsdaten nur noch fuer Legacy-Vertraege und Historie vorhalten.

Exit-Kriterien:

- Keine Neukunden- oder Neuanbieter-Flows laufen mehr ueber Stripe Connect.

## Konkrete Umbaupfade in dieser Codebasis

## Bestehende Dateien, die zuerst angepasst werden sollten

### Checkout / Produktfluss

- `src/app/courses/[id]/PayButton.tsx`
- `src/app/trial/register/[token]/actions.ts`
- `src/app/api/stripe/checkout/route.ts`
- `src/app/api/stripe/course-registration/checkout/route.ts`

### Finalisierung / Ticketing / E-Mails

- `src/lib/workshop-booking-finalization.ts`
- `src/lib/course-registration-finalization.ts`
- `src/lib/tickets.ts`
- `src/lib/trial-reservation-emails.ts`
- `src/lib/workshop-booking-emails.ts`

### Provider-Onboarding / Profil

- `src/app/dashboard/profile/ProfileForm.tsx`
- `src/app/dashboard/profile/actions.ts`
- `src/lib/provider-profiles.ts`
- `supabase/migrations/*profiles*`

### Webhooks / Background Processing

- `src/app/api/stripe/webhook/route.ts`
- neue Route `src/app/api/payments/webhooks/mollie/route.ts`
- neue Route `src/app/api/payments/webhooks/stripe/route.ts`

### Teilnehmer-Lifecycle / Subscriptions

- `src/lib/course-lifecycle.ts`
- `src/app/dashboard/participants/[id]/actions.ts`
- `src/app/dashboard/participants/[id]/page.tsx`
- `src/app/dashboard/attendance/page.tsx`

### Reporting / Revenue

- `src/app/dashboard/revenue/page.tsx`
- neue Aggregationen unter `src/lib/payments/reconciliation.ts`

## Empfohlene neue Module

- `src/lib/payments/provider-routing.ts`
- `src/lib/payments/create-workshop-payment.ts`
- `src/lib/payments/create-course-registration-payment.ts`
- `src/lib/payments/finalize-payment.ts`
- `src/lib/payments/record-ledger-entry.ts`
- `src/lib/payments/build-provider-statement.ts`
- `src/lib/payments/create-payout-batch.ts`
- `src/lib/payments/execute-paypal-payout.ts`
- `src/lib/payments/execute-sepa-payout.ts`

## Codex-taugliche Umsetzung in Arbeitspaketen

1. Neue Supabase-Tabellen und Indizes fuer Payment V2 einfuehren, ohne bestehende Tabellen oder Constraints zu loeschen.
2. `src/lib/payments/` mit Typen, Repository-Funktionen und Provider-Interfaces aufbauen.
3. Stripe-Legacy-Adapter schreiben, der bestehende Stripe-Responses in interne `payment_events` und `payment_transactions` uebersetzt.
4. `src/app/api/stripe/webhook/route.ts` auf den neuen Event-Ingest umstellen, ohne die URL zu aendern.
5. Workshop-Finalisierung so umbauen, dass sie eine generische `payment_order_id` verarbeiten kann.
6. Workshop-Checkout-V2 mit Mollie hinter Feature Flag einfuehren.
7. Revenue-Dual-Run bauen: alte Berechnung gegen Ledger-Summen vergleichen.
8. Profilformular um Steuer- und Auszahlungsdaten erweitern.
9. `provider_payout_accounts` inklusive Validierung, Verschluesselung und Default-Account-Logik einfuehren.
10. Internes `subscription_contracts`-Modell einfuehren.
11. Kursanmeldungs-Checkout-V2 fuer neue Registrierungen aufsetzen.
12. Folgezahlungen und Subscription-Webhooks fuer V2 verarbeiten.
13. Refund-Service mit partiellen und vollen Refunds plus Ledger-Reversal bauen.
14. Statement-Generator und Payout-Batches bauen.
15. Zuerst manuelle, dann automatische Auszahlungen freischalten.
16. Nach stabiler Parallelphase Stripe Connect fuer Neuanbieter deaktivieren.

## Risiken und Pruefstellen

## Rechtlich / regulatorisch

Der groesste Risikoblock ist nicht technisch, sondern aufsichtsrechtlich.

### Kritischer Punkt

Sobald RESER Kundengelder vereinnahmt, intern saldiert und spaeter an Anbieter*innen auszahlt, bewegt sich das Modell sehr schnell in Richtung regulierter Zahlungsdienste oder Marketplace/Merchant-of-Record-Strukturen mit KYC-, AML- und PSD2/ZAG-Pflichten.

### Konkrete Warnsignale

- BaFin weist im Merkblatt zum ZAG darauf hin, dass Online-Plattformen regelmaessig nicht unter die Handelsvertreterausnahme fallen, wenn sie auf beiden Seiten des Geschaefts stehen oder nur Botendienste leisten.
- Mollie Connect fuer Marketplaces verlagert Refund-/Chargeback-Haftung auf die Plattform.
- Mollie Balance Transfers duerfen explizit nicht dafuer verwendet werden, Shopper Funds an die Plattform anzunehmen und an Seller weiterzuleiten.

### Konsequenz fuer RESER

Das Ziel "kein externes Anbieter-Onboarding bei Stripe oder Mollie" ist fachlich attraktiv, rechtlich aber nur sauber, wenn eines der folgenden Modelle gewaehlt wird:

- RESER wird selbst lizenziertes Zahlungsinstitut/E-Geld-Institut oder arbeitet mit einem solchen als reguliertem Partner.
- RESER nutzt einen PSP/Marketplace-Partner, der KYC/KYB und Geldfluss regulatorisch uebernimmt, auch wenn das UI co-gebrandet oder eingebettet ist.
- RESER wird echter Merchant of Record mit eigener steuerlicher und vertraglicher Struktur; das veraendert aber Rechnungsstellung, USt, Chargeback-Risiko und AGB erheblich.

Empfehlung:

- Vor Architekturfreigabe zwingend Payment-/FinReg-Rechtsgutachten fuer Deutschland/EU einholen.
- Parallel mit Mollie, einem PayFac/BaaS-Partner oder spezialisierten Marketplace-Provider klaeren, welches Modell ohne sichtbares Fremd-Onboarding ueberhaupt livefaehig ist.

## Finanzielle / operative Risiken

- Falsche Ledger-Logik fuehrt zu fehlerhaften Auszahlungen.
- Refund nach bereits erfolgter Auszahlung erzeugt negative Anbieter-Salden.
- PSP-Gebuehren, Chargebacks und Waehrungsabweichungen koennen Netto-Salden verschieben.
- Subscription-Folgezahlungen duerfen nicht nur am Vertragsstatus, sondern muessen am echten PSP-Event haengen.
- Doppelte Webhook-Verarbeitung ohne Idempotenz fuehrt zu Doppelbuchungen.

## Technische Pruefstellen

- Idempotenz pro Webhook-Event und pro Provider-Transaction
- Reentrancy in Finalisierungsjobs
- Row-level locking oder eindeutige Constraints bei Ledger-Erzeugung
- Verschluesselung fuer IBAN und steuerlich sensible Daten
- Migrationsskripte ohne Bruch bestehender Indizes und RLS-Policies
- Backfill fuer historische Stripe-Zahlungen ins neue Ledger

## Teststrategie

- Golden-path Tests fuer Workshop-Zahlung, Kurs-Erstzahlung, Folgezahlung, Vollrefund, Teilrefund, Chargeback, Payout
- Replay-Tests mit echten Stripe-Webhook-Payloads
- Sandbox-Tests mit Mollie-Zahlungen und Recurring Mandates
- Abgleichstest: altes Revenue-Dashboard vs. Ledger fuer denselben Zeitraum
- Dry-run Payout-Preview ohne Auszahlung

## Empfohlene Produkt-/Architekturentscheidung

Technisch ist die Zielarchitektur sinnvoll. Operativ ist sie nur dann tragfaehig, wenn RESER zwischen zwei klaren Modellen waehlt:

### Option A: RESER als Marketplace mit reguliertem Partner

Technisch beste Passung:

- Mollie Marketplace oder ein anderer PSP/BaaS-Partner
- internes Ledger bei RESER
- Provider-Onboarding UI in RESER, aber regulatorisches KYC/KYB im Hintergrund oder via eingebettete/co-branded Komponenten

Vorteil:

- geringeres FinReg-Risiko

Nachteil:

- "kein externes Onboarding" ist wahrscheinlich nur UX-seitig loesbar, nicht regulatorisch voll unsichtbar

### Option B: RESER als echter MoR mit eigener Auszahlungslogik

Technisch moeglich, aber nur mit Rechts- und Tax-Redesign.

Vorteil:

- maximale UX-Kontrolle

Nachteil:

- hohes Risiko bei ZAG/PSD2, AML, Rechnung, USt, Chargebacks, Treuhand-/Fremdgeld-Themen

## Empfehlung

Weiterarbeiten mit folgender Reihenfolge:

1. Payment-V2-Domain und Ledger jetzt bauen.
2. Stripe zuerst nur entkoppeln, nicht abschalten.
3. Rechtlich klaeren, ob RESER Marketplace mit Partner oder MoR werden darf und will.
4. Erst danach den finalen Payout- und Provider-Onboarding-Pfad live schalten.

## Externe Quellen

- BaFin, Hinweise zum Zahlungsdiensteaufsichtsgesetz (Stand laut Seite geaendert am 05.07.2024): https://www.bafin.de/SharedDocs/Veroeffentlichungen/DE/Merkblatt/mb_111222_zag.html
- Mollie Connect for Marketplaces, Processing payments: https://docs.mollie.com/docs/connect-marketplaces-processing-payments
- Mollie Connect overview: https://docs.mollie.com/docs/connect-overview
- Mollie Recurring payments: https://docs.mollie.com/docs/recurring-payments
- Mollie Connect for Platforms, Balance Transfers: https://docs.mollie.com/docs/connect-platforms-balance-transfers
- Mollie Create Connect balance transfer API: https://docs.mollie.com/reference/create-connect-balance-transfer
- PayPal Payouts API: https://developer.paypal.com/docs/api/payments.payouts-batch/v1/
- Stripe destination charges: https://docs.stripe.com/connect/destination-charges

import Link from "next/link";
import type { ReactNode } from "react";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { canRunPaymentsV2Simulation } from "@/lib/payments/simulation";
import DashboardBackLink from "@/app/dashboard/_components/DashboardBackLink";
import {
  createSimulatedPayoutBatchAction,
  forceLedgerEntryPayableForTestAction,
  markEligibleLedgerEntriesAsPayableAction,
  simulateWorkshopCancellationAction,
  simulateWorkshopPaymentFailedAction,
  simulateWorkshopPaymentSuccessAction,
  simulateWorkshopRefundAction,
} from "./actions";
import { requirePaymentsV2AdminAccess } from "./access";
import {
  AuditNav,
  PAYMENTS_V2_ADMIN_PATH,
  PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH,
  Section,
  StatusBadge,
  formatDateTime,
  formatMoney,
  shortenId,
} from "./ui";

export const dynamic = "force-dynamic";

type PaymentTransactionRow = {
  id: string;
  booking_id: string | null;
  course_registration_intent_id: string | null;
  provider: string;
  provider_payment_id: string | null;
  provider_checkout_id: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  amount_cents: number;
  currency: string;
  payment_method: string | null;
  status: string;
  paid_at: string | null;
  refunded_at: string | null;
  failed_at: string | null;
  created_at: string;
};

type LedgerEntryRow = {
  id: string;
  provider_payout_profile_id: string | null;
  source_type: string;
  source_id: string;
  entry_type: string;
  gross_amount_cents: number;
  platform_fee_cents: number;
  provider_fee_cents: number;
  net_amount_cents: number;
  currency: string;
  payout_status: string;
  available_at: string | null;
  payout_batch_id: string | null;
  created_at: string;
};

type PayoutBatchRow = {
  id: string;
  payout_provider: string;
  payout_method: string;
  total_amount_cents: number;
  currency: string;
  status: string;
  scheduled_for: string | null;
  created_at: string;
};

type PayoutItemRow = {
  id: string;
  payout_batch_id: string;
  provider_payout_profile_id: string;
  ledger_entry_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  created_at: string;
};

type RefundRecordRow = {
  id: string;
  payment_transaction_id: string;
  provider_refund_id: string | null;
  amount_cents: number;
  reason: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type ProviderWebhookEventRow = {
  id: string;
  provider: string;
  provider_event_id: string;
  event_type: string;
  processing_status: string;
  created_at: string;
};

type RelatedPaymentTransactionRow = Pick<
  PaymentTransactionRow,
  "id" | "booking_id" | "course_registration_intent_id"
>;

type RelatedRefundRow = Pick<RefundRecordRow, "id" | "payment_transaction_id">;

type SearchParams = {
  action?: string;
};

const ROW_LIMIT = 20;

function ReferenceCell({
  bookingId,
  courseRegistrationIntentId,
}: {
  bookingId: string | null | undefined;
  courseRegistrationIntentId: string | null | undefined;
}) {
  return (
    <div className="space-y-1 text-xs text-slate-600">
      <div>
        booking:{" "}
        {bookingId ? (
          <Link className="text-sky-700 underline" href={`/dashboard/participants/${bookingId}?source=workshop`}>
            {shortenId(bookingId)}
          </Link>
        ) : (
          "-"
        )}
      </div>
      <div>intent: {courseRegistrationIntentId ? shortenId(courseRegistrationIntentId) : "-"}</div>
    </div>
  );
}

function ActionNotice({ action }: { action: string | undefined }) {
  if (!action) return null;

  let message = "Interne Simulation ausgefuehrt.";
  let toneClass = "border-slate-200 bg-slate-100 text-slate-700";

  if (action.startsWith("eligible-ok-")) {
    const count = action.slice("eligible-ok-".length);
    message = `${count} Ledger-Eintraege wurden als payable markiert.`;
    toneClass = "border-green-200 bg-green-50 text-green-800";
  } else if (action.startsWith("eligible-none-")) {
    const count = action.slice("eligible-none-".length);
    message = `Keine neuen payable-Eintraege. Geprueft: ${count}.`;
    toneClass = "border-amber-200 bg-amber-50 text-amber-800";
  } else if (action === "eligible-error") {
    message = "Fehler beim Markieren von payable Ledger-Eintraegen.";
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
  } else if (action.startsWith("batch-ok-")) {
    const parts = action.split("-");
    const batchCount = parts[2] ?? "0";
    const itemCount = parts[3] ?? "0";
    message = `${batchCount} Simulations-Batches mit ${itemCount} Items wurden erzeugt.`;
    toneClass = "border-green-200 bg-green-50 text-green-800";
  } else if (action.startsWith("batch-none-")) {
    const count = action.slice("batch-none-".length);
    message = `Keine neuen Simulations-Batches. Payable geprueft: ${count}.`;
    toneClass = "border-amber-200 bg-amber-50 text-amber-800";
  } else if (action === "batch-error") {
    message = "Fehler beim Erzeugen des Simulated Payout Batch.";
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
  } else if (action.startsWith("force-payable-ok-")) {
    message = "Ledger-Eintrag wurde im Testmodus auf payable gesetzt. Nur Testmodus - loest keine echte Auszahlung aus.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
  } else if (action.startsWith("force-payable-none-")) {
    message =
      "Ledger-Eintrag konnte nicht umgestellt werden. Er muss pending_event_completion sein und darf noch keinem Batch zugeordnet sein.";
    toneClass = "border-amber-200 bg-amber-50 text-amber-800";
  } else if (action.startsWith("force-payable-error-")) {
    message = "Fehler beim Force-payable-Test. Nur Testmodus - loest keine echte Auszahlung aus.";
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
  } else if (action.startsWith("workshop-pay-ok-")) {
    message = "Workshop-Zahlung intern als erfolgreich simuliert. Keine echte Zahlung, keine Auszahlung, keine Kund*innenmail.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
  } else if (action.startsWith("workshop-fail-ok-")) {
    message = "Workshop-Zahlung intern als fehlgeschlagen simuliert. Keine echte Zahlung, keine Auszahlung, keine Kund*innenmail.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
  } else if (action.startsWith("workshop-refund-ok-")) {
    message = "Workshop-Refund intern simuliert. Kein Provider-Refund und keine Kund*innenmail.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
  } else if (action.startsWith("workshop-cancel-ok-")) {
    message = "Workshop-Storno intern simuliert. Keine echte Zahlung, kein echter Refund und keine Kund*innenmail.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
  } else if (action.startsWith("workshop-pay-error-")) {
    const code = action.slice("workshop-pay-error-".length);
    message = `Fehler bei der Workshop-Zahlungssimulation: ${code}.`;
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
  } else if (action.startsWith("workshop-fail-error-")) {
    const code = action.slice("workshop-fail-error-".length);
    message = `Fehler bei der Workshop-Fehlschlag-Simulation: ${code}.`;
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
  } else if (action.startsWith("workshop-refund-error-")) {
    const code = action.slice("workshop-refund-error-".length);
    message = `Fehler bei der Workshop-Refund-Simulation: ${code}.`;
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
  } else if (action.startsWith("workshop-cancel-error-")) {
    const code = action.slice("workshop-cancel-error-".length);
    message = `Fehler bei der Workshop-Storno-Simulation: ${code}.`;
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
  }

  return <div className={`rounded-2xl border px-4 py-3 text-sm ${toneClass}`}>{message}</div>;
}

function ActionButton({
  action,
  label,
  description,
}: {
  action: () => Promise<void>;
  label: string;
  description: string;
}) {
  return (
    <form action={action} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="space-y-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{label}</div>
          <div className="mt-1 text-xs text-slate-600">{description}</div>
        </div>
        <button
          type="submit"
          className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Internal Simulation
        </button>
      </div>
    </form>
  );
}

function SimulationForm({
  action,
  title,
  description,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <form action={action} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="space-y-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="mt-1 text-xs text-slate-700">{description}</div>
        </div>
        {children}
        <button
          type="submit"
          className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Internal Simulation
        </button>
      </div>
    </form>
  );
}

function TextInput({
  name,
  label,
  placeholder,
}: {
  name: string;
  label: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">{label}</span>
      <input
        name={name}
        type="text"
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
      />
    </label>
  );
}

export default async function PaymentsV2AdminPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const user = await requirePaymentsV2AdminAccess();
  const canUseSimulation = canRunPaymentsV2Simulation(user.email);

  const admin = createSupabaseAdmin();
  const [transactionsResult, ledgerResult, refundsResult, webhooksResult, payoutBatchesResult, payoutItemsResult] =
    await Promise.all([
    admin
      .from("payment_transactions")
      .select(
        "id,booking_id,course_registration_intent_id,provider,provider_payment_id,provider_checkout_id,provider_customer_id,provider_subscription_id,amount_cents,currency,payment_method,status,paid_at,refunded_at,failed_at,created_at"
      )
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT)
      .returns<PaymentTransactionRow[]>(),
    admin
      .from("ledger_entries")
      .select(
        "id,provider_payout_profile_id,source_type,source_id,entry_type,gross_amount_cents,platform_fee_cents,provider_fee_cents,net_amount_cents,currency,payout_status,available_at,payout_batch_id,created_at"
      )
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT)
      .returns<LedgerEntryRow[]>(),
    admin
      .from("refund_records")
      .select("id,payment_transaction_id,provider_refund_id,amount_cents,reason,status,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT)
      .returns<RefundRecordRow[]>(),
    admin
      .from("provider_webhook_events")
      .select("id,provider,provider_event_id,event_type,processing_status,created_at")
      .eq("provider", "stripe")
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT)
      .returns<ProviderWebhookEventRow[]>(),
    admin
      .from("payout_batches")
      .select("id,payout_provider,payout_method,total_amount_cents,currency,status,scheduled_for,created_at")
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT)
      .returns<PayoutBatchRow[]>(),
    admin
      .from("payout_items")
      .select("id,payout_batch_id,provider_payout_profile_id,ledger_entry_id,amount_cents,currency,status,created_at")
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT)
      .returns<PayoutItemRow[]>(),
  ]);

  const paymentTransactions = transactionsResult.data ?? [];
  const ledgerEntries = ledgerResult.data ?? [];
  const refundRecords = refundsResult.data ?? [];
  const webhookEvents = webhooksResult.data ?? [];
  const payoutBatches = payoutBatchesResult.data ?? [];
  const payoutItems = payoutItemsResult.data ?? [];

  const paymentTransactionIds = Array.from(
    new Set(
      [
        ...paymentTransactions.map((row) => row.id),
        ...refundRecords.map((row) => row.payment_transaction_id),
        ...ledgerEntries
          .filter((row) => row.source_type === "payment_transaction")
          .map((row) => row.source_id),
      ].filter(Boolean)
    )
  );
  const refundIdsFromLedger = Array.from(
    new Set(
      ledgerEntries.filter((row) => row.source_type === "refund_record").map((row) => row.source_id).filter(Boolean)
    )
  );

  const [relatedTransactionsResult, relatedRefundsResult] = await Promise.all([
    paymentTransactionIds.length > 0
      ? admin
          .from("payment_transactions")
          .select("id,booking_id,course_registration_intent_id")
          .in("id", paymentTransactionIds)
          .returns<RelatedPaymentTransactionRow[]>()
      : Promise.resolve({ data: [] as RelatedPaymentTransactionRow[] }),
    refundIdsFromLedger.length > 0
      ? admin
          .from("refund_records")
          .select("id,payment_transaction_id")
          .in("id", refundIdsFromLedger)
          .returns<RelatedRefundRow[]>()
      : Promise.resolve({ data: [] as RelatedRefundRow[] }),
  ]);

  const relatedTransactions = new Map(
    (relatedTransactionsResult.data ?? []).map((row) => [row.id, row] as const)
  );
  const relatedRefunds = new Map((relatedRefundsResult.data ?? []).map((row) => [row.id, row] as const));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <DashboardBackLink />
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-sky-700">Internal Audit</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Payments V2</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Read-only Kontrollansicht fuer die aktuelle Payment-V2-Spiegelung. Angezeigt werden nur interne
            Audit-Daten ohne Webhook-Payloads und ohne sensible Auszahlungsdaten.
          </p>
          <div className="mt-4">
            <AuditNav currentPath={PAYMENTS_V2_ADMIN_PATH} />
          </div>
          <div className="mt-4 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
            Simulation only
          </div>
          <div className="mt-4 text-sm text-slate-600">
            Subscription-Domain-Audit:{" "}
            <Link className="font-medium text-sky-700 underline" href={PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH}>
              Subscription Audit oeffnen
            </Link>
          </div>
        </header>

        <ActionNotice action={sp.action} />

        <div className="grid gap-4 md:grid-cols-2">
          <ActionButton
            action={markEligibleLedgerEntriesAsPayableAction}
            label="Eligible Ledger Entries als payable markieren"
            description="Ruft intern markEligibleLedgerEntriesAsPayable() auf. Keine echte Auszahlung."
          />
          <ActionButton
            action={createSimulatedPayoutBatchAction}
            label="Simulated Payout Batch erstellen"
            description="Ruft intern createSimulatedPayoutBatch() auf. Nur interne Batch-Simulation."
          />
        </div>

        <Section
          title="Interne Workshop-Simulation"
          description="Admin-only Einzelaktionen fuer Workshop-Zahlung, Fehlschlag, Refund und Storno. Kein Stripe, kein Mollie, kein PayPal, keine echte Auszahlung."
        >
          {canUseSimulation ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-300 bg-amber-100 px-4 py-3 text-sm text-amber-950">
                Simulation only. Keine echte Zahlung, keine echte Auszahlung, keine Kund*innenmail.
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <SimulationForm
                  action={simulateWorkshopPaymentSuccessAction}
                  title="Zahlung erfolgreich simulieren"
                  description="Erzeugt eine interne paid payment_transaction und genau einen positiven Ledger-Eintrag."
                >
                  <TextInput name="bookingId" label="booking_id" placeholder="uuid" />
                  <TextInput name="amountCents" label="Betrag in Cent optional" placeholder="z. B. 4900" />
                  <TextInput name="currency" label="Waehrung optional" placeholder="EUR" />
                  <TextInput name="scenarioNote" label="Scenario Note optional" placeholder="Kurznotiz" />
                </SimulationForm>

                <SimulationForm
                  action={simulateWorkshopPaymentFailedAction}
                  title="Zahlung fehlgeschlagen simulieren"
                  description="Erzeugt eine interne failed payment_transaction ohne positiven Ledger-Eintrag."
                >
                  <TextInput name="bookingId" label="booking_id" placeholder="uuid" />
                  <TextInput name="amountCents" label="Betrag in Cent optional" placeholder="z. B. 4900" />
                  <TextInput name="currency" label="Waehrung optional" placeholder="EUR" />
                  <TextInput name="scenarioNote" label="Scenario Note optional" placeholder="Kurznotiz" />
                </SimulationForm>

                <SimulationForm
                  action={simulateWorkshopRefundAction}
                  title="Refund simulieren"
                  description="Erzeugt einen internen succeeded Refund fuer eine simulierte Workshop-Zahlung. booking_id oder payment_transaction_id angeben."
                >
                  <TextInput name="bookingId" label="booking_id optional" placeholder="uuid" />
                  <TextInput name="paymentTransactionId" label="payment_transaction_id optional" placeholder="uuid" />
                  <TextInput name="refundAmountCents" label="Refund in Cent optional" placeholder="z. B. 4900" />
                  <TextInput name="reason" label="Grund optional" placeholder="Refund reason" />
                </SimulationForm>

                <SimulationForm
                  action={simulateWorkshopCancellationAction}
                  title="Workshop-Storno simulieren"
                  description="Bezahlte Simulationen werden ueber den Refund-Pfad abgewickelt. Unbezahlte Faelle werden nur intern als cancelled simuliert."
                >
                  <TextInput name="bookingId" label="booking_id" placeholder="uuid" />
                  <TextInput name="refundAmountCents" label="Refund in Cent optional" placeholder="z. B. 4900" />
                  <TextInput name="reason" label="Grund optional" placeholder="Cancellation note" />
                </SimulationForm>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700">
              Workshop-Simulation ist derzeit deaktiviert. Erforderlich sind `PAYMENTS_V2_SIMULATION_ENABLED` und eine
              freigeschaltete Admin-Mail in `PAYMENTS_V2_ADMIN_EMAILS`.
            </div>
          )}
        </Section>

        <div className="grid gap-6">
          <Section
            title="Payment Transactions"
            description="Letzte gespiegelt erfasste oder aktualisierte Zahlungs-Transaktionen."
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Betrag</th>
                    <th className="px-3 py-2">Referenz</th>
                    <th className="px-3 py-2">Provider IDs</th>
                    <th className="px-3 py-2">Zeitpunkte</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentTransactions.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3">
                        <div className="space-y-2">
                          <StatusBadge value={row.status} />
                          <div className="text-xs text-slate-500">{row.provider}</div>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-900">{formatMoney(row.amount_cents, row.currency)}</td>
                      <td className="px-3 py-3">
                        <ReferenceCell
                          bookingId={row.booking_id}
                          courseRegistrationIntentId={row.course_registration_intent_id}
                        />
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>tx: {shortenId(row.id)}</div>
                        <div>payment: {shortenId(row.provider_payment_id)}</div>
                        <div>checkout: {shortenId(row.provider_checkout_id)}</div>
                        <div>subscription: {shortenId(row.provider_subscription_id)}</div>
                        <div>method: {row.payment_method ?? "-"}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>created: {formatDateTime(row.created_at)}</div>
                        <div>paid: {formatDateTime(row.paid_at)}</div>
                        <div>failed: {formatDateTime(row.failed_at)}</div>
                        <div>refunded: {formatDateTime(row.refunded_at)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Ledger Entries" description="Letzte erzeugte Ledger-Zeilen der Payment-V2-Spiegelung.">
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Nur Testmodus - loest keine echte Auszahlung aus.
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Entry</th>
                    <th className="px-3 py-2">Brutto / Netto</th>
                    <th className="px-3 py-2">Quelle</th>
                    <th className="px-3 py-2">Payout Status</th>
                    <th className="px-3 py-2">Batch</th>
                    <th className="px-3 py-2">Referenz</th>
                    <th className="px-3 py-2">Testmodus</th>
                    <th className="px-3 py-2">Erstellt</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerEntries.map((row) => {
                    const relatedTransaction =
                      row.source_type === "payment_transaction"
                        ? relatedTransactions.get(row.source_id)
                        : row.source_type === "refund_record"
                          ? relatedTransactions.get(relatedRefunds.get(row.source_id)?.payment_transaction_id ?? "")
                          : undefined;

                    return (
                      <tr key={row.id} className="border-b border-slate-100 align-top">
                        <td className="px-3 py-3">
                          <div className="space-y-2">
                            <StatusBadge value={row.entry_type} />
                            <div className="text-xs text-slate-500">payout: <StatusBadge value={row.payout_status} /></div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-700">
                          <div>gross: {formatMoney(row.gross_amount_cents, row.currency)}</div>
                          <div>platform fee: {formatMoney(row.platform_fee_cents, row.currency)}</div>
                          <div>provider fee: {formatMoney(row.provider_fee_cents, row.currency)}</div>
                          <div className="font-medium text-slate-900">net: {formatMoney(row.net_amount_cents, row.currency)}</div>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600">
                          <div>{row.source_type}</div>
                          <div>{shortenId(row.source_id)}</div>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600">
                          <div className="mb-2">
                            <StatusBadge value={row.payout_status} />
                          </div>
                          <div>available at: {formatDateTime(row.available_at)}</div>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600">
                          <div>batch: {shortenId(row.payout_batch_id)}</div>
                          <div>profile: {shortenId(row.provider_payout_profile_id)}</div>
                        </td>
                        <td className="px-3 py-3">
                          <ReferenceCell
                            bookingId={relatedTransaction?.booking_id}
                            courseRegistrationIntentId={relatedTransaction?.course_registration_intent_id}
                          />
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600">
                          {row.payout_status === "pending_event_completion" && !row.payout_batch_id ? (
                            <form action={forceLedgerEntryPayableForTestAction} className="space-y-2">
                              <input type="hidden" name="ledgerEntryId" value={row.id} />
                              <button
                                type="submit"
                                className="inline-flex rounded-xl border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-200"
                              >
                                Force payable (Test)
                              </button>
                              <div className="text-[11px] text-amber-800">
                                Nur Testmodus - loest keine echte Auszahlung aus.
                              </div>
                            </form>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600">{formatDateTime(row.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Payout Batches"
            description="Interne Simulations-Batches aus payable Ledger-Eintraegen. Es werden keine echten Auszahlungen ausgefuehrt."
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Provider / Methode</th>
                    <th className="px-3 py-2">Total</th>
                    <th className="px-3 py-2">Batch ID</th>
                    <th className="px-3 py-2">Zeitpunkte</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutBatches.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3">
                        <StatusBadge value={row.status} />
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>{row.payout_provider}</div>
                        <div>{row.payout_method}</div>
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-900">
                        {formatMoney(row.total_amount_cents, row.currency)}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">{shortenId(row.id)}</td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>created: {formatDateTime(row.created_at)}</div>
                        <div>scheduled: {formatDateTime(row.scheduled_for)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Payout Items"
            description="Interne Batch-Positionen im Simulationsmodus, jeweils referenziert auf einen Ledger-Eintrag."
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Betrag</th>
                    <th className="px-3 py-2">Batch / Ledger</th>
                    <th className="px-3 py-2">Profil</th>
                    <th className="px-3 py-2">Erstellt</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutItems.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3">
                        <StatusBadge value={row.status} />
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-900">
                        {formatMoney(row.amount_cents, row.currency)}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>batch: {shortenId(row.payout_batch_id)}</div>
                        <div>ledger: {shortenId(row.ledger_entry_id)}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">{shortenId(row.provider_payout_profile_id)}</td>
                      <td className="px-3 py-3 text-xs text-slate-600">{formatDateTime(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Refund Records" description="Letzte Refund-Spiegelungen mit Bezug zur Payment-Transaction.">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Betrag</th>
                    <th className="px-3 py-2">Refund IDs</th>
                    <th className="px-3 py-2">Referenz</th>
                    <th className="px-3 py-2">Zeitpunkte</th>
                  </tr>
                </thead>
                <tbody>
                  {refundRecords.map((row) => {
                    const relatedTransaction = relatedTransactions.get(row.payment_transaction_id);

                    return (
                      <tr key={row.id} className="border-b border-slate-100 align-top">
                        <td className="px-3 py-3">
                          <StatusBadge value={row.status} />
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-900">{formatMoney(row.amount_cents, "EUR")}</td>
                        <td className="px-3 py-3 text-xs text-slate-600">
                          <div>refund: {shortenId(row.provider_refund_id)}</div>
                          <div>record: {shortenId(row.id)}</div>
                          <div>reason: {row.reason ?? "-"}</div>
                        </td>
                        <td className="px-3 py-3">
                          <ReferenceCell
                            bookingId={relatedTransaction?.booking_id}
                            courseRegistrationIntentId={relatedTransaction?.course_registration_intent_id}
                          />
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600">
                          <div>created: {formatDateTime(row.created_at)}</div>
                          <div>updated: {formatDateTime(row.updated_at)}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Provider Webhook Events"
            description="Letzte Stripe-Webhook-Ereignisse ohne Payload-Anzeige, nur fuer Audit und Statuskontrolle."
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Event Type</th>
                    <th className="px-3 py-2">Provider Event ID</th>
                    <th className="px-3 py-2">Erstellt</th>
                  </tr>
                </thead>
                <tbody>
                  {webhookEvents.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3">
                        <div className="space-y-2">
                          <StatusBadge value={row.processing_status} />
                          <div className="text-xs text-slate-500">{row.provider}</div>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-900">{row.event_type}</td>
                      <td className="px-3 py-3 text-xs text-slate-600">{shortenId(row.provider_event_id)}</td>
                      <td className="px-3 py-3 text-xs text-slate-600">{formatDateTime(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      </div>
    </main>
  );
}

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { canRunPaymentsV2Simulation } from "@/lib/payments/simulation";
import DashboardBackLink from "@/app/dashboard/_components/DashboardBackLink";
import {
  simulateSubscriptionCancelAction,
  simulateSubscriptionInitialPaymentSuccessAction,
  simulateSubscriptionPauseAction,
  simulateSubscriptionRecurringPaymentAction,
} from "./actions";
import { requirePaymentsV2AdminAccess } from "../access";
import {
  AuditNav,
  PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH,
  Section,
  StatusBadge,
  formatDate,
  formatDateTime,
  formatMoney,
  shortenId,
} from "../ui";

export const dynamic = "force-dynamic";

const ROW_LIMIT = 20;

type SubscriptionContractRow = {
  id: string;
  course_registration_intent_id: string | null;
  course_id: string;
  teacher_id: string;
  provider: string;
  provider_subscription_id: string | null;
  status: string;
  base_amount_cents: number;
  currency: string;
  billing_anchor_day: number;
  next_charge_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  cancel_effective_date: string | null;
  created_at: string;
  updated_at: string;
};

type SubscriptionPeriodRow = {
  id: string;
  subscription_contract_id: string;
  period_start: string;
  period_end: string;
  service_month: string;
  status: string;
  planned_charge_at: string | null;
  charged_at: string | null;
  pause_mode: string | null;
  created_at: string;
};

type SubscriptionChargeRow = {
  id: string;
  subscription_contract_id: string;
  subscription_period_id: string | null;
  payment_transaction_id: string | null;
  provider: string;
  provider_charge_id: string | null;
  provider_invoice_id: string | null;
  provider_payment_reference: string | null;
  charge_type: string;
  gross_amount_cents: number;
  currency: string;
  status: string;
  charged_at: string | null;
  created_at: string;
};

type SubscriptionPauseWindowRow = {
  id: string;
  subscription_contract_id: string | null;
  scope_type: string;
  scope_id: string;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
};

type SubscriptionCreditRow = {
  id: string;
  subscription_contract_id: string;
  origin_type: string;
  origin_id: string | null;
  amount_cents: number;
  remaining_amount_cents: number;
  currency: string;
  status: string;
  created_at: string;
};

type SubscriptionEventRow = {
  id: string;
  subscription_contract_id: string | null;
  subscription_period_id: string | null;
  subscription_charge_id: string | null;
  event_type: string;
  event_source: string;
  created_at: string;
};

type SearchParams = {
  action?: string;
};

function ActionNotice({ action }: { action: string | undefined }) {
  if (!action) return null;

  let message = "Interne Simulation ausgefuehrt.";
  let toneClass = "border-slate-200 bg-slate-100 text-slate-700";

  if (action.startsWith("initial-pay-ok-")) {
    message = "Kurs-Erstzahlung intern simuliert. Keine echte Zahlung, keine echte Auszahlung, keine Kund*innenmail.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
  } else if (action.startsWith("initial-pay-error-")) {
    const code = action.slice("initial-pay-error-".length);
    message = `Fehler bei der Kurs-Erstzahlungs-Simulation: ${code}.`;
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
  } else if (action.startsWith("recurring-pay-ok-")) {
    message = "Monatszahlung intern simuliert. Keine echte Zahlung, keine echte Auszahlung, keine Kund*innenmail.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
  } else if (action.startsWith("recurring-pay-skipped-pause-")) {
    message = "Monatszahlung wurde wegen voller Pause des Zielmonats intern uebersprungen.";
    toneClass = "border-amber-200 bg-amber-50 text-amber-800";
  } else if (action.startsWith("recurring-pay-skipped-contract_ended-")) {
    message = "Monatszahlung wurde intern uebersprungen, weil der Vertrag vor dem Zielmonat beendet ist.";
    toneClass = "border-amber-200 bg-amber-50 text-amber-800";
  } else if (action.startsWith("recurring-pay-error-")) {
    const code = action.slice("recurring-pay-error-".length);
    message = `Fehler bei der Monatszahlungs-Simulation: ${code}.`;
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
  } else if (action.startsWith("lifecycle-pause-ok-")) {
    message = "Pause intern simuliert. Keine echten Zahlungen, keine echte Auszahlung, keine Kund*innenmail.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
  } else if (action.startsWith("lifecycle-pause-error-")) {
    const code = action.slice("lifecycle-pause-error-".length);
    message = `Fehler bei der Pause-Simulation: ${code}.`;
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
  } else if (action.startsWith("lifecycle-cancel-ok-")) {
    message = "Kündigung intern simuliert. Keine echten Zahlungen, keine echte Auszahlung, keine Kund*innenmail.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
  } else if (action.startsWith("lifecycle-cancel-error-")) {
    const code = action.slice("lifecycle-cancel-error-".length);
    message = `Fehler bei der Kündigungs-Simulation: ${code}.`;
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
  }

  return <div className={`rounded-2xl border px-4 py-3 text-sm ${toneClass}`}>{message}</div>;
}

function SimulationForm() {
  return (
    <form action={simulateSubscriptionInitialPaymentSuccessAction} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="space-y-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Kurs-Erstzahlung simulieren</div>
          <div className="mt-1 text-xs text-slate-700">
            Erzeugt oder aktiviert Contract, erste Periode, erste Charge, interne paid Payment-Transaction, Ledger-Eintrag und Admin-Events.
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">course_registration_intent_id</span>
          <input
            name="courseRegistrationIntentId"
            type="text"
            placeholder="uuid"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Betrag in Cent optional</span>
          <input
            name="amountCents"
            type="text"
            placeholder="z. B. 7900"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Waehrung optional</span>
          <input
            name="currency"
            type="text"
            placeholder="EUR"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">paid_at optional</span>
          <input
            name="paidAt"
            type="text"
            placeholder="2026-05-16T12:00:00.000Z"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Scenario Note optional</span>
          <input
            name="scenarioNote"
            type="text"
            placeholder="Kurznotiz"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
          />
        </label>
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

function RecurringSimulationForm() {
  return (
    <form action={simulateSubscriptionRecurringPaymentAction} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="space-y-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Monatszahlung simulieren</div>
          <div className="mt-1 text-xs text-slate-700">
            Erzeugt genau eine Monatsperiode, eine monthly_recurring-Charge, eine interne paid Payment-Transaction, einen Ledger-Eintrag oder ueberspringt sauber bei voller Pause bzw. beendetem Vertrag.
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">subscription_contract_id</span>
          <input
            name="subscriptionContractId"
            type="text"
            placeholder="uuid"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">target_month optional</span>
          <input
            name="targetMonth"
            type="text"
            placeholder="YYYY-MM"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Betrag in Cent optional</span>
          <input
            name="amountCents"
            type="text"
            placeholder="z. B. 7900"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Waehrung optional</span>
          <input
            name="currency"
            type="text"
            placeholder="EUR"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">paid_at optional</span>
          <input
            name="paidAt"
            type="text"
            placeholder="2026-06-01T09:00:00.000Z"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Scenario Note optional</span>
          <input
            name="scenarioNote"
            type="text"
            placeholder="Kurznotiz"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
          />
        </label>
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

function LifecyclePauseForm() {
  return (
    <form action={simulateSubscriptionPauseAction} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="space-y-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Pause simulieren</div>
          <div className="mt-1 text-xs text-slate-700">
            Legt ein contract-scope Pause Window an oder wiederverwendet es, setzt den Contract auf `pause_scheduled` oder `paused` und pausiert betroffene offene Perioden.
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">subscription_contract_id</span>
          <input
            name="subscriptionContractId"
            type="text"
            placeholder="uuid"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Pause Startdatum</span>
          <input
            name="pauseStartDate"
            type="text"
            placeholder="YYYY-MM-01"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Pause Enddatum</span>
          <input
            name="pauseEndDate"
            type="text"
            placeholder="YYYY-MM-31"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Scenario Note optional</span>
          <input
            name="scenarioNote"
            type="text"
            placeholder="Kurznotiz"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
          />
        </label>
        <button
          type="submit"
          className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Pause simulieren
        </button>
      </div>
    </form>
  );
}

function LifecycleCancelForm() {
  return (
    <form action={simulateSubscriptionCancelAction} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="space-y-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Kündigung simulieren</div>
          <div className="mt-1 text-xs text-slate-700">
            Setzt den Contract auf `cancel_scheduled` oder `cancelled` und storniert zukünftige offene Perioden und Charges nach dem Enddatum.
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">subscription_contract_id</span>
          <input
            name="subscriptionContractId"
            type="text"
            placeholder="uuid"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Kündigungs-/Enddatum</span>
          <input
            name="cancelEffectiveDate"
            type="text"
            placeholder="YYYY-MM-31"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Scenario Note optional</span>
          <input
            name="scenarioNote"
            type="text"
            placeholder="Kurznotiz"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
          />
        </label>
        <button
          type="submit"
          className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Kündigung simulieren
        </button>
      </div>
    </form>
  );
}

export default async function SubscriptionAuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const user = await requirePaymentsV2AdminAccess();
  const canUseSimulation = canRunPaymentsV2Simulation(user.email);

  const admin = createSupabaseAdmin();
  const [contractsResult, periodsResult, chargesResult, pauseWindowsResult, creditsResult, eventsResult] =
    await Promise.all([
      admin
        .from("subscription_contracts")
        .select(
          "id,course_registration_intent_id,course_id,teacher_id,provider,provider_subscription_id,status,base_amount_cents,currency,billing_anchor_day,next_charge_at,started_at,ended_at,cancel_effective_date,created_at,updated_at"
        )
        .order("created_at", { ascending: false })
        .limit(ROW_LIMIT)
        .returns<SubscriptionContractRow[]>(),
      admin
        .from("subscription_periods")
        .select(
          "id,subscription_contract_id,period_start,period_end,service_month,status,planned_charge_at,charged_at,pause_mode,created_at"
        )
        .order("created_at", { ascending: false })
        .limit(ROW_LIMIT)
        .returns<SubscriptionPeriodRow[]>(),
      admin
        .from("subscription_charges")
        .select(
          "id,subscription_contract_id,subscription_period_id,payment_transaction_id,provider,provider_charge_id,provider_invoice_id,provider_payment_reference,charge_type,gross_amount_cents,currency,status,charged_at,created_at"
        )
        .order("created_at", { ascending: false })
        .limit(ROW_LIMIT)
        .returns<SubscriptionChargeRow[]>(),
      admin
        .from("subscription_pause_windows")
        .select("id,subscription_contract_id,scope_type,scope_id,start_date,end_date,status,created_at")
        .order("created_at", { ascending: false })
        .limit(ROW_LIMIT)
        .returns<SubscriptionPauseWindowRow[]>(),
      admin
        .from("subscription_credits")
        .select(
          "id,subscription_contract_id,origin_type,origin_id,amount_cents,remaining_amount_cents,currency,status,created_at"
        )
        .order("created_at", { ascending: false })
        .limit(ROW_LIMIT)
        .returns<SubscriptionCreditRow[]>(),
      admin
        .from("subscription_events")
        .select(
          "id,subscription_contract_id,subscription_period_id,subscription_charge_id,event_type,event_source,created_at"
        )
        .order("created_at", { ascending: false })
        .limit(ROW_LIMIT)
        .returns<SubscriptionEventRow[]>(),
    ]);

  const contracts = contractsResult.data ?? [];
  const periods = periodsResult.data ?? [];
  const charges = chargesResult.data ?? [];
  const pauseWindows = pauseWindowsResult.data ?? [];
  const credits = creditsResult.data ?? [];
  const events = eventsResult.data ?? [];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <DashboardBackLink />
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-sky-700">Internal Audit</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Subscription Audit</h1>
          <p className="mt-2 max-w-4xl text-sm text-slate-600">
            Read-only Kontrollansicht fuer die interne Payment-V2-Subscription-Domain. Angezeigt werden nur gekuerzte
            technische Referenzen, Status, Zeitpunkte und Betraege. Keine Kund*innendaten, keine Bankdaten und keine
            vollstaendigen Payloads.
          </p>
          <div className="mt-4">
            <AuditNav currentPath={PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH} />
          </div>
          <div className="mt-4 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
            Read only
          </div>
        </header>

        <ActionNotice action={sp.action} />

        <Section
          title="Interne Kurs-Simulation"
          description="Admin-only Einzelaktion fuer eine erfolgreiche Erstzahlung eines laufenden Angebots. Kein Stripe, kein Mollie, kein PayPal, keine echte Auszahlung."
        >
          {canUseSimulation ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-300 bg-amber-100 px-4 py-3 text-sm text-amber-950">
                Simulation only. Keine echte Zahlung, keine echte Auszahlung, keine Kund*innenmail.
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <SimulationForm />
                <RecurringSimulationForm />
              </div>
              <div className="rounded-2xl border border-amber-300 bg-amber-100 px-4 py-3 text-sm text-amber-950">
                Kurs-Lifecycle simulieren. Keine echten Zahlungen, keine echte Auszahlung, keine Kund*innenmail.
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <LifecyclePauseForm />
                <LifecycleCancelForm />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700">
              Kurs-Simulation ist derzeit deaktiviert. Erforderlich sind `PAYMENTS_V2_SIMULATION_ENABLED` und eine
              freigeschaltete Admin-Mail in `PAYMENTS_V2_ADMIN_EMAILS`.
            </div>
          )}
        </Section>

        <div className="grid gap-6">
          <Section
            title="Subscription Contracts"
            description="Letzte interne Vertragsdatensaetze ohne Kund*innen- und ohne Provider-Kontodaten."
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Betrag</th>
                    <th className="px-3 py-2">Vertrag</th>
                    <th className="px-3 py-2">Provider</th>
                    <th className="px-3 py-2">Zeitpunkte</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3">
                        <div className="space-y-2">
                          <StatusBadge value={row.status} />
                          <div className="text-xs text-slate-500">anchor day: {row.billing_anchor_day}</div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-700">
                        <div className="font-medium text-slate-900">{formatMoney(row.base_amount_cents, row.currency)}</div>
                        <div>{row.currency}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>contract: {shortenId(row.id)}</div>
                        <div>course: {shortenId(row.course_id)}</div>
                        <div>teacher: {shortenId(row.teacher_id)}</div>
                        <div>intent: {shortenId(row.course_registration_intent_id)}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>{row.provider}</div>
                        <div>subscription: {shortenId(row.provider_subscription_id)}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>created: {formatDateTime(row.created_at)}</div>
                        <div>updated: {formatDateTime(row.updated_at)}</div>
                        <div>started: {formatDateTime(row.started_at)}</div>
                        <div>next charge: {formatDateTime(row.next_charge_at)}</div>
                        <div>cancel effective: {formatDate(row.cancel_effective_date)}</div>
                        <div>ended: {formatDateTime(row.ended_at)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Subscription Periods"
            description="Letzte interne Monatsperioden mit Leistungsmonat, Zeitraum und geplantem Ladezustand."
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Zeitraum</th>
                    <th className="px-3 py-2">Service-Monat</th>
                    <th className="px-3 py-2">Referenzen</th>
                    <th className="px-3 py-2">Zeitpunkte</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3">
                        <div className="space-y-2">
                          <StatusBadge value={row.status} />
                          <div className="text-xs text-slate-500">pause: {row.pause_mode ?? "-"}</div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>von: {formatDate(row.period_start)}</div>
                        <div>bis: {formatDate(row.period_end)}</div>
                      </td>
                      <td className="px-3 py-3 text-xs font-medium text-slate-900">{formatDate(row.service_month)}</td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>period: {shortenId(row.id)}</div>
                        <div>contract: {shortenId(row.subscription_contract_id)}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>created: {formatDateTime(row.created_at)}</div>
                        <div>planned charge: {formatDateTime(row.planned_charge_at)}</div>
                        <div>charged: {formatDateTime(row.charged_at)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Subscription Charges"
            description="Letzte interne Sollstellungen und Zahlungsspiegelungen ohne Kund*innen- oder Vollreferenzdaten."
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Betrag</th>
                    <th className="px-3 py-2">Typ</th>
                    <th className="px-3 py-2">Referenzen</th>
                    <th className="px-3 py-2">Provider</th>
                    <th className="px-3 py-2">Zeitpunkte</th>
                  </tr>
                </thead>
                <tbody>
                  {charges.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3">
                        <StatusBadge value={row.status} />
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-900">
                        {formatMoney(row.gross_amount_cents, row.currency)}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>{row.charge_type}</div>
                        <div>{row.currency}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>charge: {shortenId(row.id)}</div>
                        <div>contract: {shortenId(row.subscription_contract_id)}</div>
                        <div>period: {shortenId(row.subscription_period_id)}</div>
                        <div>payment tx: {shortenId(row.payment_transaction_id)}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>{row.provider}</div>
                        <div>invoice: {shortenId(row.provider_invoice_id)}</div>
                        <div>charge: {shortenId(row.provider_charge_id)}</div>
                        <div>payment ref: {shortenId(row.provider_payment_reference)}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>created: {formatDateTime(row.created_at)}</div>
                        <div>charged: {formatDateTime(row.charged_at)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Subscription Pause Windows"
            description="Letzte interne Pausenfenster auf Kurs-, Teilnehmer- oder Vertragsebene."
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Scope</th>
                    <th className="px-3 py-2">Zeitraum</th>
                    <th className="px-3 py-2">Referenzen</th>
                    <th className="px-3 py-2">Erstellt</th>
                  </tr>
                </thead>
                <tbody>
                  {pauseWindows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3">
                        <StatusBadge value={row.status} />
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>{row.scope_type}</div>
                        <div>scope: {shortenId(row.scope_id)}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>von: {formatDate(row.start_date)}</div>
                        <div>bis: {formatDate(row.end_date)}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>pause: {shortenId(row.id)}</div>
                        <div>contract: {shortenId(row.subscription_contract_id)}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">{formatDateTime(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Subscription Credits"
            description="Letzte interne Credits und Restguthaben ohne Kund*innenbezug und ohne Auszahlungsdaten."
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Betrag</th>
                    <th className="px-3 py-2">Restguthaben</th>
                    <th className="px-3 py-2">Herkunft</th>
                    <th className="px-3 py-2">Referenzen</th>
                    <th className="px-3 py-2">Erstellt</th>
                  </tr>
                </thead>
                <tbody>
                  {credits.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3">
                        <StatusBadge value={row.status} />
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-900">{formatMoney(row.amount_cents, row.currency)}</td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        {formatMoney(row.remaining_amount_cents, row.currency)}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>{row.origin_type}</div>
                        <div>origin: {shortenId(row.origin_id)}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>credit: {shortenId(row.id)}</div>
                        <div>contract: {shortenId(row.subscription_contract_id)}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">{formatDateTime(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Subscription Events"
            description="Letzte interne Domain-Events ohne Payload-Anzeige, nur mit Event-Typ, Quelle und Referenzen."
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Event</th>
                    <th className="px-3 py-2">Quelle</th>
                    <th className="px-3 py-2">Referenzen</th>
                    <th className="px-3 py-2">Erstellt</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3">
                        <div className="space-y-2">
                          <StatusBadge value={row.event_type} />
                          <div className="text-xs text-slate-500">event: {shortenId(row.id)}</div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">{row.event_source}</td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        <div>contract: {shortenId(row.subscription_contract_id)}</div>
                        <div>period: {shortenId(row.subscription_period_id)}</div>
                        <div>charge: {shortenId(row.subscription_charge_id)}</div>
                      </td>
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

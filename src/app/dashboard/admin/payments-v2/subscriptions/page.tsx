import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { calculatePlatformFeeAmount, calculateProviderPayoutAmount } from "@/lib/platform-fees";
import { canRunPaymentsV2Simulation } from "@/lib/payments/simulation";
import DashboardBackLink from "@/app/dashboard/_components/DashboardBackLink";
import {
  simulateParticipantSubscriptionCancelAction,
  simulateParticipantSubscriptionPauseAction,
  simulateSubscriptionCancelAction,
  simulateSubscriptionInitialPaymentSuccessAction,
  simulateSubscriptionPauseAction,
  simulateSubscriptionPayoutAction,
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
  metadata: Record<string, unknown>;
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

type SimulationIntentRow = {
  id: string;
  course_id: string;
  first_name: string | null;
  last_name: string | null;
  is_simulation: boolean | null;
  subscription_status: string | null;
};

type SimulationCourseRow = {
  id: string;
  title: string | null;
};

type SimulationProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  provider_type: "independent_teacher" | "studio_provider" | null;
};

type PaymentTransactionRow = {
  id: string;
  course_registration_intent_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  paid_at: string | null;
  failed_at: string | null;
  created_at: string;
};

type LedgerEntryRow = {
  id: string;
  source_id: string;
  source_type: string;
  entry_type: string;
  gross_amount_cents: number;
  platform_fee_cents: number;
  net_amount_cents: number;
  currency: string;
  payout_status: string;
  available_at: string | null;
  payout_batch_id: string | null;
  created_at: string;
};

type PayoutItemRow = {
  id: string;
  payout_batch_id: string;
  ledger_entry_id: string;
  status: string;
  created_at: string;
};

type SearchParams = {
  action?: string;
  contractId?: string;
  courseRegistrationIntentId?: string;
  code?: string;
  errorMessage?: string;
  pauseWindowId?: string;
  eventId?: string;
  lifecycleStatus?: string;
  renewalBlocked?: string;
  periodId?: string;
  chargeId?: string;
  paymentTransactionId?: string;
  ledgerEntryId?: string;
  payoutBatchId?: string;
  selectedContractId?: string;
  step?: string;
  rawErrorName?: string;
  rawErrorMessage?: string;
  supabaseCode?: string;
  supabaseMessage?: string;
  actionVersion?: string;
  fullMonthAmountCents?: string;
  firstPaymentAmountCents?: string;
  contractStartDate?: string;
  firstPaymentExplanation?: string;
  billableDays?: string;
  daysInMonth?: string;
};

type SimulationContractOption = {
  id: string;
  label: string;
};

type SimulationParticipantOption = {
  id: string;
  label: string;
};

type BusinessSubscriptionRow = {
  contractId: string;
  courseRegistrationIntentId: string | null;
  periodId: string;
  month: string;
  courseTitle: string;
  participantName: string;
  providerName: string;
  contractStatus: string;
  subscriptionStatus: string | null;
  grossAmountCents: number;
  providerShareCents: number;
  reserFeeCents: number;
  currency: string;
  chargeId: string | null;
  chargeStatus: string | null;
  paymentTransactionId: string | null;
  paymentStatus: string | null;
  payoutLedgerEntryId: string | null;
  payoutStatus: string | null;
  payoutItemStatus: string | null;
  periodStatus: string;
  pauseMode: string | null;
};

type BusinessLifecycleRow = {
  id: string;
  courseTitle: string;
  participantLabel: string;
  periodLabel: string;
  typeLabel: string;
  statusLabel: string;
  statusKey: string;
};

function ActionNotice({
  action,
  contractId,
  courseRegistrationIntentId,
  code,
  errorMessage,
  pauseWindowId,
  eventId,
  lifecycleStatus,
  renewalBlocked,
  periodId,
  chargeId,
  paymentTransactionId,
  ledgerEntryId,
  payoutBatchId,
  step,
  rawErrorName,
  rawErrorMessage,
  supabaseCode,
  supabaseMessage,
  actionVersion,
  fullMonthAmountCents,
  firstPaymentAmountCents,
  contractStartDate,
  firstPaymentExplanation,
  billableDays,
  daysInMonth,
}: {
  action: string | undefined;
  contractId?: string | undefined;
  courseRegistrationIntentId?: string | undefined;
  code?: string | undefined;
  errorMessage?: string | undefined;
  pauseWindowId?: string | undefined;
  eventId?: string | undefined;
  lifecycleStatus?: string | undefined;
  renewalBlocked?: string | undefined;
  periodId?: string | undefined;
  chargeId?: string | undefined;
  paymentTransactionId?: string | undefined;
  ledgerEntryId?: string | undefined;
  payoutBatchId?: string | undefined;
  step?: string | undefined;
  rawErrorName?: string | undefined;
  rawErrorMessage?: string | undefined;
  supabaseCode?: string | undefined;
  supabaseMessage?: string | undefined;
  actionVersion?: string | undefined;
  fullMonthAmountCents?: string | undefined;
  firstPaymentAmountCents?: string | undefined;
  contractStartDate?: string | undefined;
  firstPaymentExplanation?: string | undefined;
  billableDays?: string | undefined;
  daysInMonth?: string | undefined;
}) {
  if (!action) return null;

  let message = "Interne Simulation ausgefuehrt.";
  let toneClass = "border-slate-200 bg-slate-100 text-slate-700";
  let details = null;

  if (action.startsWith("initial-pay-ok-")) {
    message = "Kurs-Erstzahlung intern simuliert. Keine echte Zahlung, keine echte Auszahlung, keine Kund*innenmail.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
    details = (
      <div className="mt-2 text-xs">
        <div>course_registration_intent_id: {courseRegistrationIntentId ?? "-"}</div>
        <div>contract_id: {contractId ?? "-"}</div>
        <div>Monatsbetrag: {fullMonthAmountCents ? formatMoney(Number(fullMonthAmountCents), "EUR") : "-"}</div>
        <div>Startdatum: {contractStartDate ? formatDate(contractStartDate) : "-"}</div>
        <div>Erstzahlung: {firstPaymentAmountCents ? formatMoney(Number(firstPaymentAmountCents), "EUR") : "-"}</div>
        <div>Abrechnungstage: {billableDays ?? "-"} / {daysInMonth ?? "-"}</div>
        <div>Hinweis: {firstPaymentExplanation ?? "-"}</div>
      </div>
    );
  } else if (action.startsWith("initial-pay-error-")) {
    const actionCode = action.slice("initial-pay-error-".length);
    message = `Fehler bei der Kurs-Erstzahlungs-Simulation: ${code ?? actionCode}.`;
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
    details = (
      <div className="mt-2 text-xs">
        <div>step: {step ?? "-"}</div>
        <div>raw_error_name: {rawErrorName ?? "-"}</div>
        <div>raw_error_message: {rawErrorMessage ?? "-"}</div>
        <div>supabase_code: {supabaseCode ?? "-"}</div>
        <div>supabase_message: {supabaseMessage ?? "-"}</div>
        <div>action_version: {actionVersion ?? "-"}</div>
      </div>
    );
  } else if (action.startsWith("recurring-pay-ok-")) {
    message = "Monatszahlung intern simuliert. Keine echte Zahlung, keine echte Auszahlung, keine Kund*innenmail.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
    details = (
      <div className="mt-2 text-xs">
        <div>contract_id: {contractId ?? "-"}</div>
        <div>period_id: {periodId ?? "-"}</div>
        <div>charge_id: {chargeId ?? "-"}</div>
        <div>payment_transaction_id: {paymentTransactionId ?? "-"}</div>
        <div>ledger_entry_id: {ledgerEntryId ?? "-"}</div>
      </div>
    );
  } else if (action.startsWith("recurring-pay-skipped-pause-")) {
    message = "Monatszahlung wurde wegen voller Pause des Zielmonats intern uebersprungen.";
    toneClass = "border-amber-200 bg-amber-50 text-amber-800";
    details = <div className="mt-2 text-xs">contract_id: {contractId ?? "-"}</div>;
  } else if (action.startsWith("recurring-pay-skipped-contract_ended-")) {
    message = "Monatszahlung wurde intern uebersprungen, weil der Vertrag vor dem Zielmonat beendet ist.";
    toneClass = "border-amber-200 bg-amber-50 text-amber-800";
    details = <div className="mt-2 text-xs">contract_id: {contractId ?? "-"}</div>;
  } else if (action.startsWith("recurring-pay-skipped-participant_pause-")) {
    message = "Monatszahlung wurde wegen einer aktiven Teilnehmer*innen-Pause des Zielmonats intern uebersprungen.";
    toneClass = "border-amber-200 bg-amber-50 text-amber-800";
    details = (
      <div className="mt-2 text-xs">
        <div>contract_id: {contractId ?? "-"}</div>
        <div>course_registration_intent_id: {courseRegistrationIntentId ?? "-"}</div>
      </div>
    );
  } else if (action.startsWith("recurring-pay-skipped-participant_ended-")) {
    message = "Monatszahlung wurde intern uebersprungen, weil die Teilnehmer*innen-Teilnahme vor dem Zielmonat beendet ist.";
    toneClass = "border-amber-200 bg-amber-50 text-amber-800";
    details = (
      <div className="mt-2 text-xs">
        <div>contract_id: {contractId ?? "-"}</div>
        <div>course_registration_intent_id: {courseRegistrationIntentId ?? "-"}</div>
      </div>
    );
  } else if (action.startsWith("recurring-pay-error-")) {
    const code = action.slice("recurring-pay-error-".length);
    message = `Fehler bei der Monatszahlungs-Simulation: ${code}.`;
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
  } else if (action.startsWith("lifecycle-pause-ok-")) {
    message = "Pause intern simuliert. Keine echten Zahlungen, keine echte Auszahlung, keine Kund*innenmail.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
    details = (
      <div className="mt-2 text-xs">
        <div>contract_id: {contractId ?? "-"}</div>
        <div>pause_window_id: {pauseWindowId ?? "-"}</div>
        <div>event_id: {eventId ?? "-"}</div>
        <div>neuer Status: {lifecycleStatus ?? "-"}</div>
        <div>naechstes Renewal blockiert: {renewalBlocked === "yes" ? "ja" : renewalBlocked === "no" ? "nein" : "-"}</div>
      </div>
    );
  } else if (action.startsWith("lifecycle-pause-error-")) {
    const actionCode = action.slice("lifecycle-pause-error-".length);
    message = `Fehler bei der Pause-Simulation: ${code ?? actionCode}.`;
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
    details = (
      <div className="mt-2 text-xs">
        <div>step: {step ?? "-"}</div>
        <div>raw_error_name: {rawErrorName ?? "-"}</div>
        <div>raw_error_message: {rawErrorMessage ?? "-"}</div>
        <div>supabase_code: {supabaseCode ?? "-"}</div>
        <div>supabase_message: {supabaseMessage ?? "-"}</div>
        <div>action_version: {actionVersion ?? "-"}</div>
      </div>
    );
  } else if (action.startsWith("lifecycle-cancel-ok-")) {
    message = "Kündigung intern simuliert. Keine echten Zahlungen, keine echte Auszahlung, keine Kund*innenmail.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
    details = (
      <div className="mt-2 text-xs">
        <div>contract_id: {contractId ?? "-"}</div>
        <div>event_id: {eventId ?? "-"}</div>
        <div>neuer Status: {lifecycleStatus ?? "-"}</div>
        <div>naechstes Renewal blockiert: {renewalBlocked === "yes" ? "ja" : renewalBlocked === "no" ? "nein" : "-"}</div>
      </div>
    );
  } else if (action.startsWith("lifecycle-cancel-error-")) {
    const code = action.slice("lifecycle-cancel-error-".length);
    message = `Fehler bei der Kündigungs-Simulation: ${code}.`;
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
    details = (
      <div className="mt-2 text-xs">
        <div>step: {step ?? "-"}</div>
        <div>raw_error_name: {rawErrorName ?? "-"}</div>
        <div>raw_error_message: {rawErrorMessage ?? "-"}</div>
        <div>supabase_code: {supabaseCode ?? "-"}</div>
        <div>supabase_message: {supabaseMessage ?? "-"}</div>
        <div>action_version: {actionVersion ?? "-"}</div>
      </div>
    );
  } else if (action.startsWith("participant-lifecycle-pause-ok-")) {
    message =
      "Teilnehmer*innen-Pause intern simuliert. Keine echten Zahlungen, keine echte Auszahlung, keine Kund*innenmail.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
    details = (
      <div className="mt-2 text-xs">
        <div>course_registration_intent_id: {courseRegistrationIntentId ?? "-"}</div>
        <div>contract_id: {contractId ?? "-"}</div>
        <div>pause_window_id: {pauseWindowId ?? "-"}</div>
        <div>event_id: {eventId ?? "-"}</div>
        <div>neuer Status: {lifecycleStatus ?? "-"}</div>
        <div>naechstes Renewal blockiert: {renewalBlocked === "yes" ? "ja" : renewalBlocked === "no" ? "nein" : "-"}</div>
      </div>
    );
  } else if (action.startsWith("participant-lifecycle-pause-error-")) {
    const code = action.slice("participant-lifecycle-pause-error-".length);
    message = `Fehler bei der Teilnehmer*innen-Pause-Simulation: ${code}.`;
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
    details = (
      <div className="mt-2 text-xs">
        <div>step: {step ?? "-"}</div>
        <div>raw_error_name: {rawErrorName ?? "-"}</div>
        <div>raw_error_message: {rawErrorMessage ?? "-"}</div>
        <div>supabase_code: {supabaseCode ?? "-"}</div>
        <div>supabase_message: {supabaseMessage ?? "-"}</div>
        <div>action_version: {actionVersion ?? "-"}</div>
      </div>
    );
  } else if (action.startsWith("participant-lifecycle-cancel-ok-")) {
    message =
      "Teilnehmer*innen-Kuendigung intern simuliert. Keine echten Zahlungen, keine echte Auszahlung, keine Kund*innenmail.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
    details = (
      <div className="mt-2 text-xs">
        <div>course_registration_intent_id: {courseRegistrationIntentId ?? "-"}</div>
        <div>contract_id: {contractId ?? "-"}</div>
        <div>event_id: {eventId ?? "-"}</div>
        <div>neuer Status: {lifecycleStatus ?? "-"}</div>
        <div>naechstes Renewal blockiert: {renewalBlocked === "yes" ? "ja" : renewalBlocked === "no" ? "nein" : "-"}</div>
      </div>
    );
  } else if (action.startsWith("participant-lifecycle-cancel-error-")) {
    const code = action.slice("participant-lifecycle-cancel-error-".length);
    message = `Fehler bei der Teilnehmer*innen-Kuendigungs-Simulation: ${code}.`;
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
    details = (
      <div className="mt-2 text-xs">
        <div>step: {step ?? "-"}</div>
        <div>raw_error_name: {rawErrorName ?? "-"}</div>
        <div>raw_error_message: {rawErrorMessage ?? "-"}</div>
        <div>supabase_code: {supabaseCode ?? "-"}</div>
        <div>supabase_message: {supabaseMessage ?? "-"}</div>
        <div>action_version: {actionVersion ?? "-"}</div>
      </div>
    );
  } else if (action.startsWith("subscription-payout-ok-")) {
    message = "Simulierte Auszahlung fuer laufendes Angebot abgeschlossen. Keine echte Auszahlung, kein Provider-Call.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
    details = (
      <div className="mt-2 text-xs">
        <div>course_registration_intent_id: {courseRegistrationIntentId ?? "-"}</div>
        <div>contract_id: {contractId ?? "-"}</div>
        <div>ledger_entry_id: {ledgerEntryId ?? "-"}</div>
        <div>payout_batch_id: {payoutBatchId ?? "-"}</div>
      </div>
    );
  } else if (action.startsWith("subscription-payout-error-")) {
    message = "Simulierte Auszahlung fuer laufendes Angebot konnte nicht abgeschlossen werden.";
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
    details = (
      <div className="mt-2 text-xs">
        <div>contract_id: {contractId ?? "-"}</div>
        <div>detail: {errorMessage ?? "-"}</div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${toneClass}`}>
      <div>{message}</div>
      {details}
    </div>
  );
}

function displayName(input: {
  firstName?: string | null;
  lastName?: string | null;
  organizationName?: string | null;
  fallback: string;
}) {
  const organizationName = input.organizationName?.trim();
  if (organizationName) return organizationName;

  const fullName = [input.firstName?.trim(), input.lastName?.trim()].filter(Boolean).join(" ").trim();
  return fullName || input.fallback;
}

function businessTone(statusKey: string) {
  switch (statusKey) {
    case "bezahlt":
    case "auszahlbar":
    case "ausbezahlt":
    case "verdient":
      return "bg-green-100 text-green-800";
    case "pausiert":
      return "bg-amber-100 text-amber-900";
    case "beendet":
    case "fehlgeschlagen":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function BusinessBadge({ label, statusKey }: { label: string; statusKey: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${businessTone(statusKey)}`}>{label}</span>
  );
}

function mapCustomerPaymentBusinessStatus(input: {
  periodStatus: string;
  pauseMode: string | null;
  chargeStatus: string | null;
  paymentStatus: string | null;
  contractStatus: string;
  subscriptionStatus: string | null;
}) {
  if (input.paymentStatus === "failed" || input.chargeStatus === "failed") {
    return { key: "fehlgeschlagen", label: "Fehlgeschlagen" };
  }

  if (input.paymentStatus === "paid") {
    return { key: "bezahlt", label: "Bezahlt" };
  }

  if (
    input.periodStatus === "paused" ||
    input.pauseMode ||
    (!input.chargeStatus && ["paused", "pause_scheduled"].includes(input.subscriptionStatus ?? ""))
  ) {
    return { key: "pausiert", label: "Pausiert" };
  }

  if (
    input.periodStatus === "cancelled" ||
    (!input.chargeStatus &&
      (["cancelled", "ended"].includes(input.contractStatus) ||
        ["cancelled", "inactive"].includes(input.subscriptionStatus ?? "")))
  ) {
    return { key: "beendet", label: "Beendet" };
  }

  return { key: "vorgemerkt", label: "Vorgemerkt" };
}

function mapPayoutBusinessStatus(input: {
  payoutStatus: string | null;
  payoutItemStatus: string | null;
  paymentStatusKey: string;
}) {
  if (input.paymentStatusKey === "pausiert") {
    return { key: "pausiert", label: "Pausiert" };
  }

  if (input.paymentStatusKey === "beendet") {
    return { key: "beendet", label: "Beendet" };
  }

  if (input.payoutItemStatus === "paid" || input.payoutStatus === "paid") {
    return { key: "ausbezahlt", label: "Ausbezahlt" };
  }

  if (input.payoutStatus === "payable" || input.payoutStatus === "available" || input.payoutStatus === "batched") {
    return { key: "auszahlbar", label: "Auszahlbar" };
  }

  return { key: "vorgemerkt", label: "Vorgemerkt" };
}

function mapReserBusinessStatus(input: {
  payoutStatus: string | null;
  paymentStatusKey: string;
}) {
  if (input.paymentStatusKey === "pausiert") {
    return { key: "pausiert", label: "Pausiert" };
  }

  if (input.paymentStatusKey === "beendet") {
    return { key: "beendet", label: "Beendet" };
  }

  if (input.payoutStatus === "pending" || input.payoutStatus === "pending_event_completion" || !input.payoutStatus) {
    return { key: "vorgemerkt", label: "Vorgemerkt" };
  }

  return { key: "verdient", label: "Verdient" };
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

function SimulationContractSelect({
  options,
  inputName,
  label,
}: {
  options: SimulationContractOption[];
  inputName: string;
  label: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">{label}</span>
      <select
        name={inputName}
        defaultValue=""
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0"
      >
        <option value="" disabled>
          Bitte Simulations-Contract auswaehlen
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SimulationParticipantSelect({
  options,
  inputName,
  label,
}: {
  options: SimulationParticipantOption[];
  inputName: string;
  label: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">{label}</span>
      <select
        name={inputName}
        defaultValue=""
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0"
      >
        <option value="" disabled>
          Bitte Simulations-Teilnehmer*in auswaehlen
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function RecurringSimulationForm({ contractOptions }: { contractOptions: SimulationContractOption[] }) {
  return (
    <form action={simulateSubscriptionRecurringPaymentAction} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="space-y-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Monatszahlung simulieren</div>
          <div className="mt-1 text-xs text-slate-700">
            Erzeugt genau eine Monatsperiode, eine monthly_recurring-Charge, eine interne paid Payment-Transaction, einen Ledger-Eintrag oder ueberspringt sauber bei voller Pause bzw. beendetem Vertrag.
          </div>
        </div>
        <SimulationContractSelect
          options={contractOptions}
          inputName="subscriptionContractId"
          label="subscription_contract_id"
        />
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

function LifecyclePauseForm({ contractOptions }: { contractOptions: SimulationContractOption[] }) {
  return (
    <form action={simulateSubscriptionPauseAction} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="space-y-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Pause simulieren</div>
          <div className="mt-1 text-xs text-slate-700">
            Legt ein contract-scope Pause Window an oder wiederverwendet es, setzt den Contract auf `pause_scheduled` oder `paused` und pausiert betroffene offene Perioden.
          </div>
        </div>
        <SimulationContractSelect
          options={contractOptions}
          inputName="subscriptionContractId"
          label="subscription_contract_id"
        />
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
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Grund optional</span>
          <input
            name="reason"
            type="text"
            placeholder="z. B. Sommerpause"
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

function LifecycleCancelForm({ contractOptions }: { contractOptions: SimulationContractOption[] }) {
  return (
    <form action={simulateSubscriptionCancelAction} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="space-y-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Kündigung simulieren</div>
          <div className="mt-1 text-xs text-slate-700">
            Setzt den Contract auf `cancel_scheduled` oder `cancelled` und storniert zukünftige offene Perioden und Charges nach dem Enddatum.
          </div>
        </div>
        <SimulationContractSelect
          options={contractOptions}
          inputName="subscriptionContractId"
          label="subscription_contract_id"
        />
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
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Grund optional</span>
          <input
            name="reason"
            type="text"
            placeholder="z. B. Kuendigung zum Monatsende"
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

function ParticipantLifecyclePauseForm({ participantOptions }: { participantOptions: SimulationParticipantOption[] }) {
  return (
    <form
      action={simulateParticipantSubscriptionPauseAction}
      className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm"
    >
      <div className="space-y-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Teilnehmer*innen-Pause simulieren</div>
          <div className="mt-1 text-xs text-slate-700">
            Legt ein participant-scope Pause Window an, aktualisiert nur den simulierten Intent und laesst den Contract
            fuer andere Teilnehmer*innen unberuehrt.
          </div>
        </div>
        <SimulationParticipantSelect
          options={participantOptions}
          inputName="courseRegistrationIntentId"
          label="course_registration_intent_id"
        />
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
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Grund optional</span>
          <input
            name="reason"
            type="text"
            placeholder="z. B. Urlaub eines Kindes"
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
          Teilnehmer*innen-Pause simulieren
        </button>
      </div>
    </form>
  );
}

function ParticipantLifecycleCancelForm({ participantOptions }: { participantOptions: SimulationParticipantOption[] }) {
  return (
    <form
      action={simulateParticipantSubscriptionCancelAction}
      className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm"
    >
      <div className="space-y-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Teilnehmer*innen-Kuendigung simulieren</div>
          <div className="mt-1 text-xs text-slate-700">
            Beendet nur die simulierte Teilnahme zum Monatsende. Der Contract bleibt fuer andere Teilnehmer*innen
            unveraendert.
          </div>
        </div>
        <SimulationParticipantSelect
          options={participantOptions}
          inputName="courseRegistrationIntentId"
          label="course_registration_intent_id"
        />
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Kuendigungs-/Enddatum</span>
          <input
            name="cancelEffectiveDate"
            type="text"
            placeholder="YYYY-MM-31"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Grund optional</span>
          <input
            name="reason"
            type="text"
            placeholder="z. B. Teilnehmer*in beendet Kurs"
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
          Teilnehmer*innen-Kuendigung simulieren
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
          "id,subscription_contract_id,subscription_period_id,payment_transaction_id,provider,provider_charge_id,provider_invoice_id,provider_payment_reference,charge_type,gross_amount_cents,currency,status,charged_at,metadata,created_at"
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
  const simulationIntentIds = Array.from(
    new Set(
      contracts
        .map((contract) => contract.course_registration_intent_id)
        .filter((intentId): intentId is string => Boolean(intentId))
    )
  );
  const simulationCourseIds = Array.from(new Set(contracts.map((contract) => contract.course_id)));
  const teacherIds = Array.from(new Set(contracts.map((contract) => contract.teacher_id).filter(Boolean)));
  const [{ data: simulationIntents }, { data: simulationCourses }, { data: providerProfiles }, { data: paymentTransactions }] = await Promise.all([
    simulationIntentIds.length > 0
      ? admin
          .from("course_registration_intents")
          .select("id,course_id,first_name,last_name,is_simulation,subscription_status")
          .in("id", simulationIntentIds)
          .returns<SimulationIntentRow[]>()
      : { data: [] as SimulationIntentRow[] },
    simulationCourseIds.length > 0
      ? admin.from("courses").select("id,title").in("id", simulationCourseIds).returns<SimulationCourseRow[]>()
      : { data: [] as SimulationCourseRow[] },
    teacherIds.length > 0
      ? admin
          .from("profiles")
          .select("id,first_name,last_name,organization_name,provider_type")
          .in("id", teacherIds)
          .returns<SimulationProfileRow[]>()
      : { data: [] as SimulationProfileRow[] },
    simulationIntentIds.length > 0
      ? admin
          .from("payment_transactions")
          .select("id,course_registration_intent_id,amount_cents,currency,status,paid_at,failed_at,created_at")
          .in("course_registration_intent_id", simulationIntentIds)
          .returns<PaymentTransactionRow[]>()
      : { data: [] as PaymentTransactionRow[] },
  ]);
  const paymentTransactionIds = Array.from(new Set((paymentTransactions ?? []).map((row) => row.id)));
  const [{ data: payoutLedgerEntries }, { data: payoutItems }] = await Promise.all([
    paymentTransactionIds.length > 0
      ? admin
          .from("ledger_entries")
          .select(
            "id,source_id,source_type,entry_type,gross_amount_cents,platform_fee_cents,net_amount_cents,currency,payout_status,available_at,payout_batch_id,created_at"
          )
          .eq("source_type", "payment_transaction")
          .eq("entry_type", "payment")
          .in("source_id", paymentTransactionIds)
          .returns<LedgerEntryRow[]>()
      : { data: [] as LedgerEntryRow[] },
    paymentTransactionIds.length > 0
      ? admin
          .from("ledger_entries")
          .select("id")
          .eq("source_type", "payment_transaction")
          .eq("entry_type", "payment")
          .in("source_id", paymentTransactionIds)
          .returns<Array<{ id: string }>>()
          .then(async (ledgerIdResult) => {
            const ledgerIds = Array.from(new Set((ledgerIdResult.data ?? []).map((row) => row.id)));
            if (ledgerIds.length === 0) {
              return { data: [] as PayoutItemRow[] };
            }

            return admin
              .from("payout_items")
              .select("id,payout_batch_id,ledger_entry_id,status,created_at")
              .in("ledger_entry_id", ledgerIds)
              .returns<PayoutItemRow[]>();
          })
      : { data: [] as PayoutItemRow[] },
  ]);
  const simulationIntentById = new Map((simulationIntents ?? []).map((intent) => [intent.id, intent] as const));
  const simulationCourseById = new Map((simulationCourses ?? []).map((course) => [course.id, course] as const));
  const providerProfileById = new Map((providerProfiles ?? []).map((profile) => [profile.id, profile] as const));
  const paymentTransactionById = new Map((paymentTransactions ?? []).map((row) => [row.id, row] as const));
  const latestChargeByPeriodId = new Map<string, SubscriptionChargeRow>();
  for (const charge of [...charges].sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))) {
    if (!charge.subscription_period_id || latestChargeByPeriodId.has(charge.subscription_period_id)) continue;
    latestChargeByPeriodId.set(charge.subscription_period_id, charge);
  }
  const payoutLedgerBySourceId = new Map<string, LedgerEntryRow>();
  for (const row of [...(payoutLedgerEntries ?? [])].sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))) {
    if (!payoutLedgerBySourceId.has(row.source_id)) {
      payoutLedgerBySourceId.set(row.source_id, row);
    }
  }
  const payoutItemByLedgerEntryId = new Map(
    [...(payoutItems ?? [])]
      .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
      .map((row) => [row.ledger_entry_id, row] as const)
  );
  const contractById = new Map(contracts.map((contract) => [contract.id, contract] as const));
  const contractOptions = contracts
    .filter((contract) => {
      const intent = contract.course_registration_intent_id
        ? simulationIntentById.get(contract.course_registration_intent_id)
        : null;
      return (
        intent?.is_simulation === true &&
        ["active", "pause_scheduled", "paused", "cancel_scheduled", "cancelled"].includes(contract.status)
      );
    })
    .map<SimulationContractOption>((contract) => {
      const intent = contract.course_registration_intent_id
        ? simulationIntentById.get(contract.course_registration_intent_id)
        : null;
      const course = simulationCourseById.get(contract.course_id);
      const participantName =
        [intent?.first_name, intent?.last_name].filter(Boolean).join(" ").trim() || "Teilnehmer*in";
      const nextPeriod = contract.next_charge_at ? formatDateTime(contract.next_charge_at) : "offen";
      return {
        id: contract.id,
        label: [
          course?.title?.trim() || "Laufendes Angebot",
          participantName,
          `Status: ${contract.status}`,
          `naechster Zeitraum: ${nextPeriod}`,
          `Betrag: ${formatMoney(contract.base_amount_cents, contract.currency)}`,
        ].join(" | "),
      };
    });
  const participantOptions = contracts
    .filter((contract) => {
      const intent = contract.course_registration_intent_id
        ? simulationIntentById.get(contract.course_registration_intent_id)
        : null;
      return (
        intent?.is_simulation === true &&
        ["active", "pause_scheduled", "paused", "cancel_scheduled", "cancelled"].includes(contract.status) &&
        ["active", "pause_scheduled", "paused", "cancel_scheduled", "cancelled"].includes(intent.subscription_status ?? "")
      );
    })
    .map<SimulationParticipantOption>((contract) => {
      const intent = contract.course_registration_intent_id
        ? simulationIntentById.get(contract.course_registration_intent_id)
        : null;
      const course = simulationCourseById.get(contract.course_id);
      const participantName =
        [intent?.first_name, intent?.last_name].filter(Boolean).join(" ").trim() || "Teilnehmer*in";
      const nextPeriod = contract.next_charge_at ? formatDateTime(contract.next_charge_at) : "offen";
      return {
        id: intent?.id ?? contract.id,
        label: [
          course?.title?.trim() || "Laufendes Angebot",
          participantName,
          `Status: ${intent?.subscription_status ?? "-"}`,
          `contract: ${contract.id}`,
          `naechster Zeitraum: ${nextPeriod}`,
          `Betrag: ${formatMoney(contract.base_amount_cents, contract.currency)}`,
        ].join(" | "),
      };
    });
  const businessRows = periods
    .map<BusinessSubscriptionRow | null>((period) => {
      const contract = contractById.get(period.subscription_contract_id);
      if (!contract) return null;

      const intent = contract.course_registration_intent_id
        ? simulationIntentById.get(contract.course_registration_intent_id)
        : null;
      if (intent?.is_simulation !== true) return null;

      const course = simulationCourseById.get(contract.course_id);
      const providerProfile = providerProfileById.get(contract.teacher_id);
      const charge = latestChargeByPeriodId.get(period.id) ?? null;
      const paymentTransaction = charge?.payment_transaction_id
        ? paymentTransactionById.get(charge.payment_transaction_id) ?? null
        : null;
      const payoutLedger = paymentTransaction ? payoutLedgerBySourceId.get(paymentTransaction.id) ?? null : null;
      const payoutItem = payoutLedger ? payoutItemByLedgerEntryId.get(payoutLedger.id) ?? null : null;
      const grossAmountCents = charge?.gross_amount_cents ?? contract.base_amount_cents;
      const currency = charge?.currency ?? contract.currency;

      return {
        contractId: contract.id,
        courseRegistrationIntentId: intent?.id ?? null,
        periodId: period.id,
        month: period.service_month,
        courseTitle: course?.title?.trim() || "Laufendes Angebot",
        participantName: [intent?.first_name, intent?.last_name].filter(Boolean).join(" ").trim() || "Teilnehmer*in",
        providerName: displayName({
          firstName: providerProfile?.first_name,
          lastName: providerProfile?.last_name,
          organizationName: providerProfile?.organization_name,
          fallback: "Anbieter*in",
        }),
        contractStatus: contract.status,
        subscriptionStatus: intent?.subscription_status ?? null,
        grossAmountCents,
        providerShareCents:
          payoutLedger?.net_amount_cents ?? calculateProviderPayoutAmount(grossAmountCents, providerProfile?.provider_type),
        reserFeeCents:
          payoutLedger?.platform_fee_cents ?? calculatePlatformFeeAmount(grossAmountCents, providerProfile?.provider_type),
        currency,
        chargeId: charge?.id ?? null,
        chargeStatus: charge?.status ?? null,
        paymentTransactionId: paymentTransaction?.id ?? null,
        paymentStatus: paymentTransaction?.status ?? null,
        payoutLedgerEntryId: payoutLedger?.id ?? null,
        payoutStatus: payoutLedger?.payout_status ?? null,
        payoutItemStatus: payoutItem?.status ?? null,
        periodStatus: period.status,
        pauseMode: period.pause_mode,
      };
    })
    .filter((row): row is BusinessSubscriptionRow => Boolean(row))
    .sort((left, right) => String(right.month).localeCompare(String(left.month)));
  const lifecycleRows = [
    ...pauseWindows
      .map<BusinessLifecycleRow | null>((row) => {
        const contract = row.subscription_contract_id ? contractById.get(row.subscription_contract_id) ?? null : null;
        const intent =
          row.scope_type === "participant"
            ? simulationIntentById.get(row.scope_id) ?? null
            : contract?.course_registration_intent_id
              ? simulationIntentById.get(contract.course_registration_intent_id) ?? null
              : null;
        const course = contract ? simulationCourseById.get(contract.course_id) ?? null : intent ? simulationCourseById.get(intent.course_id) ?? null : null;
        return {
          id: row.id,
          courseTitle: course?.title?.trim() || "Laufendes Angebot",
          participantLabel:
            row.scope_type === "participant"
              ? ([intent?.first_name, intent?.last_name].filter(Boolean).join(" ").trim() || "Teilnehmer*in")
              : contract?.course_registration_intent_id
                ? ([intent?.first_name, intent?.last_name].filter(Boolean).join(" ").trim() || "Teilnehmer*in")
                : "ganzer Kurs",
          periodLabel: `${formatDate(row.start_date)} - ${formatDate(row.end_date)}`,
          typeLabel: row.scope_type === "participant" ? "Teilnehmer-Pause" : "Kurs-Pause",
          statusLabel: row.status === "active" ? "Pausiert" : "Vorgemerkt",
          statusKey: row.status === "active" ? "pausiert" : "vorgemerkt",
        };
      })
      .filter((row): row is BusinessLifecycleRow => Boolean(row)),
    ...contracts
      .filter((contract) => ["cancel_scheduled", "cancelled", "ended"].includes(contract.status))
      .map<BusinessLifecycleRow>((contract) => {
        const intent = contract.course_registration_intent_id
          ? simulationIntentById.get(contract.course_registration_intent_id)
          : null;
        const course = simulationCourseById.get(contract.course_id);
        return {
          id: `contract-cancel-${contract.id}`,
          courseTitle: course?.title?.trim() || "Laufendes Angebot",
          participantLabel: [intent?.first_name, intent?.last_name].filter(Boolean).join(" ").trim() || "Teilnehmer*in",
          periodLabel: formatDate(contract.cancel_effective_date ?? contract.ended_at ?? null),
          typeLabel: "Kuendigung",
          statusLabel: contract.status === "cancel_scheduled" ? "Vorgemerkt" : "Beendet",
          statusKey: contract.status === "cancel_scheduled" ? "vorgemerkt" : "beendet",
        };
      }),
    ...(simulationIntents ?? [])
      .filter((intent) => ["cancel_scheduled", "cancelled", "inactive"].includes(intent.subscription_status ?? ""))
      .map<BusinessLifecycleRow>((intent) => {
        const contract = contracts.find((row) => row.course_registration_intent_id === intent.id) ?? null;
        const course = simulationCourseById.get(intent.course_id);
        return {
          id: `intent-cancel-${intent.id}`,
          courseTitle: course?.title?.trim() || "Laufendes Angebot",
          participantLabel: [intent.first_name, intent.last_name].filter(Boolean).join(" ").trim() || "Teilnehmer*in",
          periodLabel: formatDate(contract?.cancel_effective_date ?? contract?.ended_at ?? null),
          typeLabel: "Kuendigung",
          statusLabel: intent.subscription_status === "cancel_scheduled" ? "Vorgemerkt" : "Beendet",
          statusKey: intent.subscription_status === "cancel_scheduled" ? "vorgemerkt" : "beendet",
        };
      }),
  ].sort((left, right) => String(right.periodLabel).localeCompare(String(left.periodLabel)));
  const selectedContractId = sp.selectedContractId ?? contractOptions[0]?.id ?? null;
  const selectedContract = selectedContractId ? contractById.get(selectedContractId) ?? null : null;
  const selectedIntent =
    selectedContract?.course_registration_intent_id
      ? simulationIntentById.get(selectedContract.course_registration_intent_id) ?? null
      : null;
  const selectedCourse = selectedContract ? simulationCourseById.get(selectedContract.course_id) ?? null : null;
  const selectedProviderProfile = selectedContract ? providerProfileById.get(selectedContract.teacher_id) ?? null : null;
  const selectedParticipantOptionId = selectedIntent?.id ?? null;

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

        <ActionNotice
          action={sp.action}
          contractId={sp.contractId}
          courseRegistrationIntentId={sp.courseRegistrationIntentId}
          code={sp.code}
          errorMessage={sp.errorMessage}
          pauseWindowId={sp.pauseWindowId}
          eventId={sp.eventId}
          lifecycleStatus={sp.lifecycleStatus}
          renewalBlocked={sp.renewalBlocked}
          periodId={sp.periodId}
          chargeId={sp.chargeId}
          paymentTransactionId={sp.paymentTransactionId}
          ledgerEntryId={sp.ledgerEntryId}
          payoutBatchId={sp.payoutBatchId}
          step={sp.step}
          rawErrorName={sp.rawErrorName}
          rawErrorMessage={sp.rawErrorMessage}
          supabaseCode={sp.supabaseCode}
          supabaseMessage={sp.supabaseMessage}
          actionVersion={sp.actionVersion}
          fullMonthAmountCents={sp.fullMonthAmountCents}
          firstPaymentAmountCents={sp.firstPaymentAmountCents}
          contractStartDate={sp.contractStartDate}
          firstPaymentExplanation={sp.firstPaymentExplanation}
          billableDays={sp.billableDays}
          daysInMonth={sp.daysInMonth}
        />

        <Section
          title="Teststeuerung"
          description="Ausgewaehlte Simulations-Subscription fuer laufende Angebote. Alle Aktionen bleiben intern und triggern keine PSPs, Mails oder echten Auszahlungen."
        >
          {contractOptions.length > 0 ? (
            <div className="space-y-4">
              <form method="get" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <SimulationContractSelect
                    options={contractOptions}
                    inputName="selectedContractId"
                    label="laufende Simulations-Subscription"
                  />
                  <button
                    type="submit"
                    className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                  >
                    Auswahl laden
                  </button>
                </div>
              </form>

              {selectedContract ? (
                <>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Kurs</div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">{selectedCourse?.title?.trim() || "Laufendes Angebot"}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Teilnehmer*in</div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        {[selectedIntent?.first_name, selectedIntent?.last_name].filter(Boolean).join(" ").trim() || "Teilnehmer*in"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Status / naechster Monat</div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">{selectedContract.status}</div>
                      <div className="mt-1 text-xs text-slate-600">{selectedContract.next_charge_at ? formatDateTime(selectedContract.next_charge_at) : "offen"}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Betrag / Anbieter*in</div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">{formatMoney(selectedContract.base_amount_cents, selectedContract.currency)}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        {displayName({
                          firstName: selectedProviderProfile?.first_name,
                          lastName: selectedProviderProfile?.last_name,
                          organizationName: selectedProviderProfile?.organization_name,
                          fallback: "Anbieter*in",
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <form action={simulateSubscriptionRecurringPaymentAction} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                      <input type="hidden" name="subscriptionContractId" value={selectedContract.id} />
                      <div className="space-y-3">
                        <div className="text-sm font-semibold text-slate-900">Monatszahlung simulieren</div>
                        <input name="targetMonth" type="text" placeholder="YYYY-MM" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
                        <button type="submit" className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Monatszahlung simulieren</button>
                      </div>
                    </form>

                    <form action={simulateSubscriptionPauseAction} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                      <input type="hidden" name="subscriptionContractId" value={selectedContract.id} />
                      <div className="space-y-3">
                        <div className="text-sm font-semibold text-slate-900">Kurs-Pause simulieren</div>
                        <input name="pauseStartDate" type="text" placeholder="YYYY-MM-01" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
                        <input name="pauseEndDate" type="text" placeholder="YYYY-MM-31" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
                        <button type="submit" className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Kurs-Pause simulieren</button>
                      </div>
                    </form>

                    <form action={simulateSubscriptionCancelAction} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                      <input type="hidden" name="subscriptionContractId" value={selectedContract.id} />
                      <div className="space-y-3">
                        <div className="text-sm font-semibold text-slate-900">Kurs-Kuendigung simulieren</div>
                        <input name="cancelEffectiveDate" type="text" placeholder="YYYY-MM-31" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
                        <button type="submit" className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Kurs-Kuendigung simulieren</button>
                      </div>
                    </form>

                    <form action={simulateParticipantSubscriptionPauseAction} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                      <input type="hidden" name="courseRegistrationIntentId" value={selectedParticipantOptionId ?? ""} />
                      <div className="space-y-3">
                        <div className="text-sm font-semibold text-slate-900">Teilnehmer-Pause simulieren</div>
                        <input name="pauseStartDate" type="text" placeholder="YYYY-MM-01" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
                        <input name="pauseEndDate" type="text" placeholder="YYYY-MM-31" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
                        <button type="submit" disabled={!selectedParticipantOptionId} className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400">Teilnehmer-Pause simulieren</button>
                      </div>
                    </form>

                    <form action={simulateParticipantSubscriptionCancelAction} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                      <input type="hidden" name="courseRegistrationIntentId" value={selectedParticipantOptionId ?? ""} />
                      <div className="space-y-3">
                        <div className="text-sm font-semibold text-slate-900">Teilnehmer-Kuendigung simulieren</div>
                        <input name="cancelEffectiveDate" type="text" placeholder="YYYY-MM-31" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
                        <button type="submit" disabled={!selectedParticipantOptionId} className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400">Teilnehmer-Kuendigung simulieren</button>
                      </div>
                    </form>

                    <form action={simulateSubscriptionPayoutAction} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                      <input type="hidden" name="subscriptionContractId" value={selectedContract.id} />
                      <div className="space-y-3">
                        <div className="text-sm font-semibold text-slate-900">Auszahlung simulieren</div>
                        <div className="text-xs text-slate-700">
                          Nutzt den neuesten positiven Ledger-Eintrag dieser Subscription und fuehrt nur eine interne Simulations-Auszahlung aus.
                        </div>
                        <button type="submit" className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Auszahlung simulieren</button>
                      </div>
                    </form>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700">
              Noch keine aktive Simulations-Subscription vorhanden.
            </div>
          )}
        </Section>

        <Section
          title="Geldfluss laufende Angebote"
          description="Business-Sicht fuer Monatszahlungen, Anbieteranteile, RESER-Einnahmen sowie Pausen und Kuendigungen. Die technischen Audit-Tabellen bleiben darunter unveraendert."
        >
          <div className="grid gap-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 text-sm font-semibold text-slate-900">Kundenzahlungen / Monatszahlungen</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Monat</th>
                      <th className="px-3 py-2">Kurs</th>
                      <th className="px-3 py-2">Teilnehmer*in</th>
                      <th className="px-3 py-2">Brutto</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Charge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {businessRows.map((row) => {
                      const status = mapCustomerPaymentBusinessStatus({
                        periodStatus: row.periodStatus,
                        pauseMode: row.pauseMode,
                        chargeStatus: row.chargeStatus,
                        paymentStatus: row.paymentStatus,
                        contractStatus: row.contractStatus,
                        subscriptionStatus: row.subscriptionStatus,
                      });
                      return (
                        <tr key={`payment-${row.periodId}`} className="border-b border-slate-100 align-top">
                          <td className="px-3 py-3 text-xs text-slate-600">{formatDate(row.month)}</td>
                          <td className="px-3 py-3 text-xs text-slate-900">{row.courseTitle}</td>
                          <td className="px-3 py-3 text-xs text-slate-700">{row.participantName}</td>
                          <td className="px-3 py-3 text-xs font-medium text-slate-900">{formatMoney(row.grossAmountCents, row.currency)}</td>
                          <td className="px-3 py-3"><BusinessBadge label={status.label} statusKey={status.key} /></td>
                          <td className="px-3 py-3 text-xs text-slate-600">{row.chargeId ? shortenId(row.chargeId) : "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 text-sm font-semibold text-slate-900">Auszahlungen an Anbieter*innen</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Kurs</th>
                      <th className="px-3 py-2">Anbieter*in</th>
                      <th className="px-3 py-2">Teilnehmer*in</th>
                      <th className="px-3 py-2">Monat</th>
                      <th className="px-3 py-2">Anbieteranteil</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {businessRows.map((row) => {
                      const paymentStatus = mapCustomerPaymentBusinessStatus({
                        periodStatus: row.periodStatus,
                        pauseMode: row.pauseMode,
                        chargeStatus: row.chargeStatus,
                        paymentStatus: row.paymentStatus,
                        contractStatus: row.contractStatus,
                        subscriptionStatus: row.subscriptionStatus,
                      });
                      const payoutStatus = mapPayoutBusinessStatus({
                        payoutStatus: row.payoutStatus,
                        payoutItemStatus: row.payoutItemStatus,
                        paymentStatusKey: paymentStatus.key,
                      });
                      return (
                        <tr key={`payout-${row.periodId}`} className="border-b border-slate-100 align-top">
                          <td className="px-3 py-3 text-xs text-slate-900">{row.courseTitle}</td>
                          <td className="px-3 py-3 text-xs text-slate-700">{row.providerName}</td>
                          <td className="px-3 py-3 text-xs text-slate-700">{row.participantName}</td>
                          <td className="px-3 py-3 text-xs text-slate-600">{formatDate(row.month)}</td>
                          <td className="px-3 py-3 text-xs font-medium text-slate-900">{formatMoney(row.providerShareCents, row.currency)}</td>
                          <td className="px-3 py-3"><BusinessBadge label={payoutStatus.label} statusKey={payoutStatus.key} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 text-sm font-semibold text-slate-900">RESER-Einnahmen</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Kurs</th>
                      <th className="px-3 py-2">Teilnehmer*in</th>
                      <th className="px-3 py-2">Monat</th>
                      <th className="px-3 py-2">RESER-Provision</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {businessRows.map((row) => {
                      const paymentStatus = mapCustomerPaymentBusinessStatus({
                        periodStatus: row.periodStatus,
                        pauseMode: row.pauseMode,
                        chargeStatus: row.chargeStatus,
                        paymentStatus: row.paymentStatus,
                        contractStatus: row.contractStatus,
                        subscriptionStatus: row.subscriptionStatus,
                      });
                      const reserStatus = mapReserBusinessStatus({
                        payoutStatus: row.payoutStatus,
                        paymentStatusKey: paymentStatus.key,
                      });
                      return (
                        <tr key={`reser-${row.periodId}`} className="border-b border-slate-100 align-top">
                          <td className="px-3 py-3 text-xs text-slate-900">{row.courseTitle}</td>
                          <td className="px-3 py-3 text-xs text-slate-700">{row.participantName}</td>
                          <td className="px-3 py-3 text-xs text-slate-600">{formatDate(row.month)}</td>
                          <td className="px-3 py-3 text-xs font-medium text-slate-900">{formatMoney(row.reserFeeCents, row.currency)}</td>
                          <td className="px-3 py-3"><BusinessBadge label={reserStatus.label} statusKey={reserStatus.key} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 text-sm font-semibold text-slate-900">Pausen & Kuendigungen</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Kurs</th>
                      <th className="px-3 py-2">Teilnehmer*in / Scope</th>
                      <th className="px-3 py-2">Zeitraum</th>
                      <th className="px-3 py-2">Typ</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lifecycleRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 align-top">
                        <td className="px-3 py-3 text-xs text-slate-900">{row.courseTitle}</td>
                        <td className="px-3 py-3 text-xs text-slate-700">{row.participantLabel}</td>
                        <td className="px-3 py-3 text-xs text-slate-600">{row.periodLabel}</td>
                        <td className="px-3 py-3 text-xs text-slate-700">{row.typeLabel}</td>
                        <td className="px-3 py-3"><BusinessBadge label={row.statusLabel} statusKey={row.statusKey} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Section>

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
                <RecurringSimulationForm contractOptions={contractOptions} />
              </div>
              <div className="rounded-2xl border border-amber-300 bg-amber-100 px-4 py-3 text-sm text-amber-950">
                Kurs-Lifecycle simulieren. Keine echten Zahlungen, keine echte Auszahlung, keine Kund*innenmail.
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <LifecyclePauseForm contractOptions={contractOptions} />
                <LifecycleCancelForm contractOptions={contractOptions} />
              </div>
              <div className="rounded-2xl border border-amber-300 bg-amber-100 px-4 py-3 text-sm text-amber-950">
                Teilnehmer*innen-Lifecycle simulieren. Nur Simulations-Intents, keine Provider-Calls, keine Mails.
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <ParticipantLifecyclePauseForm participantOptions={participantOptions} />
                <ParticipantLifecycleCancelForm participantOptions={participantOptions} />
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

import Link from "next/link";
import type { ReactNode } from "react";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getBerlinStartOfTodayUtcIso } from "@/lib/formatting/berlin-time";
import { calculatePlatformFeeAmount, calculateProviderPayoutAmount } from "@/lib/platform-fees";
import { canRunPaymentsV2Simulation } from "@/lib/payments/simulation";
import { calculateWorkshopRefund } from "@/lib/payments/simulation/workshop-refund-policy";
import DashboardBackLink from "@/app/dashboard/_components/DashboardBackLink";
import {
  createSimulatedPayoutBatchAction,
  forceLedgerEntryPayableForTestAction,
  markEligibleLedgerEntriesAsPayableAction,
  simulateSelectedWorkshopPayoutAction,
  simulateWorkshopCustomerCancellationAction,
  simulateWorkshopCompletionForPayoutAction,
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

type SimulationBookingRow = {
  id: string;
  course_id: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  status: string | null;
  payment_status: string | null;
  payment_session_id: string | null;
  is_simulation: boolean | null;
  refund_amount_cents: number | null;
  created_at: string;
};

type SimulationCourseRow = {
  id: string;
  title: string | null;
  kind: string | null;
  teacher_id: string | null;
  starts_at: string | null;
  workshop_storno_policy: string | null;
};

type SimulationProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  provider_type: "independent_teacher" | "studio_provider" | null;
};

type SimulationProviderPayoutProfileRow = {
  id: string;
  teacher_id: string | null;
};

type SimulationCourseSessionRow = {
  course_id: string;
  starts_at: string | null;
};

type SimulationBookingOption = {
  bookingId: string;
  paymentTransactionId: string | null;
  ledgerEntryId: string | null;
  courseTitle: string;
  courseKind: string | null;
  workshopStornoPolicy: string | null;
  workshopStartAt: string | null;
  providerName: string;
  providerType: "independent_teacher" | "studio_provider" | null;
  customerName: string;
  amountCents: number | null;
  currency: string | null;
  bookingStatus: string | null;
  paymentStatus: string | null;
  refundAmountCents: number;
  grossAmountCents: number | null;
  platformFeeCents: number | null;
  netAmountCents: number | null;
  availableAt: string | null;
  payoutStatus: string | null;
  providerPayoutProfileId: string | null;
  payoutBatchId: string | null;
  createdAt: string;
  sourceLabel: "Simulation" | "Stripe Test";
};

type BusinessCustomerPaymentRow = {
  bookingId: string;
  paymentTransactionId: string;
  date: string;
  offer: string;
  provider: string;
  customer: string;
  grossCents: number;
  refundedAmountCents: number;
  currency: string;
  statusKey: string;
  statusLabel: string;
  providerName: string;
  offerName: string;
  paymentProvider: string;
};

type BusinessProviderPayoutRow = {
  bookingId: string;
  ledgerEntryId: string;
  payoutBatchId: string | null;
  offer: string;
  provider: string;
  providerShareCents: number;
  refundedAmountCents: number;
  currency: string;
  availableAt: string | null;
  statusKey: string;
  statusLabel: string;
  providerName: string;
  offerName: string;
};

type BusinessRefundRow = {
  refundRecordId: string;
  bookingId: string | null;
  date: string;
  offer: string;
  customer: string;
  amountCents: number;
  currency: string;
  reason: string | null;
  statusKey: string;
  statusLabel: string;
  providerName: string;
  offerName: string;
};

type BusinessReserIncomeRow = {
  bookingId: string;
  ledgerEntryId: string;
  offer: string;
  provider: string;
  grossCents: number;
  platformFeeCents: number;
  refundedAmountCents: number;
  currency: string;
  earnedFromAt: string;
  availableAt: string | null;
  statusKey: string;
  statusLabel: string;
  providerName: string;
  offerName: string;
};

type SearchParams = {
  action?: string;
  checkedCount?: string;
  businessStatus?: string;
  customerReceiptDocumentId?: string;
  customerReceiptPdfPath?: string;
  customerReceiptPdfGenerated?: string;
  customerReceiptPdfWarning?: string;
  documentRawErrorMessage?: string;
  documentStep?: string;
  documentSupabaseCode?: string;
  documentSupabaseMessage?: string;
  errorCode?: string;
  ledgerEntryId?: string;
  markedCount?: string;
  message?: string;
  offerFilter?: string;
  paymentTransactionId?: string;
  platformRevenueStatementDocumentId?: string;
  platformRevenueStatementPdfPath?: string;
  platformRevenueStatementPdfGenerated?: string;
  platformRevenueStatementPdfWarning?: string;
  payoutItemRawErrorMessage?: string;
  payoutItemStep?: string;
  payoutItemSupabaseCode?: string;
  payoutItemSupabaseMessage?: string;
  payoutMethod?: string;
  payoutProvider?: string;
  providerFilter?: string;
  providerPlatformFeeInvoiceDocumentId?: string;
  providerPlatformFeeInvoicePdfPath?: string;
  providerPlatformFeeInvoicePdfGenerated?: string;
  providerPlatformFeeInvoicePdfWarning?: string;
  providerPayoutStatementDocumentId?: string;
  providerPayoutStatementPdfPath?: string;
  providerPayoutStatementPdfGenerated?: string;
  providerPayoutStatementPdfWarning?: string;
  rawErrorMessage?: string;
  selectedBookingId?: string;
  simulationWindow?: string;
  step?: string;
  supabaseCode?: string;
  supabaseMessage?: string;
  usedFallbackPayoutProfile?: string;
};

const ROW_LIMIT = 20;
const SIMULATION_BOOKING_LIMIT = 120;
const INTERNAL_SIMULATION_PROVIDER = "internal_simulation";

function normalizeSimulationWindow(value: string | undefined): "today" | "last7" | "all" {
  if (value === "today" || value === "last7" || value === "all") {
    return value;
  }

  return "today";
}

type CustomerPaymentStatusInput = {
  paymentStatus: string | null;
  bookingStatus: string | null;
  grossAmountCents: number;
  refundedAmountCents: number;
};

type ProviderPayoutStatusInput = {
  payoutStatus: string | null;
  payoutItemStatus: string | null;
  paymentStatus: string | null;
  refundedAmountCents: number;
  grossAmountCents: number;
  offerKind: string | null;
};

type ReserIncomeStatusInput = {
  payoutStatus: string | null;
  paymentStatus: string | null;
  refundedAmountCents: number;
  grossAmountCents: number;
  offerKind: string | null;
};

function getSimulationWindowStart(windowKey: "today" | "last7" | "all"): string | null {
  if (windowKey === "all") return null;

  const now = new Date();
  if (windowKey === "today") {
    return getBerlinStartOfTodayUtcIso(now);
  }

  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  return start.toISOString();
}

function getDisplayName(input: {
  firstName?: string | null;
  lastName?: string | null;
  organizationName?: string | null;
  fallback: string;
}): string {
  const organizationName = input.organizationName?.trim();
  if (organizationName) return organizationName;

  const fullName = [input.firstName?.trim(), input.lastName?.trim()].filter(Boolean).join(" ").trim();
  return fullName || input.fallback;
}

function formatSimulationOptionLabel(option: SimulationBookingOption): string {
  const amountLabel =
    typeof option.amountCents === "number" ? formatMoney(option.amountCents, option.currency ?? "EUR") : "Betrag offen";

  return [
    `Angebot: ${option.courseTitle}`,
    `Kund*in: ${option.customerName}`,
    `Betrag: ${amountLabel}`,
    `Datum/Uhrzeit Berlin: ${formatDateTime(option.createdAt)}`,
    `Quelle: ${option.sourceLabel}`,
    `Status: ${option.bookingStatus ?? "-"}`,
    `booking_id: ${shortenId(option.bookingId)}`,
    `payment_transaction_id: ${shortenId(option.paymentTransactionId)}`,
    `ledger_entry_id: ${shortenId(option.ledgerEntryId)}`,
  ].join(" | ");
}

function isStripeTestPayment(row: PaymentTransactionRow | undefined, booking: SimulationBookingRow): boolean {
  if (!row) return false;
  if (row.provider !== "stripe") return false;

  return (
    row.provider_checkout_id?.startsWith("cs_test") === true ||
    row.provider_payment_id?.startsWith("pi_test") === true ||
    booking.payment_session_id?.startsWith("cs_test") === true
  );
}

function normalizeBusinessStatus(value: string | undefined): string {
  const allowed = new Set([
    "all",
    "bezahlt",
    "nicht_erstattet",
    "teilweise_erstattet",
    "offen",
    "fehlgeschlagen",
    "erstattet",
    "reduziert",
    "vorgemerkt",
    "auszahlbar",
    "in_auszahlung",
    "ausgezahlt",
    "storniert",
    "verdient",
  ]);

  return allowed.has(value ?? "") ? (value as string) : "all";
}

function isOneTimeOfferKind(kind: string | null | undefined): boolean {
  return kind === "workshop" || kind === "exclusive_offer";
}

function mapCustomerPaymentStatus(input: CustomerPaymentStatusInput): {
  key: string;
  label: string;
} {
  if (input.refundedAmountCents >= input.grossAmountCents && input.grossAmountCents > 0) {
    return { key: "erstattet", label: "Erstattet/Storniert" };
  }

  if (input.refundedAmountCents > 0) {
    return { key: "teilweise_erstattet", label: "Teilweise erstattet" };
  }

  switch (input.paymentStatus) {
    case "failed":
      return { key: "fehlgeschlagen", label: "Fehlgeschlagen" };
    case "paid":
      return { key: "nicht_erstattet", label: "Nicht erstattet" };
    default:
      return input.bookingStatus === "cancelled"
        ? { key: "nicht_erstattet", label: "Nicht erstattet" }
        : { key: "offen", label: "Offen" };
  }
}

function mapProviderPayoutStatus(input: ProviderPayoutStatusInput): {
  key: string;
  label: string;
} {
  const isFullyRefunded = input.grossAmountCents > 0 && input.refundedAmountCents >= input.grossAmountCents;
  const isPartiallyRefunded = input.refundedAmountCents > 0 && !isFullyRefunded;

  if (isFullyRefunded || input.paymentStatus === "refunded" || input.payoutStatus === "cancelled" || input.payoutStatus === "held") {
    return { key: "storniert", label: "Storniert/Gesperrt" };
  }

  if (input.payoutItemStatus === "paid" || input.payoutStatus === "paid") {
    return { key: "ausgezahlt", label: "Ausgezahlt" };
  }

  if (
    input.payoutStatus === "batched" ||
    input.payoutItemStatus === "simulated_pending" ||
    input.payoutItemStatus === "planned" ||
    input.payoutItemStatus === "scheduled" ||
    input.payoutItemStatus === "processing"
  ) {
    return { key: "in_auszahlung", label: "In Auszahlung" };
  }

  if (input.payoutStatus === "payable" || input.payoutStatus === "available") {
    if (isOneTimeOfferKind(input.offerKind)) {
      return { key: "vorgemerkt", label: "Vorgemerkt" };
    }

    return { key: "auszahlbar", label: "Auszahlbar" };
  }

  if (isPartiallyRefunded) {
    return { key: "reduziert", label: "Reduziert" };
  }

  return { key: "vorgemerkt", label: "Vorgemerkt" };
}

function mapRefundStatus(status: string | null | undefined): {
  key: string;
  label: string;
} {
  switch (status) {
    case "succeeded":
      return { key: "erstattet", label: "Erstattet" };
    case "failed":
      return { key: "fehlgeschlagen", label: "Fehlgeschlagen" };
    case "cancelled":
      return { key: "storniert", label: "Storniert" };
    default:
      return { key: "offen", label: "Offen" };
  }
}

function mapReserIncomeStatus(input: ReserIncomeStatusInput): {
  key: string;
  label: string;
} {
  const isFullyRefunded = input.grossAmountCents > 0 && input.refundedAmountCents >= input.grossAmountCents;
  const isPartiallyRefunded = input.refundedAmountCents > 0 && !isFullyRefunded;

  if (isFullyRefunded || input.paymentStatus === "refunded" || input.payoutStatus === "cancelled" || input.payoutStatus === "held") {
    return { key: "storniert", label: "Storniert/Reversed" };
  }

  if (input.payoutStatus === "pending" || input.payoutStatus === "pending_event_completion") {
    return { key: "vorgemerkt", label: "Vorgemerkt" };
  }

  if (isPartiallyRefunded) {
    return { key: "reduziert", label: "Reduziert verdient" };
  }

  return { key: "verdient", label: "Verdient" };
}

function businessStatusTone(statusKey: string): string {
  switch (statusKey) {
    case "bezahlt":
    case "nicht_erstattet":
    case "auszahlbar":
    case "ausgezahlt":
    case "verdient":
      return "bg-green-100 text-green-800";
    case "teilweise_erstattet":
    case "reduziert":
      return "bg-blue-100 text-blue-800";
    case "in_auszahlung":
      return "bg-sky-100 text-sky-800";
    case "erstattet":
    case "storniert":
    case "fehlgeschlagen":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-amber-100 text-amber-800";
  }
}

function BusinessStatusBadge({ label, statusKey }: { label: string; statusKey: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${businessStatusTone(statusKey)}`}>
      {label}
    </span>
  );
}

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

function ActionNotice({
  action,
  checkedCount,
  customerReceiptDocumentId,
  documentRawErrorMessage,
  documentStep,
  documentSupabaseCode,
  documentSupabaseMessage,
  errorCode,
  ledgerEntryId,
  markedCount,
  message: detailMessage,
  paymentTransactionId,
  platformRevenueStatementDocumentId,
  platformRevenueStatementPdfPath,
  platformRevenueStatementPdfGenerated,
  platformRevenueStatementPdfWarning,
  payoutItemRawErrorMessage,
  payoutItemStep,
  payoutItemSupabaseCode,
  payoutItemSupabaseMessage,
  payoutMethod,
  payoutProvider,
  providerPlatformFeeInvoiceDocumentId,
  providerPlatformFeeInvoicePdfPath,
  providerPlatformFeeInvoicePdfGenerated,
  providerPlatformFeeInvoicePdfWarning,
  providerPayoutStatementDocumentId,
  providerPayoutStatementPdfPath,
  providerPayoutStatementPdfGenerated,
  providerPayoutStatementPdfWarning,
  customerReceiptPdfPath,
  customerReceiptPdfGenerated,
  customerReceiptPdfWarning,
  rawErrorMessage,
  step,
  supabaseCode,
  supabaseMessage,
  usedFallbackPayoutProfile,
}: SearchParams) {
  if (!action) return null;

  let message = "Interne Simulation ausgefuehrt.";
  let toneClass = "border-slate-200 bg-slate-100 text-slate-700";
  let extra: ReactNode = null;

  if (action === "eligible-ok") {
    message = `${markedCount ?? "0"} Ledger-Eintraege wurden als payable markiert.`;
    toneClass = "border-green-200 bg-green-50 text-green-800";
    extra = checkedCount ? <div className="mt-1 text-xs">Geprueft: {checkedCount}</div> : null;
  } else if (action === "eligible-none") {
    message = detailMessage ?? "Keine passenden Ledger-Eintraege gefunden.";
    toneClass = "border-amber-200 bg-amber-50 text-amber-800";
    extra = checkedCount ? <div className="mt-1 text-xs">Geprueft: {checkedCount}</div> : null;
  } else if (action === "eligible-error") {
    message = "Fehler beim Markieren von payable Ledger-Eintraegen.";
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
    extra =
      errorCode || detailMessage ? (
        <div className="mt-1 space-y-1 text-xs">
          <div>code: {errorCode ?? "-"}</div>
          <div>detail: {detailMessage ?? "-"}</div>
        </div>
      ) : null;
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
  } else if (action === "force-payable-ok") {
    message = "Ledger-Eintrag wurde im Testmodus auf payable gesetzt. Nur Testmodus - loest keine echte Auszahlung aus.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
    extra = ledgerEntryId ? <div className="mt-1 text-xs">ledger_entry_id: {ledgerEntryId}</div> : null;
  } else if (action === "force-payable-none") {
    message = detailMessage ?? "Keine passenden Ledger-Eintraege gefunden.";
    toneClass = "border-amber-200 bg-amber-50 text-amber-800";
    extra = ledgerEntryId ? <div className="mt-1 text-xs">ledger_entry_id: {ledgerEntryId}</div> : null;
  } else if (action === "force-payable-error") {
    message = "Fehler beim Force-payable-Test. Nur Testmodus - loest keine echte Auszahlung aus.";
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
    extra = (
      <div className="mt-1 space-y-1 text-xs">
        <div>ledger_entry_id: {ledgerEntryId ?? "-"}</div>
        <div>code: {errorCode ?? "-"}</div>
        <div>detail: {detailMessage ?? "-"}</div>
      </div>
    );
  } else if (action === "selected-workshop-ready-ok") {
    message = detailMessage ?? "Workshop abgeschlossen + 24h wurde simuliert.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
    extra = ledgerEntryId ? <div className="mt-1 text-xs">ledger_entry_id: {ledgerEntryId}</div> : null;
  } else if (action === "selected-workshop-ready-none") {
    message = detailMessage ?? "Keine passenden Ledger-Eintraege gefunden.";
    toneClass = "border-amber-200 bg-amber-50 text-amber-800";
    extra = ledgerEntryId ? <div className="mt-1 text-xs">ledger_entry_id: {ledgerEntryId}</div> : null;
  } else if (action === "selected-workshop-ready-error") {
    message = "Workshop konnte nicht fuer die Auszahlung vorbereitet werden.";
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
    extra = (
      <div className="mt-1 space-y-1 text-xs">
        <div>ledger_entry_id: {ledgerEntryId ?? "-"}</div>
        <div>code: {errorCode ?? "-"}</div>
        <div>detail: {detailMessage ?? "-"}</div>
      </div>
    );
  } else if (action === "selected-payout-ok") {
    message = detailMessage ?? "Simulierte Auszahlung erfolgreich abgeschlossen.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
    extra = (
      <div className="mt-1 space-y-1 text-xs">
        <div>ledger_entry_id: {ledgerEntryId ?? "-"}</div>
        <div>payout_provider: {payoutProvider ?? "-"}</div>
        <div>payout_method: {payoutMethod ?? "-"}</div>
        <div>fallback_payout_profile: {usedFallbackPayoutProfile === "yes" ? "ja" : "nein"}</div>
        <div>provider_payout_statement_document_id: {providerPayoutStatementDocumentId ?? "-"}</div>
        <div>provider_payout_statement_pdf_path: {providerPayoutStatementPdfPath ?? "-"}</div>
        <div>provider_payout_statement_pdf_generated: {providerPayoutStatementPdfGenerated === "yes" ? "ja" : "nein"}</div>
        {providerPayoutStatementPdfWarning ? <div>provider_payout_statement_pdf_warning: {providerPayoutStatementPdfWarning}</div> : null}
        <div>provider_platform_fee_invoice_document_id: {providerPlatformFeeInvoiceDocumentId ?? "-"}</div>
        <div>provider_platform_fee_invoice_pdf_path: {providerPlatformFeeInvoicePdfPath ?? "-"}</div>
        <div>provider_platform_fee_invoice_pdf_generated: {providerPlatformFeeInvoicePdfGenerated === "yes" ? "ja" : "nein"}</div>
        {providerPlatformFeeInvoicePdfWarning ? <div>provider_platform_fee_invoice_pdf_warning: {providerPlatformFeeInvoicePdfWarning}</div> : null}
        <div>platform_revenue_statement_document_id: {platformRevenueStatementDocumentId ?? "-"}</div>
        <div>platform_revenue_statement_pdf_path: {platformRevenueStatementPdfPath ?? "-"}</div>
        <div>platform_revenue_statement_pdf_generated: {platformRevenueStatementPdfGenerated === "yes" ? "ja" : "nein"}</div>
        {platformRevenueStatementPdfWarning ? <div>platform_revenue_statement_pdf_warning: {platformRevenueStatementPdfWarning}</div> : null}
        {payoutItemStep || payoutItemRawErrorMessage ? (
          <>
            <div className="pt-2 font-semibold text-amber-900">Payout-Item-Warnung</div>
            <div>step: {payoutItemStep ?? "-"}</div>
            <div>supabase_code: {payoutItemSupabaseCode ?? "-"}</div>
            <div>supabase_message: {payoutItemSupabaseMessage ?? "-"}</div>
            <div>raw_error_message: {payoutItemRawErrorMessage ?? "-"}</div>
          </>
        ) : null}
        {documentStep || documentRawErrorMessage ? (
          <>
            <div className="pt-2 font-semibold text-amber-900">Document-Warnung</div>
            <div>step: {documentStep ?? "-"}</div>
            <div>supabase_code: {documentSupabaseCode ?? "-"}</div>
            <div>supabase_message: {documentSupabaseMessage ?? "-"}</div>
            <div>raw_error_message: {documentRawErrorMessage ?? "-"}</div>
          </>
        ) : null}
      </div>
    );
  } else if (action === "selected-payout-error") {
    message = "Simulierte Auszahlung konnte nicht abgeschlossen werden.";
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
    extra = (
      <div className="mt-1 space-y-1 text-xs">
        <div>ledger_entry_id: {ledgerEntryId ?? "-"}</div>
        <div>step: {step ?? "-"}</div>
        <div>code: {errorCode ?? "-"}</div>
        <div>supabase_code: {supabaseCode ?? "-"}</div>
        <div>supabase_message: {supabaseMessage ?? "-"}</div>
        <div>detail: {detailMessage ?? "-"}</div>
        <div>raw_error_message: {rawErrorMessage ?? "-"}</div>
      </div>
    );
  } else if (action === "workshop-cancel-selected-ok" || action === "workshop-refund-selected-ok") {
    message = detailMessage ?? "Workshop wurde simuliert storniert und erstattet.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
  } else if (action === "workshop-customer-cancel-selected-ok") {
    message = detailMessage ?? "Kund*innenstorno wurde policy-gesteuert simuliert.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
  } else if (action === "workshop-customer-cancel-selected-error") {
    message = "Kund*innenstorno konnte nicht simuliert werden.";
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
    extra = (
      <div className="mt-1 space-y-1 text-xs">
        <div>code: {errorCode ?? "-"}</div>
        <div>detail: {detailMessage ?? "-"}</div>
      </div>
    );
  } else if (action === "workshop-cancel-selected-error" || action === "workshop-refund-selected-error") {
    message = "Workshop-Storno/Refund konnte nicht simuliert werden.";
    toneClass = "border-rose-200 bg-rose-50 text-rose-800";
    extra = (
      <div className="mt-1 space-y-1 text-xs">
        <div>code: {errorCode ?? "-"}</div>
        <div>detail: {detailMessage ?? "-"}</div>
      </div>
    );
  } else if (action.startsWith("workshop-pay-ok-")) {
    message = "Workshop-Zahlung intern als erfolgreich simuliert. Keine echte Zahlung, keine Auszahlung, keine Kund*innenmail.";
    toneClass = "border-green-200 bg-green-50 text-green-800";
    extra = (
      <div className="mt-1 space-y-1 text-xs">
        <div>payment_transaction_id: {paymentTransactionId ?? "-"}</div>
        <div>customer_receipt_document_id: {customerReceiptDocumentId ?? "-"}</div>
        <div>customer_receipt_pdf_path: {customerReceiptPdfPath ?? "-"}</div>
        <div>customer_receipt_pdf_generated: {customerReceiptPdfGenerated === "yes" ? "ja" : "nein"}</div>
        {customerReceiptPdfWarning ? <div>customer_receipt_pdf_warning: {customerReceiptPdfWarning}</div> : null}
      </div>
    );
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

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${toneClass}`}>
      <div>{message}</div>
      {extra}
    </div>
  );
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
  defaultValue,
}: {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">{label}</span>
      <input
        name={name}
        type="text"
        placeholder={placeholder}
        defaultValue={defaultValue}
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
  const simulationWindow = normalizeSimulationWindow(sp.simulationWindow);
  const selectedBookingId = sp.selectedBookingId?.trim() || "";
  const user = await requirePaymentsV2AdminAccess();
  const canUseSimulation = canRunPaymentsV2Simulation(user.email);

  const admin = createSupabaseAdmin();
  let simulationBookingsQuery = admin
    .from("bookings")
    .select("id,course_id,customer_first_name,customer_last_name,customer_email,status,payment_status,payment_session_id,is_simulation,refund_amount_cents,created_at")
    .order("created_at", { ascending: false })
    .limit(SIMULATION_BOOKING_LIMIT);

  const simulationWindowStart = getSimulationWindowStart(simulationWindow);
  if (simulationWindowStart) {
    simulationBookingsQuery = simulationBookingsQuery.gte("created_at", simulationWindowStart);
  }

  const { data: simulationBookingsRaw } = await simulationBookingsQuery.returns<SimulationBookingRow[]>();
  const simulationBookings = simulationBookingsRaw ?? [];
  const simulationCourseIds = Array.from(
    new Set(simulationBookings.map((row) => row.course_id).filter((value): value is string => Boolean(value)))
  );
  const { data: simulationCoursesRaw } =
    simulationCourseIds.length > 0
      ? await admin
          .from("courses")
          .select("id,title,kind,teacher_id,starts_at,workshop_storno_policy")
          .in("id", simulationCourseIds)
          .returns<SimulationCourseRow[]>()
      : { data: [] as SimulationCourseRow[] };
  const simulationCourses = (simulationCoursesRaw ?? []).filter(
    (row) => row.kind === "workshop" || row.kind === "exclusive_offer"
  );
  const simulationCoursesById = new Map(simulationCourses.map((row) => [row.id, row] as const));
  const eligibleSimulationBookings = simulationBookings.filter(
    (row) => row.course_id && simulationCoursesById.has(row.course_id)
  );
  const simulationTeacherIds = Array.from(
    new Set(
      simulationCourses
        .map((row) => row.teacher_id)
        .filter((value): value is string => Boolean(value))
    )
  );
  const [simulationProfilesRaw, simulationPayoutProfilesRaw, simulationPaymentTransactionsRaw, simulationCourseSessionsRaw] = await Promise.all([
    simulationTeacherIds.length > 0
      ? admin
          .from("profiles")
          .select("id,first_name,last_name,organization_name,provider_type")
          .in("id", simulationTeacherIds)
          .returns<SimulationProfileRow[]>()
      : Promise.resolve({ data: [] as SimulationProfileRow[] }),
    simulationTeacherIds.length > 0
      ? admin
          .from("provider_payout_profiles")
          .select("id,teacher_id")
          .in("teacher_id", simulationTeacherIds)
          .returns<SimulationProviderPayoutProfileRow[]>()
      : Promise.resolve({ data: [] as SimulationProviderPayoutProfileRow[] }),
    eligibleSimulationBookings.length > 0
      ? admin
          .from("payment_transactions")
          .select(
            "id,booking_id,course_registration_intent_id,provider,provider_payment_id,provider_checkout_id,provider_customer_id,provider_subscription_id,amount_cents,currency,payment_method,status,paid_at,refunded_at,failed_at,created_at"
          )
          .in("booking_id", eligibleSimulationBookings.map((row) => row.id))
          .order("created_at", { ascending: false })
          .returns<PaymentTransactionRow[]>()
      : Promise.resolve({ data: [] as PaymentTransactionRow[] }),
    eligibleSimulationBookings.length > 0
      ? admin
          .from("course_sessions")
          .select("course_id,starts_at")
          .in("course_id", eligibleSimulationBookings.map((row) => row.course_id as string))
          .order("starts_at", { ascending: true })
          .returns<SimulationCourseSessionRow[]>()
      : Promise.resolve({ data: [] as SimulationCourseSessionRow[] }),
  ]);
  const simulationProfilesById = new Map((simulationProfilesRaw.data ?? []).map((row) => [row.id, row] as const));
  const simulationPayoutProfilesByTeacherId = new Map(
    (simulationPayoutProfilesRaw.data ?? []).map((row) => [row.teacher_id ?? "", row] as const)
  );
  const simulationPaymentTransactions = simulationPaymentTransactionsRaw.data ?? [];
  const workshopStartByCourseId = new Map<string, string | null>();
  for (const row of simulationCourseSessionsRaw.data ?? []) {
    if (!workshopStartByCourseId.has(row.course_id)) {
      workshopStartByCourseId.set(row.course_id, row.starts_at ?? null);
    }
  }
  const latestSimulationPaymentByBookingId = new Map<string, PaymentTransactionRow>();
  for (const row of simulationPaymentTransactions) {
    if (row.booking_id && !latestSimulationPaymentByBookingId.has(row.booking_id)) {
      latestSimulationPaymentByBookingId.set(row.booking_id, row);
    }
  }
  const simulationPaymentTransactionIds = Array.from(
    new Set(
      Array.from(latestSimulationPaymentByBookingId.values())
        .map((row) => row.id)
        .filter(Boolean)
    )
  );
  const { data: simulationLedgerEntriesRaw } =
    simulationPaymentTransactionIds.length > 0
      ? await admin
          .from("ledger_entries")
          .select(
            "id,provider_payout_profile_id,source_type,source_id,entry_type,gross_amount_cents,platform_fee_cents,provider_fee_cents,net_amount_cents,currency,payout_status,available_at,payout_batch_id,created_at"
          )
          .eq("source_type", "payment_transaction")
          .eq("entry_type", "payment")
          .in("source_id", simulationPaymentTransactionIds)
          .order("created_at", { ascending: false })
          .returns<LedgerEntryRow[]>()
      : { data: [] as LedgerEntryRow[] };
  const latestSimulationLedgerByPaymentTransactionId = new Map<string, LedgerEntryRow>();
  for (const row of simulationLedgerEntriesRaw ?? []) {
    if (!latestSimulationLedgerByPaymentTransactionId.has(row.source_id)) {
      latestSimulationLedgerByPaymentTransactionId.set(row.source_id, row);
    }
  }
  const simulationOptions: SimulationBookingOption[] = eligibleSimulationBookings.flatMap((booking) => {
    const course = booking.course_id ? simulationCoursesById.get(booking.course_id) : undefined;
    const profile = course?.teacher_id ? simulationProfilesById.get(course.teacher_id) : undefined;
    const payoutProfile = course?.teacher_id ? simulationPayoutProfilesByTeacherId.get(course.teacher_id) : undefined;
    const paymentTransaction = latestSimulationPaymentByBookingId.get(booking.id);
    const isInternalSimulation =
      booking.is_simulation === true && (!paymentTransaction || paymentTransaction.provider === INTERNAL_SIMULATION_PROVIDER);
    const isStripeTest = isStripeTestPayment(paymentTransaction, booking);
    if (!isInternalSimulation && !isStripeTest) {
      return [];
    }
    const ledgerEntry = paymentTransaction?.id
      ? latestSimulationLedgerByPaymentTransactionId.get(paymentTransaction.id)
      : undefined;

    return [{
      bookingId: booking.id,
      paymentTransactionId: paymentTransaction?.id ?? null,
      ledgerEntryId: ledgerEntry?.id ?? null,
      courseTitle: course?.title?.trim() || "Angebot",
      courseKind: course?.kind ?? null,
      workshopStornoPolicy: course?.workshop_storno_policy ?? null,
      workshopStartAt: (booking.course_id ? workshopStartByCourseId.get(booking.course_id) : null) ?? course?.starts_at ?? null,
      providerName: getDisplayName({
        firstName: profile?.first_name,
        lastName: profile?.last_name,
        organizationName: profile?.organization_name,
        fallback: "Anbieter*in",
      }),
      providerType: profile?.provider_type ?? null,
      customerName: getDisplayName({
        firstName: booking.customer_first_name,
        lastName: booking.customer_last_name,
        fallback: booking.customer_email?.trim() || "Kund*in",
      }),
      amountCents: paymentTransaction?.amount_cents ?? null,
      currency: paymentTransaction?.currency ?? null,
      bookingStatus: booking.status,
      paymentStatus: booking.payment_status,
      refundAmountCents: Math.max(0, booking.refund_amount_cents ?? 0),
      grossAmountCents: ledgerEntry?.gross_amount_cents ?? paymentTransaction?.amount_cents ?? null,
      platformFeeCents: ledgerEntry?.platform_fee_cents ?? null,
      netAmountCents: ledgerEntry?.net_amount_cents ?? null,
      availableAt: ledgerEntry?.available_at ?? null,
      payoutStatus: ledgerEntry?.payout_status ?? null,
      providerPayoutProfileId: ledgerEntry?.provider_payout_profile_id ?? payoutProfile?.id ?? null,
      payoutBatchId: ledgerEntry?.payout_batch_id ?? null,
      createdAt: booking.created_at,
      sourceLabel: isStripeTest ? "Stripe Test" : "Simulation",
    }];
  });
  const selectedSimulationOption =
    simulationOptions.find((option) => option.bookingId === selectedBookingId) ?? null;
  let selectedCustomerCancellationPreview:
    | (ReturnType<typeof calculateWorkshopRefund> & {
        providerShareCents: number;
        reserFeeCents: number;
      })
    | null = null;
  let selectedCustomerCancellationPreviewError: string | null = null;
  if (selectedSimulationOption && typeof selectedSimulationOption.amountCents === "number") {
    try {
      if (!selectedSimulationOption.workshopStornoPolicy) {
        throw new Error("Policy unbekannt.");
      }
      if (!selectedSimulationOption.workshopStartAt) {
        throw new Error("Workshopdatum fehlt.");
      }

      const calculated = calculateWorkshopRefund({
        workshop_storno_policy: selectedSimulationOption.workshopStornoPolicy,
        workshop_start_at: selectedSimulationOption.workshopStartAt,
        cancellation_timestamp: new Date().toISOString(),
        gross_amount_cents: selectedSimulationOption.amountCents,
      });
      selectedCustomerCancellationPreview = {
        ...calculated,
        providerShareCents: calculateProviderPayoutAmount(
          calculated.retained_amount_cents,
          selectedSimulationOption.providerType
        ),
        reserFeeCents: calculatePlatformFeeAmount(
          calculated.retained_amount_cents,
          selectedSimulationOption.providerType
        ),
      };
    } catch (error) {
      selectedCustomerCancellationPreviewError =
        error instanceof Error ? error.message : "Kund*innenstorno-Vorschau konnte nicht berechnet werden.";
    }
  }
  const invalidSelectedBooking = Boolean(selectedBookingId) && !selectedSimulationOption;
  const businessStatusFilter = normalizeBusinessStatus(sp.businessStatus);
  const providerFilter = sp.providerFilter?.trim() || "all";
  const offerFilter = sp.offerFilter?.trim() || "all";
  const businessLedgerEntryIds = simulationOptions
    .map((option) => option.ledgerEntryId)
    .filter((value): value is string => Boolean(value));
  const businessPaymentTransactionIds = simulationOptions
    .map((option) => option.paymentTransactionId)
    .filter((value): value is string => Boolean(value));
  const [businessPayoutItemsRaw, businessRefundsRaw] = await Promise.all([
    businessLedgerEntryIds.length > 0
      ? admin
          .from("payout_items")
          .select("id,payout_batch_id,provider_payout_profile_id,ledger_entry_id,amount_cents,currency,status,created_at")
          .in("ledger_entry_id", businessLedgerEntryIds)
          .returns<PayoutItemRow[]>()
      : Promise.resolve({ data: [] as PayoutItemRow[] }),
    businessPaymentTransactionIds.length > 0
      ? admin
          .from("refund_records")
          .select("id,payment_transaction_id,provider_refund_id,amount_cents,reason,status,created_at,updated_at")
          .in("payment_transaction_id", businessPaymentTransactionIds)
          .order("created_at", { ascending: false })
          .returns<RefundRecordRow[]>()
      : Promise.resolve({ data: [] as RefundRecordRow[] }),
  ]);
  const businessPayoutItemByLedgerEntryId = new Map(
    (businessPayoutItemsRaw.data ?? []).map((row) => [row.ledger_entry_id, row] as const)
  );
  const refundAmountByPaymentTransactionId = new Map<string, number>();
  for (const row of businessRefundsRaw.data ?? []) {
    if (row.status !== "succeeded") continue;
    refundAmountByPaymentTransactionId.set(
      row.payment_transaction_id,
      (refundAmountByPaymentTransactionId.get(row.payment_transaction_id) ?? 0) + Math.max(0, row.amount_cents)
    );
  }
  const paymentTransactionById = new Map(simulationPaymentTransactions.map((row) => [row.id, row] as const));
  const simulationOptionByPaymentTransactionId = new Map(
    simulationOptions
      .filter((option) => option.paymentTransactionId)
      .map((option) => [option.paymentTransactionId as string, option] as const)
  );
  const customerPaymentRows = simulationOptions
    .filter((option) => typeof option.amountCents === "number" && option.paymentTransactionId)
    .map((option): BusinessCustomerPaymentRow => {
      const paymentTransaction = option.paymentTransactionId ? paymentTransactionById.get(option.paymentTransactionId) : undefined;
      const refundedAmountCents = refundAmountByPaymentTransactionId.get(option.paymentTransactionId as string) ?? option.refundAmountCents;
      const paymentStatus = mapCustomerPaymentStatus({
        paymentStatus: paymentTransaction?.status ?? option.paymentStatus ?? null,
        bookingStatus: option.bookingStatus,
        grossAmountCents: option.amountCents as number,
        refundedAmountCents,
      });

      return {
        bookingId: option.bookingId,
        paymentTransactionId: option.paymentTransactionId as string,
        date: paymentTransaction?.paid_at ?? paymentTransaction?.created_at ?? option.createdAt,
        offer: option.courseTitle,
        provider: option.providerName,
        customer: option.customerName,
        grossCents: option.amountCents as number,
        refundedAmountCents,
        currency: option.currency ?? "EUR",
        statusKey: paymentStatus.key,
        statusLabel: paymentStatus.label,
        providerName: option.providerName,
        offerName: option.courseTitle,
        paymentProvider: paymentTransaction?.provider ?? INTERNAL_SIMULATION_PROVIDER,
      };
    });
  const providerPayoutRows = simulationOptions
    .filter((option) => typeof option.netAmountCents === "number" && option.ledgerEntryId)
    .map((option): BusinessProviderPayoutRow => {
      const paymentTransaction = option.paymentTransactionId ? paymentTransactionById.get(option.paymentTransactionId) : undefined;
      const payoutItem = option.ledgerEntryId ? businessPayoutItemByLedgerEntryId.get(option.ledgerEntryId) : undefined;
      const refundedAmountCents = option.paymentTransactionId
        ? (refundAmountByPaymentTransactionId.get(option.paymentTransactionId) ?? option.refundAmountCents)
        : option.refundAmountCents;
      const payoutStatus = mapProviderPayoutStatus({
        payoutStatus: option.payoutStatus,
        payoutItemStatus: payoutItem?.status ?? null,
        paymentStatus: paymentTransaction?.status ?? option.paymentStatus ?? null,
        refundedAmountCents,
        grossAmountCents: option.amountCents ?? 0,
        offerKind: option.courseKind,
      });

      return {
        bookingId: option.bookingId,
        ledgerEntryId: option.ledgerEntryId as string,
        payoutBatchId: option.payoutBatchId,
        offer: option.courseTitle,
        provider: option.providerName,
        providerShareCents: option.netAmountCents as number,
        refundedAmountCents,
        currency: option.currency ?? "EUR",
        availableAt: option.availableAt,
        statusKey: payoutStatus.key,
        statusLabel: payoutStatus.label,
        providerName: option.providerName,
        offerName: option.courseTitle,
      };
    });
  const reserIncomeRows = simulationOptions
    .filter((option) => typeof option.platformFeeCents === "number" && option.ledgerEntryId)
    .map((option): BusinessReserIncomeRow => {
      const paymentTransaction = option.paymentTransactionId ? paymentTransactionById.get(option.paymentTransactionId) : undefined;
      const refundedAmountCents = option.paymentTransactionId
        ? (refundAmountByPaymentTransactionId.get(option.paymentTransactionId) ?? option.refundAmountCents)
        : option.refundAmountCents;
      const incomeStatus = mapReserIncomeStatus({
        payoutStatus: option.payoutStatus,
        paymentStatus: paymentTransaction?.status ?? option.paymentStatus ?? null,
        refundedAmountCents,
        grossAmountCents: option.amountCents ?? 0,
        offerKind: option.courseKind,
      });

      return {
        bookingId: option.bookingId,
        ledgerEntryId: option.ledgerEntryId as string,
        offer: option.courseTitle,
        provider: option.providerName,
        grossCents: option.grossAmountCents ?? 0,
        platformFeeCents: option.platformFeeCents as number,
        refundedAmountCents,
        currency: option.currency ?? "EUR",
        earnedFromAt: paymentTransaction?.paid_at ?? option.createdAt,
        availableAt: option.availableAt,
        statusKey: incomeStatus.key,
        statusLabel: incomeStatus.label,
        providerName: option.providerName,
        offerName: option.courseTitle,
      };
    });
  const refundRows = (businessRefundsRaw.data ?? []).map((refund): BusinessRefundRow => {
    const option = simulationOptionByPaymentTransactionId.get(refund.payment_transaction_id);
    const refundStatus = mapRefundStatus(refund.status);

    return {
      refundRecordId: refund.id,
      bookingId: option?.bookingId ?? null,
      date: refund.updated_at ?? refund.created_at,
      offer: option?.courseTitle ?? "Angebot",
      customer: option?.customerName ?? "Kund*in",
      amountCents: refund.amount_cents,
      currency: option?.currency ?? "EUR",
      reason: refund.reason,
      statusKey: refundStatus.key,
      statusLabel: refundStatus.label,
      providerName: option?.providerName ?? "Anbieter*in",
      offerName: option?.courseTitle ?? "Angebot",
    };
  });
  const providerFilterOptions = Array.from(
    new Set(simulationOptions.map((option) => option.providerName).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "de"));
  const offerFilterOptions = Array.from(
    new Set(simulationOptions.map((option) => option.courseTitle).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "de"));
  const matchesCommonBusinessFilters = (row: {
    providerName: string;
    offerName: string;
    statusKey: string;
  }) => {
    if (providerFilter !== "all" && row.providerName !== providerFilter) return false;
    if (offerFilter !== "all" && row.offerName !== offerFilter) return false;
    if (businessStatusFilter !== "all" && row.statusKey !== businessStatusFilter) return false;
    return true;
  };
  const filteredCustomerPaymentRows = customerPaymentRows.filter(matchesCommonBusinessFilters);
  const filteredProviderPayoutRows = providerPayoutRows.filter(matchesCommonBusinessFilters);
  const filteredRefundRows = refundRows.filter(matchesCommonBusinessFilters);
  const filteredReserIncomeRows = reserIncomeRows.filter(matchesCommonBusinessFilters);
  const summaryTotals = {
    customerPaymentsCents: filteredCustomerPaymentRows.reduce((sum, row) => sum + row.grossCents, 0),
    pendingProviderPayoutsCents: filteredProviderPayoutRows
      .filter((row) => row.statusKey === "vorgemerkt")
      .reduce((sum, row) => sum + row.providerShareCents, 0),
    readyOrPaidProviderPayoutsCents: filteredProviderPayoutRows
      .filter((row) => ["reduziert", "auszahlbar", "in_auszahlung", "ausgezahlt"].includes(row.statusKey))
      .reduce((sum, row) => sum + row.providerShareCents, 0),
    reserFeesCents: filteredReserIncomeRows
      .filter((row) => row.statusKey === "verdient" || row.statusKey === "reduziert")
      .reduce((sum, row) => sum + row.platformFeeCents, 0),
    refundsCents: filteredRefundRows
      .filter((row) => row.statusKey !== "fehlgeschlagen" && row.statusKey !== "storniert")
      .reduce((sum, row) => sum + row.amountCents, 0),
  };

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

        <ActionNotice
          action={sp.action}
          checkedCount={sp.checkedCount}
          customerReceiptDocumentId={sp.customerReceiptDocumentId}
          customerReceiptPdfPath={sp.customerReceiptPdfPath}
          customerReceiptPdfGenerated={sp.customerReceiptPdfGenerated}
          customerReceiptPdfWarning={sp.customerReceiptPdfWarning}
          documentRawErrorMessage={sp.documentRawErrorMessage}
          documentStep={sp.documentStep}
          documentSupabaseCode={sp.documentSupabaseCode}
          documentSupabaseMessage={sp.documentSupabaseMessage}
          errorCode={sp.errorCode}
          ledgerEntryId={sp.ledgerEntryId}
          markedCount={sp.markedCount}
          message={sp.message}
          paymentTransactionId={sp.paymentTransactionId}
          platformRevenueStatementDocumentId={sp.platformRevenueStatementDocumentId}
          platformRevenueStatementPdfPath={sp.platformRevenueStatementPdfPath}
          platformRevenueStatementPdfGenerated={sp.platformRevenueStatementPdfGenerated}
          platformRevenueStatementPdfWarning={sp.platformRevenueStatementPdfWarning}
          payoutItemRawErrorMessage={sp.payoutItemRawErrorMessage}
          payoutItemStep={sp.payoutItemStep}
          payoutItemSupabaseCode={sp.payoutItemSupabaseCode}
          payoutItemSupabaseMessage={sp.payoutItemSupabaseMessage}
          payoutMethod={sp.payoutMethod}
          payoutProvider={sp.payoutProvider}
          providerPlatformFeeInvoiceDocumentId={sp.providerPlatformFeeInvoiceDocumentId}
          providerPlatformFeeInvoicePdfPath={sp.providerPlatformFeeInvoicePdfPath}
          providerPlatformFeeInvoicePdfGenerated={sp.providerPlatformFeeInvoicePdfGenerated}
          providerPlatformFeeInvoicePdfWarning={sp.providerPlatformFeeInvoicePdfWarning}
          providerPayoutStatementDocumentId={sp.providerPayoutStatementDocumentId}
          providerPayoutStatementPdfPath={sp.providerPayoutStatementPdfPath}
          providerPayoutStatementPdfGenerated={sp.providerPayoutStatementPdfGenerated}
          providerPayoutStatementPdfWarning={sp.providerPayoutStatementPdfWarning}
          rawErrorMessage={sp.rawErrorMessage}
          step={sp.step}
          supabaseCode={sp.supabaseCode}
          supabaseMessage={sp.supabaseMessage}
          usedFallbackPayoutProfile={sp.usedFallbackPayoutProfile}
        />

        <Section
          title="Test-/Simulationsbuchung auswaehlen"
          description="Interne Workshop-Simulationen und Stripe-Testbuchungen serverseitig laden, auswaehlen und den Payment-/Ledger-Kontext ohne UUID-Suche einsehen."
        >
          <div className="space-y-4">
            <form action={PAYMENTS_V2_ADMIN_PATH} className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto]">
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Zeitraum</span>
                <select
                  name="simulationWindow"
                  defaultValue={simulationWindow}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="today">Heute</option>
                  <option value="last7">Letzte 7 Tage</option>
                  <option value="all">Alle Test-/Simulationsbuchungen</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
                  Test-/Simulationsbuchung
                </span>
                <select
                  name="selectedBookingId"
                  defaultValue={selectedSimulationOption?.bookingId ?? ""}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="">Bitte Test-/Simulationsbuchung auswaehlen</option>
                  {simulationOptions.map((option) => (
                    <option key={option.bookingId} value={option.bookingId}>
                      {formatSimulationOptionLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Kontext laden
                </button>
              </div>
            </form>

            {simulationOptions.length === 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Keine Test-/Simulationsbuchungen im gewaehlten Zeitraum gefunden.
              </div>
            ) : null}

            {invalidSelectedBooking ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Die ausgewaehlte Test-/Simulationsbuchung ist im aktuellen Zeitraum nicht verfuegbar oder ungueltig.
              </div>
            ) : null}

            {selectedSimulationOption ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="space-y-1 text-sm text-slate-700">
                    <div className="font-semibold text-slate-900">Buchung</div>
                    <div>booking_id: {selectedSimulationOption.bookingId}</div>
                    <div>payment_transaction_id: {selectedSimulationOption.paymentTransactionId ?? "-"}</div>
                    <div>ledger_entry_id: {selectedSimulationOption.ledgerEntryId ?? "-"}</div>
                    <div>payout_batch_id: {selectedSimulationOption.payoutBatchId ?? "-"}</div>
                    <div>Quelle: {selectedSimulationOption.sourceLabel}</div>
                  </div>
                  <div className="space-y-1 text-sm text-slate-700">
                    <div className="font-semibold text-slate-900">Kontext</div>
                    <div>Angebot: {selectedSimulationOption.courseTitle}</div>
                    <div>Anbieter*in: {selectedSimulationOption.providerName}</div>
                    <div>Kund*in: {selectedSimulationOption.customerName}</div>
                    <div>Status: {selectedSimulationOption.bookingStatus ?? "-"}</div>
                    <div>Erstellt: {formatDateTime(selectedSimulationOption.createdAt)}</div>
                  </div>
                  <div className="space-y-1 text-sm text-slate-700">
                    <div className="font-semibold text-slate-900">Payment / Ledger</div>
                    <div>
                      Brutto:{" "}
                      {selectedSimulationOption.grossAmountCents === null
                        ? "-"
                        : formatMoney(
                            selectedSimulationOption.grossAmountCents,
                            selectedSimulationOption.currency ?? "EUR"
                          )}
                    </div>
                    <div>
                      RESER-Provision:{" "}
                      {selectedSimulationOption.platformFeeCents === null
                        ? "-"
                        : formatMoney(
                            selectedSimulationOption.platformFeeCents,
                            selectedSimulationOption.currency ?? "EUR"
                          )}
                    </div>
                    <div>
                      Anbieteranteil:{" "}
                      {selectedSimulationOption.netAmountCents === null
                        ? "-"
                        : formatMoney(selectedSimulationOption.netAmountCents, selectedSimulationOption.currency ?? "EUR")}
                    </div>
                    <div>available_at: {formatDateTime(selectedSimulationOption.availableAt)}</div>
                    <div>payout_status: {selectedSimulationOption.payoutStatus ?? "-"}</div>
                    <div>
                      provider_payout_profile vorhanden:{" "}
                      {selectedSimulationOption.providerPayoutProfileId ? "ja" : "nein"}
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-4">
                  <form action={simulateWorkshopCompletionForPayoutAction} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <input type="hidden" name="ledgerEntryId" value={selectedSimulationOption.ledgerEntryId ?? ""} />
                    <input type="hidden" name="selectedBookingId" value={selectedSimulationOption.bookingId} />
                    <input type="hidden" name="simulationWindow" value={simulationWindow} />
                    <input type="hidden" name="providerFilter" value={providerFilter} />
                    <input type="hidden" name="offerFilter" value={offerFilter} />
                    <input type="hidden" name="businessStatus" value={businessStatusFilter} />
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Optional: 24h nach Workshop simulieren</div>
                        <div className="mt-1 text-xs text-slate-700">
                          Gibt den relevanten Anbieterbetrag intern frei. In der Businesssicht bleibt der Status fuer einmalige Angebote bis zur Auszahlung vorgemerkt.
                        </div>
                      </div>
                      <button
                        type="submit"
                        className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                      >
                        24h nach Workshop simulieren
                      </button>
                    </div>
                  </form>

                  <form action={simulateSelectedWorkshopPayoutAction} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <input type="hidden" name="ledgerEntryId" value={selectedSimulationOption.ledgerEntryId ?? ""} />
                    <input type="hidden" name="selectedBookingId" value={selectedSimulationOption.bookingId} />
                    <input type="hidden" name="simulationWindow" value={simulationWindow} />
                    <input type="hidden" name="providerFilter" value={providerFilter} />
                    <input type="hidden" name="offerFilter" value={offerFilter} />
                    <input type="hidden" name="businessStatus" value={businessStatusFilter} />
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Workshop abgeschlossen - Auszahlung simulieren</div>
                        <div className="mt-1 text-xs text-slate-700">
                          Simuliert bei Bedarf zuerst die 24h-Freigabe und fuehrt danach fuer genau diese Buchung die interne Auszahlung aus.
                        </div>
                      </div>
                      <button
                        type="submit"
                        className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                      >
                        24h nach Workshop simulieren & Auszahlung ausfuehren
                      </button>
                    </div>
                  </form>

                  <form action={simulateWorkshopCancellationAction} className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                    <input type="hidden" name="bookingId" value={selectedSimulationOption.bookingId} />
                    <input type="hidden" name="selectedBookingId" value={selectedSimulationOption.bookingId} />
                    <input type="hidden" name="simulationWindow" value={simulationWindow} />
                    <input type="hidden" name="providerFilter" value={providerFilter} />
                    <input type="hidden" name="offerFilter" value={offerFilter} />
                    <input type="hidden" name="businessStatus" value={businessStatusFilter} />
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Alternative: Anbieter*in storniert / vollstaendig erstatten</div>
                        <div className="mt-1 text-xs text-slate-700">
                          Nutzt den bestehenden Refund-/Storno-Simulationspfad, ohne echte Rueckzahlung und ohne Mail.
                        </div>
                      </div>
                      <button
                        type="submit"
                        className="inline-flex rounded-xl bg-rose-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-800"
                      >
                        Storno + Rueckzahlung simulieren
                      </button>
                    </div>
                  </form>

                  <form
                    action={simulateWorkshopCustomerCancellationAction}
                    className="rounded-2xl border border-sky-200 bg-sky-50 p-4"
                  >
                    <input type="hidden" name="bookingId" value={selectedSimulationOption.bookingId} />
                    <input type="hidden" name="selectedBookingId" value={selectedSimulationOption.bookingId} />
                    <input type="hidden" name="simulationWindow" value={simulationWindow} />
                    <input type="hidden" name="providerFilter" value={providerFilter} />
                    <input type="hidden" name="offerFilter" value={offerFilter} />
                    <input type="hidden" name="businessStatus" value={businessStatusFilter} />
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Kund*innenstorno simulieren</div>
                        <div className="mt-1 text-xs text-slate-700">
                          Nutzt die Workshop-Stornoregel, simuliert Teilrefunds intern und verschickt keine Mail.
                        </div>
                      </div>
                      {selectedCustomerCancellationPreview ? (
                        <div className="space-y-1 rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs text-slate-700">
                          <div>Bruttozahlung: {formatMoney(selectedSimulationOption.amountCents ?? 0, selectedSimulationOption.currency ?? "EUR")}</div>
                          <div>Refund an Kund*in: {formatMoney(selectedCustomerCancellationPreview.refund_amount_cents, selectedSimulationOption.currency ?? "EUR")}</div>
                          <div>Verbleibender Restbetrag: {formatMoney(selectedCustomerCancellationPreview.retained_amount_cents, selectedSimulationOption.currency ?? "EUR")}</div>
                          <div>Anbieteranteil aus Restbetrag: {formatMoney(selectedCustomerCancellationPreview.providerShareCents, selectedSimulationOption.currency ?? "EUR")}</div>
                          <div>RESER-Provision aus Restbetrag: {formatMoney(selectedCustomerCancellationPreview.reserFeeCents, selectedSimulationOption.currency ?? "EUR")}</div>
                          <div>Verwendete Stornoregel: {selectedCustomerCancellationPreview.matched_policy}</div>
                          <div>Erklaerung: {selectedCustomerCancellationPreview.explanation}</div>
                          <div className="pt-1 text-slate-500">
                            Beispiele: 100 % Refund {"->"} Anbieter 0 EUR, RESER 0 EUR. 50 % Refund {"->"} Restbetrag wird gesplittet.
                            0 % Refund {"->"} volle Aufteilung bleibt.
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-amber-200 bg-amber-100 px-3 py-2 text-xs text-amber-900">
                          {selectedCustomerCancellationPreviewError ?? "Kund*innenstorno-Vorschau ist fuer diese Buchung noch nicht verfuegbar."}
                        </div>
                      )}
                      <button
                        type="submit"
                        className="inline-flex rounded-xl bg-sky-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-800"
                        disabled={!selectedCustomerCancellationPreview}
                      >
                        Kund*innenstorno ausfuehren
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}
          </div>
        </Section>

        <Section
          title="Geldfluss - einmalige Angebote"
          description="Einfache Admin-Uebersicht fuer Kundenzahlungen, Anbieter-Auszahlungen, Rueckzahlungen und RESER-Einnahmen auf Basis bestehender Simulationen fuer Workshops und einmalige Angebote."
        >
          <div className="space-y-6">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Aktuell interne Simulationen und Stripe-Testbuchungen fuer einmalige Angebote. Live-Stripe-Buchungen werden hier nicht als Simulation gelistet.
            </div>

            <form action={PAYMENTS_V2_ADMIN_PATH} className="grid gap-3 md:grid-cols-4 xl:grid-cols-5">
              <input type="hidden" name="selectedBookingId" value={selectedSimulationOption?.bookingId ?? ""} />
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Zeitraum</span>
                <select
                  name="simulationWindow"
                  defaultValue={simulationWindow}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="today">Heute</option>
                  <option value="last7">Letzte 7 Tage</option>
                  <option value="all">Alle Test-/Simulationsbuchungen</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Anbieter*in</span>
                <select
                  name="providerFilter"
                  defaultValue={providerFilter}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="all">Alle</option>
                  {providerFilterOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Angebot</span>
                <select
                  name="offerFilter"
                  defaultValue={offerFilter}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="all">Alle</option>
                  {offerFilterOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">Status</span>
                <select
                  name="businessStatus"
                  defaultValue={businessStatusFilter}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="all">Alle</option>
                  <option value="bezahlt">Bezahlt</option>
                  <option value="nicht_erstattet">Nicht erstattet</option>
                  <option value="teilweise_erstattet">Teilweise erstattet</option>
                  <option value="offen">Offen</option>
                  <option value="fehlgeschlagen">Fehlgeschlagen</option>
                  <option value="erstattet">Erstattet</option>
                  <option value="reduziert">Reduziert</option>
                  <option value="vorgemerkt">Vorgemerkt</option>
                  <option value="in_auszahlung">In Auszahlung</option>
                  <option value="ausgezahlt">Ausgezahlt</option>
                  <option value="storniert">Storniert/Gesperrt</option>
                  <option value="verdient">Verdient</option>
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Uebersicht filtern
                </button>
              </div>
            </form>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm text-slate-600">Kundenzahlungen gesamt</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {formatMoney(summaryTotals.customerPaymentsCents, "EUR")}
                </div>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm text-slate-600">Vorgemerkte Anbieter-Auszahlungen</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {formatMoney(summaryTotals.pendingProviderPayoutsCents, "EUR")}
                </div>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm text-slate-600">Bereits auszahlbar/ausgezahlt</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {formatMoney(summaryTotals.readyOrPaidProviderPayoutsCents, "EUR")}
                </div>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm text-slate-600">RESER-Provision gesamt</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {formatMoney(summaryTotals.reserFeesCents, "EUR")}
                </div>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm text-slate-600">Rueckzahlungen gesamt</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {formatMoney(summaryTotals.refundsCents, "EUR")}
                </div>
              </article>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3">
                  <h3 className="text-base font-semibold text-slate-900">Kundenzahlungen</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Datum</th>
                        <th className="px-3 py-2">Angebot</th>
                        <th className="px-3 py-2">Anbieter*in</th>
                        <th className="px-3 py-2">Kund*in</th>
                        <th className="px-3 py-2">Brutto bezahlt</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Zahlungsart</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomerPaymentRows.map((row) => (
                        <tr key={row.paymentTransactionId} className="border-b border-slate-100 align-top">
                          <td className="px-3 py-3 text-xs text-slate-600">{formatDateTime(row.date)}</td>
                          <td className="px-3 py-3 text-sm text-slate-900">
                            <div>{row.offer}</div>
                            <div className="text-xs text-slate-500">booking_id: {shortenId(row.bookingId)}</div>
                          </td>
                          <td className="px-3 py-3 text-sm text-slate-700">{row.provider}</td>
                          <td className="px-3 py-3 text-sm text-slate-700">{row.customer}</td>
                          <td className="px-3 py-3 font-medium text-slate-900">{formatMoney(row.grossCents, row.currency)}</td>
                          <td className="px-3 py-3"><BusinessStatusBadge label={row.statusLabel} statusKey={row.statusKey} /></td>
                          <td className="px-3 py-3 text-xs text-slate-600">{row.paymentProvider}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3">
                  <h3 className="text-base font-semibold text-slate-900">Auszahlungen an Anbieter*innen</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Angebot</th>
                        <th className="px-3 py-2">Anbieter*in</th>
                        <th className="px-3 py-2">Anbieteranteil</th>
                        <th className="px-3 py-2">Auszahlbar ab</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProviderPayoutRows.map((row) => (
                        <tr key={row.ledgerEntryId} className="border-b border-slate-100 align-top">
                          <td className="px-3 py-3 text-sm text-slate-900">
                            <div>{row.offer}</div>
                            <div className="text-xs text-slate-500">payout_batch_id: {shortenId(row.payoutBatchId)}</div>
                          </td>
                          <td className="px-3 py-3 text-sm text-slate-700">{row.provider}</td>
                          <td className="px-3 py-3 font-medium text-slate-900">
                            {formatMoney(row.providerShareCents, row.currency)}
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-600">{formatDateTime(row.availableAt)}</td>
                          <td className="px-3 py-3"><BusinessStatusBadge label={row.statusLabel} statusKey={row.statusKey} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3">
                  <h3 className="text-base font-semibold text-slate-900">Rueckzahlungen an Kund*innen</h3>
                </div>
                {filteredRefundRows.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Noch keine Rueckzahlungen vorhanden.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Datum</th>
                          <th className="px-3 py-2">Angebot</th>
                          <th className="px-3 py-2">Kund*in</th>
                          <th className="px-3 py-2">Betrag</th>
                          <th className="px-3 py-2">Grund/Typ</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRefundRows.map((row) => (
                          <tr key={row.refundRecordId} className="border-b border-slate-100 align-top">
                            <td className="px-3 py-3 text-xs text-slate-600">{formatDateTime(row.date)}</td>
                            <td className="px-3 py-3 text-sm text-slate-900">
                              <div>{row.offer}</div>
                              <div className="text-xs text-slate-500">refund_record_id: {shortenId(row.refundRecordId)}</div>
                            </td>
                            <td className="px-3 py-3 text-sm text-slate-700">{row.customer}</td>
                            <td className="px-3 py-3 font-medium text-rose-700">-{formatMoney(row.amountCents, row.currency)}</td>
                            <td className="px-3 py-3 text-sm text-slate-700">{row.reason ?? "Refund/Storno"}</td>
                            <td className="px-3 py-3"><BusinessStatusBadge label={row.statusLabel} statusKey={row.statusKey} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3">
                  <h3 className="text-base font-semibold text-slate-900">RESER-Einnahmen</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Angebot</th>
                        <th className="px-3 py-2">Anbieter*in</th>
                        <th className="px-3 py-2">Brutto</th>
                        <th className="px-3 py-2">RESER-Provision</th>
                        <th className="px-3 py-2">Entstanden ab / verfuegbar ab</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReserIncomeRows.map((row) => (
                        <tr key={row.ledgerEntryId} className="border-b border-slate-100 align-top">
                          <td className="px-3 py-3 text-sm text-slate-900">{row.offer}</td>
                          <td className="px-3 py-3 text-sm text-slate-700">{row.provider}</td>
                          <td className="px-3 py-3 font-medium text-slate-900">{formatMoney(row.grossCents, row.currency)}</td>
                          <td className="px-3 py-3 font-medium text-slate-900">
                            {formatMoney(row.platformFeeCents, row.currency)}
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-600">
                            <div>entstanden: {formatDateTime(row.earnedFromAt)}</div>
                            <div>verfuegbar: {formatDateTime(row.availableAt)}</div>
                          </td>
                          <td className="px-3 py-3"><BusinessStatusBadge label={row.statusLabel} statusKey={row.statusKey} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        </Section>

        <Section
          title="Technische Details / Audit"
          description="Bestehende technische Kontrollansichten fuer Payment Transactions, Ledger, Batches, Items und Webhooks."
        >
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Diese Bereiche bleiben fuer Debugging erhalten und zeigen weiterhin technische Referenzen.
          </div>
        </Section>

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
                  <TextInput
                    name="bookingId"
                    label="booking_id"
                    placeholder="uuid"
                    defaultValue={selectedSimulationOption?.bookingId ?? ""}
                  />
                  <TextInput name="amountCents" label="Betrag in Cent optional" placeholder="z. B. 4900" />
                  <TextInput name="currency" label="Waehrung optional" placeholder="EUR" />
                  <TextInput name="scenarioNote" label="Scenario Note optional" placeholder="Kurznotiz" />
                </SimulationForm>

                <SimulationForm
                  action={simulateWorkshopPaymentFailedAction}
                  title="Zahlung fehlgeschlagen simulieren"
                  description="Erzeugt eine interne failed payment_transaction ohne positiven Ledger-Eintrag."
                >
                  <TextInput
                    name="bookingId"
                    label="booking_id"
                    placeholder="uuid"
                    defaultValue={selectedSimulationOption?.bookingId ?? ""}
                  />
                  <TextInput name="amountCents" label="Betrag in Cent optional" placeholder="z. B. 4900" />
                  <TextInput name="currency" label="Waehrung optional" placeholder="EUR" />
                  <TextInput name="scenarioNote" label="Scenario Note optional" placeholder="Kurznotiz" />
                </SimulationForm>

                <SimulationForm
                  action={simulateWorkshopRefundAction}
                  title="Refund simulieren"
                  description="Erzeugt einen internen succeeded Refund fuer eine simulierte Workshop-Zahlung. booking_id oder payment_transaction_id angeben."
                >
                  <TextInput
                    name="bookingId"
                    label="booking_id optional"
                    placeholder="uuid"
                    defaultValue={selectedSimulationOption?.bookingId ?? ""}
                  />
                  <TextInput
                    name="paymentTransactionId"
                    label="payment_transaction_id optional"
                    placeholder="uuid"
                    defaultValue={selectedSimulationOption?.paymentTransactionId ?? ""}
                  />
                  <TextInput name="refundAmountCents" label="Refund in Cent optional" placeholder="z. B. 4900" />
                  <TextInput name="reason" label="Grund optional" placeholder="Refund reason" />
                </SimulationForm>

                <SimulationForm
                  action={simulateWorkshopCancellationAction}
                  title="Workshop-Storno simulieren"
                  description="Bezahlte Simulationen werden ueber den Refund-Pfad abgewickelt. Unbezahlte Faelle werden nur intern als cancelled simuliert."
                >
                  <TextInput
                    name="bookingId"
                    label="booking_id"
                    placeholder="uuid"
                    defaultValue={selectedSimulationOption?.bookingId ?? ""}
                  />
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

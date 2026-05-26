"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createSimulatedPaidPayoutForLedgerEntry,
  createSimulatedPayoutBatch,
  type SimulatedPayoutIssue,
  SimulatedPayoutError,
} from "@/lib/payments/payout-batches";
import {
  forceLedgerEntryPayableForTest,
  markEligibleLedgerEntriesAsPayable,
  simulateLedgerEntryPayableForSelectedBooking,
} from "@/lib/payments/payout-eligibility";
import { PaymentSimulationError, requirePaymentsV2SimulationAccess } from "@/lib/payments/simulation";
import {
  simulateWorkshopCancellation,
  simulateWorkshopCustomerCancellation,
  simulateWorkshopPaymentFailed,
  simulateWorkshopPaymentSuccess,
  simulateWorkshopRefund,
} from "@/lib/payments/simulation/workshop-simulation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePaymentsV2AdminAccess } from "./access";
import { PAYMENTS_V2_ADMIN_PATH } from "./ui";

function redirectWithActionState(actionState: string) {
  redirect(`${PAYMENTS_V2_ADMIN_PATH}?action=${encodeURIComponent(actionState)}`);
}

function redirectWithParams(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  redirect(`${PAYMENTS_V2_ADMIN_PATH}?${search.toString()}`);
}

function isNextRedirectError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function getIssueParams(prefix: string, issue: SimulatedPayoutIssue | null | undefined): Record<string, string> {
  if (!issue) {
    return {};
  }

  return compactParams({
    [`${prefix}Step`]: issue.step,
    [`${prefix}SupabaseCode`]: issue.supabaseCode,
    [`${prefix}SupabaseMessage`]: issue.supabaseMessage,
    [`${prefix}RawErrorMessage`]: issue.rawErrorMessage,
  });
}

function getErrorDetails(error: unknown): {
  code: string;
  message: string;
  step: string;
  supabaseCode: string | null;
  supabaseMessage: string | null;
  rawErrorMessage: string;
} {
  if (error instanceof SimulatedPayoutError) {
    return {
      code: error.supabaseCode ?? "simulation_payout_error",
      message: error.message || "Unbekannter Fehler.",
      step: error.step,
      supabaseCode: error.supabaseCode,
      supabaseMessage: error.supabaseMessage,
      rawErrorMessage: error.rawErrorMessage,
    };
  }

  if (error instanceof Error) {
    const code =
      "code" in error && typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : "unknown";
    return {
      code,
      message: error.message || "Unbekannter Fehler.",
      step:
        "step" in error && typeof (error as { step?: unknown }).step === "string"
          ? (error as { step: string }).step
          : "unknown",
      supabaseCode:
        "supabaseCode" in error && typeof (error as { supabaseCode?: unknown }).supabaseCode === "string"
          ? (error as { supabaseCode: string }).supabaseCode
          : null,
      supabaseMessage:
        "supabaseMessage" in error && typeof (error as { supabaseMessage?: unknown }).supabaseMessage === "string"
          ? (error as { supabaseMessage: string }).supabaseMessage
          : null,
      rawErrorMessage: error.message || "Unbekannter Fehler.",
    };
  }

  return {
    code: "unknown",
    message: String(error),
    step: "unknown",
    supabaseCode: null,
    supabaseMessage: null,
    rawErrorMessage: String(error),
  };
}

export async function markEligibleLedgerEntriesAsPayableAction() {
  await requirePaymentsV2AdminAccess();

  try {
    const result = await markEligibleLedgerEntriesAsPayable();
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithParams(
      result.markedCount > 0
        ? {
            action: "eligible-ok",
            markedCount: String(result.markedCount),
            checkedCount: String(result.checkedCount),
          }
        : {
            action: "eligible-none",
            checkedCount: String(result.checkedCount),
            message: "Keine passenden Ledger-Eintraege gefunden.",
          }
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    const details = getErrorDetails(error);
    console.error("[payments-v2] markEligibleLedgerEntriesAsPayable failed", details);
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithParams({
      action: "eligible-error",
      errorCode: details.code,
      message: details.message,
    });
  }
}

export async function createSimulatedPayoutBatchAction() {
  await requirePaymentsV2AdminAccess();

  try {
    const result = await createSimulatedPayoutBatch();
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithActionState(
      result.batchCount > 0
        ? `batch-ok-${result.batchCount}-${result.itemCount}`
        : `batch-none-${result.consideredCount}`
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithActionState("batch-error");
  }
}

export async function forceLedgerEntryPayableForTestAction(formData: FormData) {
  await requirePaymentsV2AdminAccess();

  const ledgerEntryId = String(formData.get("ledgerEntryId") ?? "").trim();

  try {
    const updated = await forceLedgerEntryPayableForTest(ledgerEntryId);
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithParams(
      updated
        ? {
            action: "force-payable-ok",
            ledgerEntryId,
          }
        : {
            action: "force-payable-none",
            ledgerEntryId,
            message: "Keine passenden Ledger-Eintraege gefunden.",
          }
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    const details = getErrorDetails(error);
    console.error("[payments-v2] forceLedgerEntryPayableForTest failed", {
      ledgerEntryId,
      ...details,
    });
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithParams({
      action: "force-payable-error",
      ledgerEntryId,
      errorCode: details.code,
      message: details.message,
    });
  }
}

function parseOptionalAmountCents(value: FormDataEntryValue | null): number | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed);
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function compactParams(input: Record<string, string | null | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] => Boolean(entry[1]))
  );
}

function readPaymentsV2ContextParams(formData: FormData): Record<string, string> {
  return compactParams({
    selectedBookingId: parseOptionalString(formData.get("selectedBookingId")),
    simulationWindow: parseOptionalString(formData.get("simulationWindow")),
    providerFilter: parseOptionalString(formData.get("providerFilter")),
    offerFilter: parseOptionalString(formData.get("offerFilter")),
    businessStatus: parseOptionalString(formData.get("businessStatus")),
  });
}

function redirectWithSimulationError(prefix: string, error: unknown) {
  if (error instanceof PaymentSimulationError) {
    redirectWithActionState(`${prefix}-error-${error.code}`);
    return;
  }

  redirectWithActionState(`${prefix}-error-unknown`);
}

export async function simulateWorkshopCompletionForPayoutAction(formData: FormData) {
  await requirePaymentsV2AdminAccess();

  const ledgerEntryId = String(formData.get("ledgerEntryId") ?? "").trim();
  const contextParams = readPaymentsV2ContextParams(formData);

  try {
    const result = await simulateLedgerEntryPayableForSelectedBooking({
      ledgerEntryId,
    });
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithParams({
      ...contextParams,
      action: result.updated ? "selected-workshop-ready-ok" : "selected-workshop-ready-none",
      ledgerEntryId,
      message: result.updated
        ? "Workshop abgeschlossen + 24h wurde simuliert. Die Auszahlung kann jetzt intern ausgefuehrt werden."
        : "Keine passenden Ledger-Eintraege gefunden.",
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    const details = getErrorDetails(error);
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithParams({
      ...contextParams,
      action: "selected-workshop-ready-error",
      ledgerEntryId,
      errorCode: details.code,
      message: details.message,
    });
  }
}

export async function simulateSelectedWorkshopPayoutAction(formData: FormData) {
  await requirePaymentsV2AdminAccess();

  const ledgerEntryId = String(formData.get("ledgerEntryId") ?? "").trim();
  const contextParams = readPaymentsV2ContextParams(formData);

  try {
    const admin = createSupabaseAdmin();
    const { data: currentLedger, error: currentLedgerError } = await admin
      .from("ledger_entries")
      .select("id,payout_status,payout_batch_id")
      .eq("id", ledgerEntryId)
      .maybeSingle<{ id: string; payout_status: string | null; payout_batch_id: string | null }>();

    if (currentLedgerError) {
      throw Object.assign(new Error("Ledger-Eintrag konnte vor der Auszahlung nicht geladen werden"), {
        step: "load_ledger_entry_before_workshop_payout",
        supabaseCode:
          "code" in currentLedgerError && typeof currentLedgerError.code === "string" ? currentLedgerError.code : null,
        supabaseMessage:
          "message" in currentLedgerError && typeof currentLedgerError.message === "string"
            ? currentLedgerError.message
            : null,
      });
    }

    if (
      currentLedger?.id &&
      currentLedger.payout_batch_id === null &&
      (currentLedger.payout_status === "pending" || currentLedger.payout_status === "pending_event_completion")
    ) {
      const { error: updateReadyError } = await admin
        .from("ledger_entries")
        .update({
          payout_status: "payable",
          available_at: new Date().toISOString(),
        })
        .eq("id", currentLedger.id)
        .in("payout_status", ["pending", "pending_event_completion"])
        .is("payout_batch_id", null);

      if (updateReadyError) {
        throw Object.assign(new Error("Workshop-24h-Simulation konnte nicht auf payable vorbereitet werden"), {
          step: "prepare_workshop_payout_after_24h",
          supabaseCode:
            "code" in updateReadyError && typeof updateReadyError.code === "string" ? updateReadyError.code : null,
          supabaseMessage:
            "message" in updateReadyError && typeof updateReadyError.message === "string"
              ? updateReadyError.message
              : null,
        });
      }
    }

    const result = await createSimulatedPaidPayoutForLedgerEntry({
      ledgerEntryId,
    });
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithParams({
      ...contextParams,
      action: "selected-payout-ok",
      ledgerEntryId: result.ledgerEntryId,
      providerPayoutStatementDocumentId: result.providerPayoutStatementDocumentId ?? "",
      providerPayoutStatementPdfPath: result.providerPayoutStatementPdfPath ?? "",
      providerPayoutStatementPdfGenerated: result.providerPayoutStatementPdfGenerated ? "yes" : "no",
      providerPayoutStatementPdfWarning: result.providerPayoutStatementPdfWarning ?? "",
      providerPlatformFeeInvoiceDocumentId: result.providerPlatformFeeInvoiceDocumentId ?? "",
      providerPlatformFeeInvoicePdfPath: result.providerPlatformFeeInvoicePdfPath ?? "",
      providerPlatformFeeInvoicePdfGenerated: result.providerPlatformFeeInvoicePdfGenerated ? "yes" : "no",
      providerPlatformFeeInvoicePdfWarning: result.providerPlatformFeeInvoicePdfWarning ?? "",
      platformRevenueStatementDocumentId: result.platformRevenueStatementDocumentId ?? "",
      platformRevenueStatementPdfPath: result.platformRevenueStatementPdfPath ?? "",
      platformRevenueStatementPdfGenerated: result.platformRevenueStatementPdfGenerated ? "yes" : "no",
      platformRevenueStatementPdfWarning: result.platformRevenueStatementPdfWarning ?? "",
      payoutProvider: result.payoutProvider,
      payoutMethod: result.payoutMethod,
      usedFallbackPayoutProfile: result.usedFallbackPayoutProfile ? "yes" : "no",
      message:
        `Simulierte Auszahlung erstellt. payout_batch_id=${result.batchId}` +
        ` payout_provider=${result.payoutProvider}` +
        ` payout_method=${result.payoutMethod}` +
        ` provider_payout_statement_document_id=${result.providerPayoutStatementDocumentId ?? "missing"}` +
        ` provider_platform_fee_invoice_document_id=${result.providerPlatformFeeInvoiceDocumentId ?? "missing"}` +
        ` platform_revenue_statement_document_id=${result.platformRevenueStatementDocumentId ?? "missing"}`,
      ...getIssueParams("payoutItem", result.payoutItemIssue),
      ...getIssueParams("document", result.documentIssue),
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    const details = getErrorDetails(error);
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithParams({
      ...contextParams,
      action: "selected-payout-error",
      ledgerEntryId,
      errorCode: details.code,
      message: details.message,
      step: details.step,
      supabaseCode: details.supabaseCode ?? "",
      supabaseMessage: details.supabaseMessage ?? "",
      rawErrorMessage: details.rawErrorMessage,
    });
  }
}

export async function simulateWorkshopPaymentSuccessAction(formData: FormData) {
  const user = await requirePaymentsV2SimulationAccess();
  const bookingId = String(formData.get("bookingId") ?? "").trim();

  try {
    const result = await simulateWorkshopPaymentSuccess({
      bookingId,
      adminUserId: user.id,
      amountCents: parseOptionalAmountCents(formData.get("amountCents")),
      currency: parseOptionalString(formData.get("currency")),
      scenarioNote: parseOptionalString(formData.get("scenarioNote")),
    });
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithParams(compactParams({
      action: `workshop-pay-ok-${result.bookingId}`,
      selectedBookingId: result.bookingId,
      paymentTransactionId: result.paymentTransactionId,
      customerReceiptDocumentId: result.customerReceiptDocumentId,
      customerReceiptPdfPath: result.customerReceiptPdfPath ?? "",
      customerReceiptPdfGenerated: result.customerReceiptPdfGenerated ? "yes" : "no",
      customerReceiptPdfWarning: result.customerReceiptPdfWarning ?? "",
      message: result.customerReceiptDocumentId
        ? `customer_receipt_document_id=${result.customerReceiptDocumentId}`
        : "customer_receipt_document_id fehlt",
    }));
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithSimulationError("workshop-pay", error);
  }
}

export async function simulateWorkshopPaymentFailedAction(formData: FormData) {
  const user = await requirePaymentsV2SimulationAccess();
  const bookingId = String(formData.get("bookingId") ?? "").trim();

  try {
    const result = await simulateWorkshopPaymentFailed({
      bookingId,
      adminUserId: user.id,
      amountCents: parseOptionalAmountCents(formData.get("amountCents")),
      currency: parseOptionalString(formData.get("currency")),
      scenarioNote: parseOptionalString(formData.get("scenarioNote")),
    });
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithActionState(`workshop-fail-ok-${result.bookingId}`);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithSimulationError("workshop-fail", error);
  }
}

export async function simulateWorkshopRefundAction(formData: FormData) {
  const user = await requirePaymentsV2SimulationAccess();
  const bookingId = String(formData.get("bookingId") ?? "").trim();
  const paymentTransactionId = String(formData.get("paymentTransactionId") ?? "").trim();
  const contextParams = readPaymentsV2ContextParams(formData);

  try {
    await simulateWorkshopRefund({
      bookingId,
      paymentTransactionId,
      adminUserId: user.id,
      refundAmountCents: parseOptionalAmountCents(formData.get("refundAmountCents")),
      reason: parseOptionalString(formData.get("reason")),
    });
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithParams({
      ...contextParams,
      action: "workshop-refund-selected-ok",
      selectedBookingId: bookingId || contextParams.selectedBookingId,
      message: "Workshop-Testbuchung wurde vollstaendig erstattet.",
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    const details = getErrorDetails(error);
    redirectWithParams({
      ...contextParams,
      action: "workshop-refund-selected-error",
      selectedBookingId: bookingId || contextParams.selectedBookingId,
      errorCode: details.code,
      message: details.message,
    });
  }
}

export async function simulateWorkshopCancellationAction(formData: FormData) {
  const user = await requirePaymentsV2SimulationAccess();
  const bookingId = String(formData.get("bookingId") ?? "").trim();
  const contextParams = readPaymentsV2ContextParams(formData);

  try {
    const result = await simulateWorkshopCancellation({
      bookingId,
      adminUserId: user.id,
      refundAmountCents: parseOptionalAmountCents(formData.get("refundAmountCents")),
      reason: parseOptionalString(formData.get("reason")),
    });
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithParams({
      ...contextParams,
      action: "workshop-cancel-selected-ok",
      selectedBookingId: result.bookingId,
      message: "Workshop wurde simuliert storniert und vollstaendig erstattet.",
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    const details = getErrorDetails(error);
    redirectWithParams({
      ...contextParams,
      action: "workshop-cancel-selected-error",
      selectedBookingId: bookingId || contextParams.selectedBookingId,
      errorCode: details.code,
      message: details.message,
    });
  }
}

export async function simulateWorkshopCustomerCancellationAction(formData: FormData) {
  const user = await requirePaymentsV2SimulationAccess();

  const bookingId = String(formData.get("bookingId") ?? "").trim();
  const contextParams = readPaymentsV2ContextParams(formData);

  try {
    const result = await simulateWorkshopCustomerCancellation({
      bookingId,
      adminUserId: user.id,
    });
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithParams({
      ...contextParams,
      action: "workshop-customer-cancel-selected-ok",
      selectedBookingId: result.bookingId,
      message: `Kund*innenstorno simuliert. refund=${result.refundAmountCents} retained=${result.retainedAmountCents} policy=${result.matchedPolicy}`,
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    const details = getErrorDetails(error);
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithParams({
      ...contextParams,
      action: "workshop-customer-cancel-selected-error",
      selectedBookingId: bookingId,
      errorCode: details.code,
      message: details.message,
    });
  }
}

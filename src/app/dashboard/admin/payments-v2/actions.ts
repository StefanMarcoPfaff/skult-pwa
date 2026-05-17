"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSimulatedPaidPayoutForLedgerEntry, createSimulatedPayoutBatch } from "@/lib/payments/payout-batches";
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

function getErrorDetails(error: unknown): { code: string; message: string } {
  if (error instanceof Error) {
    const code =
      "code" in error && typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : "unknown";
    return {
      code,
      message: error.message || "Unbekannter Fehler.",
    };
  }

  return {
    code: "unknown",
    message: String(error),
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
        ? "Workshop durchgefuehrt + 24h wurde simuliert. Der Anbieterbetrag ist jetzt auszahlbar."
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
    const result = await createSimulatedPaidPayoutForLedgerEntry({
      ledgerEntryId,
    });
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithParams({
      ...contextParams,
      action: "selected-payout-ok",
      ledgerEntryId: result.ledgerEntryId,
      message: `Simulierte Auszahlung erstellt. payout_batch_id=${result.batchId}`,
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
    redirectWithActionState(`workshop-pay-ok-${result.bookingId}`);
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

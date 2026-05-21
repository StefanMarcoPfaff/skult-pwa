"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSimulatedPaidPayoutForLedgerEntry } from "@/lib/payments/payout-batches";
import { PaymentSimulationError, requirePaymentsV2SimulationAccess } from "@/lib/payments/simulation";
import { simulateSubscriptionInitialPaymentSuccess } from "@/lib/payments/simulation/subscription-initial-payment-simulation";
import {
  simulateParticipantSubscriptionCancel,
  simulateParticipantSubscriptionPause,
  simulateSubscriptionCancel,
  simulateSubscriptionPause,
} from "@/lib/payments/simulation/subscription-lifecycle-simulation";
import { simulateSubscriptionRecurringPayment } from "@/lib/payments/simulation/subscription-recurring-payment-simulation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH } from "../ui";

const SUBSCRIPTION_SIMULATION_ACTION_VERSION = "SUBSCRIPTION_SIMULATION_ACTION_VERSION_20260521_PR4";

function redirectWithActionState(actionState: string, params?: Record<string, string | null | undefined>) {
  const search = new URLSearchParams({ action: actionState });
  for (const [key, value] of Object.entries(params ?? {})) {
    if (!value) continue;
    search.set(key, value);
  }
  redirect(`${PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH}?${search.toString()}`);
}

function isNextRedirectError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function compactParams(input: Record<string, string | null | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(input).filter((entry): entry is [string, string] => Boolean(entry[1])));
}

function buildSimulationErrorParams(input: {
  error: unknown;
  step: string;
  contractId?: string | null;
  courseRegistrationIntentId?: string | null;
}) {
  const rawErrorName =
    input.error instanceof Error
      ? input.error.name
      : typeof input.error === "object" && input.error !== null && "name" in input.error
        ? String((input.error as { name?: unknown }).name ?? "")
        : "UnknownError";
  const rawErrorMessage =
    input.error instanceof Error
      ? input.error.message
      : typeof input.error === "object" && input.error !== null && "message" in input.error
        ? String((input.error as { message?: unknown }).message ?? "")
        : typeof input.error === "string"
          ? input.error
          : "Unbekannter Simulationsfehler";
  const supabaseCode =
    typeof input.error === "object" && input.error !== null && "code" in input.error
      ? String((input.error as { code?: unknown }).code ?? "")
      : null;
  const supabaseMessage =
    typeof input.error === "object" && input.error !== null && "message" in input.error
      ? String((input.error as { message?: unknown }).message ?? "")
      : null;

  return compactParams({
    code: input.error instanceof PaymentSimulationError ? input.error.code : "unknown",
    step: input.step,
    rawErrorName,
    rawErrorMessage,
    supabaseCode,
    supabaseMessage,
    actionVersion: SUBSCRIPTION_SIMULATION_ACTION_VERSION,
    contractId: input.contractId,
    courseRegistrationIntentId: input.courseRegistrationIntentId,
  });
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

async function loadLatestSubscriptionLedgerEntryContext(subscriptionContractId: string) {
  const admin = createSupabaseAdmin();
  const { data: contract } = await admin
    .from("subscription_contracts")
    .select("id,course_registration_intent_id")
    .eq("id", subscriptionContractId)
    .maybeSingle<{ id: string; course_registration_intent_id: string | null }>();

  if (!contract?.id || !contract.course_registration_intent_id) {
    throw new Error("Keine Simulations-Subscription mit Intent-Verknuepfung gefunden");
  }

  const { data: transactions } = await admin
    .from("payment_transactions")
    .select("id,course_registration_intent_id,created_at")
    .eq("course_registration_intent_id", contract.course_registration_intent_id)
    .eq("provider", "internal_simulation")
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<Array<{ id: string; course_registration_intent_id: string | null; created_at: string }>>();

  const txList = transactions ?? [];
  if (txList.length === 0) {
    throw new Error("Keine simulierte Zahlung fuer diese Subscription gefunden");
  }

  const txIds = txList.map((tx) => tx.id);
  const txOrder = new Map(txIds.map((txId, index) => [txId, index] as const));
  const { data: ledgerEntries } = await admin
    .from("ledger_entries")
    .select("id,source_id,payout_status,payout_batch_id,available_at,created_at")
    .eq("entry_type", "payment")
    .eq("source_type", "payment_transaction")
    .in("source_id", txIds)
    .returns<
      Array<{
        id: string;
        source_id: string;
        payout_status: string | null;
        payout_batch_id: string | null;
        available_at: string | null;
        created_at: string;
      }>
    >();

  const ledgerEntry = (ledgerEntries ?? [])
    .sort((left, right) => {
      const txIndexDiff = (txOrder.get(left.source_id) ?? 999) - (txOrder.get(right.source_id) ?? 999);
      if (txIndexDiff !== 0) return txIndexDiff;
      return String(right.created_at).localeCompare(String(left.created_at));
    })
    .find((entry) => Boolean(entry.id));

  if (!ledgerEntry?.id) {
    throw new Error("Kein Ledger-Eintrag fuer diese Subscription gefunden");
  }

  return {
    contractId: contract.id,
    courseRegistrationIntentId: contract.course_registration_intent_id,
    ledgerEntryId: ledgerEntry.id,
    payoutStatus: ledgerEntry.payout_status ?? null,
    payoutBatchId: ledgerEntry.payout_batch_id ?? null,
  };
}

export async function simulateSubscriptionInitialPaymentSuccessAction(formData: FormData) {
  const user = await requirePaymentsV2SimulationAccess();
  const courseRegistrationIntentId = String(formData.get("courseRegistrationIntentId") ?? "").trim();

  try {
    const result = await simulateSubscriptionInitialPaymentSuccess({
      courseRegistrationIntentId,
      adminUserId: user.id,
      amountCents: parseOptionalAmountCents(formData.get("amountCents")),
      currency: parseOptionalString(formData.get("currency")),
      paidAt: parseOptionalString(formData.get("paidAt")),
      scenarioNote: parseOptionalString(formData.get("scenarioNote")),
    });
    revalidatePath(PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH);
    redirectWithActionState(`initial-pay-ok-${result.courseRegistrationIntentId}`, {
      courseRegistrationIntentId: result.courseRegistrationIntentId,
      contractId: result.subscriptionContractId,
      contractStartDate: result.contractStartDate,
      fullMonthAmountCents: String(result.firstPaymentBreakdown.full_month_amount_cents),
      firstPaymentAmountCents: String(result.firstPaymentBreakdown.prorated_amount_cents),
      firstPaymentExplanation: result.firstPaymentBreakdown.explanation,
      billableDays: String(result.firstPaymentBreakdown.billable_days),
      daysInMonth: String(result.firstPaymentBreakdown.days_in_month),
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    revalidatePath(PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH);
    redirectWithActionState(
      `initial-pay-error-${error instanceof PaymentSimulationError ? error.code : "unknown"}`,
      buildSimulationErrorParams({
        error,
        step: "initial_payment_simulation",
        courseRegistrationIntentId,
      })
    );
  }
}

export async function simulateSubscriptionRecurringPaymentAction(formData: FormData) {
  const user = await requirePaymentsV2SimulationAccess();
  const subscriptionContractId = String(formData.get("subscriptionContractId") ?? "").trim();

  try {
    const result = await simulateSubscriptionRecurringPayment({
      subscriptionContractId,
      adminUserId: user.id,
      targetMonth: parseOptionalString(formData.get("targetMonth")),
      amountCents: parseOptionalAmountCents(formData.get("amountCents")),
      currency: parseOptionalString(formData.get("currency")),
      paidAt: parseOptionalString(formData.get("paidAt")),
      scenarioNote: parseOptionalString(formData.get("scenarioNote")),
    });
    revalidatePath(PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH);
    redirectWithActionState(
      result.skippedReason
        ? `recurring-pay-skipped-${result.skippedReason}-${result.subscriptionContractId}`
        : `recurring-pay-ok-${result.subscriptionContractId}`,
      {
        selectedContractId: result.subscriptionContractId,
        contractId: result.subscriptionContractId,
        courseRegistrationIntentId: result.courseRegistrationIntentId,
        periodId: result.subscriptionPeriodId,
        chargeId: result.subscriptionChargeId,
        paymentTransactionId: result.paymentTransactionId,
        ledgerEntryId: result.ledgerEntryId,
      }
    );
  } catch (error) {
    revalidatePath(PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH);
    if (error instanceof PaymentSimulationError) {
      redirectWithActionState(`recurring-pay-error-${error.code}`);
    }

    redirectWithActionState("recurring-pay-error-unknown");
  }
}

export async function simulateSubscriptionPauseAction(formData: FormData) {
  const user = await requirePaymentsV2SimulationAccess();
  const subscriptionContractId = String(formData.get("subscriptionContractId") ?? "").trim();

  try {
    const result = await simulateSubscriptionPause({
      subscriptionContractId,
      adminUserId: user.id,
      pauseStartDate: String(formData.get("pauseStartDate") ?? "").trim(),
      pauseEndDate: String(formData.get("pauseEndDate") ?? "").trim(),
      scenarioNote: parseOptionalString(formData.get("scenarioNote")),
      reason: parseOptionalString(formData.get("reason")),
    });
    revalidatePath(PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH);
    redirectWithActionState(`lifecycle-pause-ok-${result.subscriptionContractId}`, {
      selectedContractId: result.subscriptionContractId,
      contractId: result.subscriptionContractId,
      pauseWindowId: result.pauseWindowId,
      eventId: result.eventId,
      lifecycleStatus: result.newStatus,
      renewalBlocked: result.nextRenewalBlocked ? "yes" : "no",
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    revalidatePath(PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH);
    console.error("[subscription-simulation] lifecycle pause failed", { subscriptionContractId, error });
    redirectWithActionState(
      `lifecycle-pause-error-${error instanceof PaymentSimulationError ? error.code : "unknown"}`,
      buildSimulationErrorParams({
        error,
        step: "pause_simulation",
        contractId: subscriptionContractId,
      })
    );
  }
}

export async function simulateSubscriptionCancelAction(formData: FormData) {
  const user = await requirePaymentsV2SimulationAccess();
  const subscriptionContractId = String(formData.get("subscriptionContractId") ?? "").trim();

  try {
    const result = await simulateSubscriptionCancel({
      subscriptionContractId,
      adminUserId: user.id,
      cancelEffectiveDate: String(formData.get("cancelEffectiveDate") ?? "").trim(),
      scenarioNote: parseOptionalString(formData.get("scenarioNote")),
      reason: parseOptionalString(formData.get("reason")),
    });
    revalidatePath(PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH);
    redirectWithActionState(`lifecycle-cancel-ok-${result.subscriptionContractId}`, {
      selectedContractId: result.subscriptionContractId,
      contractId: result.subscriptionContractId,
      eventId: result.eventId,
      lifecycleStatus: result.newStatus,
      renewalBlocked: result.nextRenewalBlocked ? "yes" : "no",
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    revalidatePath(PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH);
    console.error("[subscription-simulation] lifecycle cancel failed", { subscriptionContractId, error });
    redirectWithActionState(
      `lifecycle-cancel-error-${error instanceof PaymentSimulationError ? error.code : "unknown"}`,
      buildSimulationErrorParams({
        error,
        step: "cancel_simulation",
        contractId: subscriptionContractId,
      })
    );
  }
}

export async function simulateParticipantSubscriptionPauseAction(formData: FormData) {
  const user = await requirePaymentsV2SimulationAccess();
  const courseRegistrationIntentId = String(formData.get("courseRegistrationIntentId") ?? "").trim();

  try {
    const result = await simulateParticipantSubscriptionPause({
      courseRegistrationIntentId,
      adminUserId: user.id,
      pauseStartDate: String(formData.get("pauseStartDate") ?? "").trim(),
      pauseEndDate: String(formData.get("pauseEndDate") ?? "").trim(),
      scenarioNote: parseOptionalString(formData.get("scenarioNote")),
      reason: parseOptionalString(formData.get("reason")),
    });
    revalidatePath(PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH);
    redirectWithActionState(`participant-lifecycle-pause-ok-${result.courseRegistrationIntentId ?? result.subscriptionContractId}`, {
      selectedContractId: result.subscriptionContractId,
      contractId: result.subscriptionContractId,
      courseRegistrationIntentId: result.courseRegistrationIntentId,
      pauseWindowId: result.pauseWindowId,
      eventId: result.eventId,
      lifecycleStatus: result.newStatus,
      renewalBlocked: result.nextRenewalBlocked ? "yes" : "no",
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    revalidatePath(PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH);
    console.error("[subscription-simulation] participant pause failed", { courseRegistrationIntentId, error });
    redirectWithActionState(
      `participant-lifecycle-pause-error-${error instanceof PaymentSimulationError ? error.code : "unknown"}`,
      buildSimulationErrorParams({
        error,
        step: "participant_pause_simulation",
        courseRegistrationIntentId,
      })
    );
  }
}

export async function simulateParticipantSubscriptionCancelAction(formData: FormData) {
  const user = await requirePaymentsV2SimulationAccess();
  const courseRegistrationIntentId = String(formData.get("courseRegistrationIntentId") ?? "").trim();

  try {
    const result = await simulateParticipantSubscriptionCancel({
      courseRegistrationIntentId,
      adminUserId: user.id,
      cancelEffectiveDate: String(formData.get("cancelEffectiveDate") ?? "").trim(),
      scenarioNote: parseOptionalString(formData.get("scenarioNote")),
      reason: parseOptionalString(formData.get("reason")),
    });
    revalidatePath(PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH);
    redirectWithActionState(`participant-lifecycle-cancel-ok-${result.courseRegistrationIntentId ?? result.subscriptionContractId}`, {
      selectedContractId: result.subscriptionContractId,
      contractId: result.subscriptionContractId,
      courseRegistrationIntentId: result.courseRegistrationIntentId,
      eventId: result.eventId,
      lifecycleStatus: result.newStatus,
      renewalBlocked: result.nextRenewalBlocked ? "yes" : "no",
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    revalidatePath(PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH);
    console.error("[subscription-simulation] participant cancel failed", { courseRegistrationIntentId, error });
    redirectWithActionState(
      `participant-lifecycle-cancel-error-${error instanceof PaymentSimulationError ? error.code : "unknown"}`,
      buildSimulationErrorParams({
        error,
        step: "participant_cancel_simulation",
        courseRegistrationIntentId,
      })
    );
  }
}

export async function simulateSubscriptionPayoutAction(formData: FormData) {
  await requirePaymentsV2SimulationAccess();
  const subscriptionContractId = String(formData.get("subscriptionContractId") ?? "").trim();

  try {
    const ledgerContext = await loadLatestSubscriptionLedgerEntryContext(subscriptionContractId);
    const admin = createSupabaseAdmin();

    if (
      ledgerContext.payoutBatchId === null &&
      (ledgerContext.payoutStatus === "pending" || ledgerContext.payoutStatus === "pending_event_completion")
    ) {
      await admin
        .from("ledger_entries")
        .update({
          payout_status: "payable",
          available_at: new Date().toISOString(),
        })
        .eq("id", ledgerContext.ledgerEntryId)
        .in("payout_status", ["pending", "pending_event_completion"])
        .is("payout_batch_id", null);
    }

    const result = await createSimulatedPaidPayoutForLedgerEntry({
      ledgerEntryId: ledgerContext.ledgerEntryId,
    });

    revalidatePath(PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH);
    redirectWithActionState(`subscription-payout-ok-${result.ledgerEntryId}`, {
      selectedContractId: ledgerContext.contractId,
      contractId: ledgerContext.contractId,
      courseRegistrationIntentId: ledgerContext.courseRegistrationIntentId,
      ledgerEntryId: result.ledgerEntryId,
      payoutBatchId: result.batchId,
    });
  } catch (error) {
    revalidatePath(PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH);
    if (error instanceof PaymentSimulationError) {
      redirectWithActionState(`subscription-payout-error-${error.code}`, {
        selectedContractId: subscriptionContractId,
        contractId: subscriptionContractId,
      });
      return;
    }

    const message = error instanceof Error ? error.message : "unknown";
    redirectWithActionState("subscription-payout-error-generic", {
      selectedContractId: subscriptionContractId,
      contractId: subscriptionContractId,
      errorMessage: message,
    });
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PaymentSimulationError, requirePaymentsV2SimulationAccess } from "@/lib/payments/simulation";
import { simulateSubscriptionInitialPaymentSuccess } from "@/lib/payments/simulation/subscription-initial-payment-simulation";
import {
  simulateParticipantSubscriptionCancel,
  simulateParticipantSubscriptionPause,
  simulateSubscriptionCancel,
  simulateSubscriptionPause,
} from "@/lib/payments/simulation/subscription-lifecycle-simulation";
import { simulateSubscriptionRecurringPayment } from "@/lib/payments/simulation/subscription-recurring-payment-simulation";
import { PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH } from "../ui";

function redirectWithActionState(actionState: string, params?: Record<string, string | null | undefined>) {
  const search = new URLSearchParams({ action: actionState });
  for (const [key, value] of Object.entries(params ?? {})) {
    if (!value) continue;
    search.set(key, value);
  }
  redirect(`${PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH}?${search.toString()}`);
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
    redirectWithActionState(`initial-pay-ok-${result.courseRegistrationIntentId}`);
  } catch (error) {
    revalidatePath(PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH);
    if (error instanceof PaymentSimulationError) {
      redirectWithActionState(`initial-pay-error-${error.code}`);
    }

    redirectWithActionState("initial-pay-error-unknown");
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
      contractId: result.subscriptionContractId,
      pauseWindowId: result.pauseWindowId,
      eventId: result.eventId,
      lifecycleStatus: result.newStatus,
      renewalBlocked: result.nextRenewalBlocked ? "yes" : "no",
    });
  } catch (error) {
    revalidatePath(PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH);
    if (error instanceof PaymentSimulationError) {
      redirectWithActionState(`lifecycle-pause-error-${error.code}`);
    }

    redirectWithActionState("lifecycle-pause-error-unknown");
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
      contractId: result.subscriptionContractId,
      eventId: result.eventId,
      lifecycleStatus: result.newStatus,
      renewalBlocked: result.nextRenewalBlocked ? "yes" : "no",
    });
  } catch (error) {
    revalidatePath(PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH);
    if (error instanceof PaymentSimulationError) {
      redirectWithActionState(`lifecycle-cancel-error-${error.code}`);
    }

    redirectWithActionState("lifecycle-cancel-error-unknown");
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
      contractId: result.subscriptionContractId,
      courseRegistrationIntentId: result.courseRegistrationIntentId,
      pauseWindowId: result.pauseWindowId,
      eventId: result.eventId,
      lifecycleStatus: result.newStatus,
      renewalBlocked: result.nextRenewalBlocked ? "yes" : "no",
    });
  } catch (error) {
    revalidatePath(PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH);
    if (error instanceof PaymentSimulationError) {
      redirectWithActionState(`participant-lifecycle-pause-error-${error.code}`);
    }

    redirectWithActionState("participant-lifecycle-pause-error-unknown");
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
      contractId: result.subscriptionContractId,
      courseRegistrationIntentId: result.courseRegistrationIntentId,
      eventId: result.eventId,
      lifecycleStatus: result.newStatus,
      renewalBlocked: result.nextRenewalBlocked ? "yes" : "no",
    });
  } catch (error) {
    revalidatePath(PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH);
    if (error instanceof PaymentSimulationError) {
      redirectWithActionState(`participant-lifecycle-cancel-error-${error.code}`);
    }

    redirectWithActionState("participant-lifecycle-cancel-error-unknown");
  }
}

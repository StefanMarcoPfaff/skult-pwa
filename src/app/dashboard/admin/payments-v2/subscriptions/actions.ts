"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PaymentSimulationError, requirePaymentsV2SimulationAccess } from "@/lib/payments/simulation";
import { simulateSubscriptionInitialPaymentSuccess } from "@/lib/payments/simulation/subscription-initial-payment-simulation";
import { simulateSubscriptionRecurringPayment } from "@/lib/payments/simulation/subscription-recurring-payment-simulation";
import { PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH } from "../ui";

function redirectWithActionState(actionState: string) {
  redirect(`${PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH}?action=${encodeURIComponent(actionState)}`);
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
        : `recurring-pay-ok-${result.subscriptionContractId}`
    );
  } catch (error) {
    revalidatePath(PAYMENTS_V2_SUBSCRIPTIONS_AUDIT_PATH);
    if (error instanceof PaymentSimulationError) {
      redirectWithActionState(`recurring-pay-error-${error.code}`);
    }

    redirectWithActionState("recurring-pay-error-unknown");
  }
}

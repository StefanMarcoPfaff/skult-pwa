import { calculateInitialProration } from "@/lib/payments/subscriptions/proration";
import type {
  CreateSubscriptionChargeInput,
  SubscriptionDateString,
} from "@/lib/payments/subscriptions/types";

export type PlannedSubscriptionCharge = {
  chargeType: CreateSubscriptionChargeInput["chargeType"];
  grossAmountCents: number;
  currency: string;
  chargedAt: string | null;
  metadata: Record<string, unknown>;
};

export function planInitialProrationCharge(input: {
  monthlyAmountCents: number;
  contractStartDate: SubscriptionDateString;
  currency: string;
}): PlannedSubscriptionCharge {
  const proration = calculateInitialProration({
    monthlyAmountCents: input.monthlyAmountCents,
    contractStartDate: input.contractStartDate,
  });

  return {
    chargeType: "initial_proration",
    grossAmountCents: proration.proratedAmountCents,
    currency: input.currency,
    chargedAt: null,
    metadata: {
      serviceMonth: proration.serviceMonth,
      periodStart: proration.periodStart,
      periodEnd: proration.periodEnd,
      totalDaysInMonth: proration.totalDaysInMonth,
      billableDays: proration.billableDays,
      prorationRatio: proration.prorationRatio,
      fullAmountCents: proration.fullAmountCents,
    },
  };
}

export function planMonthlyRecurringCharge(input: {
  monthlyAmountCents: number;
  currency: string;
  serviceMonth: SubscriptionDateString;
  periodStart: SubscriptionDateString;
  periodEnd: SubscriptionDateString;
}): PlannedSubscriptionCharge {
  return {
    chargeType: "monthly_recurring",
    grossAmountCents: input.monthlyAmountCents,
    currency: input.currency,
    chargedAt: null,
    metadata: {
      serviceMonth: input.serviceMonth,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      fullRecurringAmountCents: input.monthlyAmountCents,
    },
  };
}

export function toCreateSubscriptionChargeInput(input: {
  subscriptionContractId: string;
  subscriptionPeriodId?: string | null;
  provider: string;
  plannedCharge: PlannedSubscriptionCharge;
}): CreateSubscriptionChargeInput {
  return {
    subscriptionContractId: input.subscriptionContractId,
    subscriptionPeriodId: input.subscriptionPeriodId ?? null,
    provider: input.provider,
    chargeType: input.plannedCharge.chargeType,
    grossAmountCents: input.plannedCharge.grossAmountCents,
    currency: input.plannedCharge.currency,
    status: "draft",
    chargedAt: input.plannedCharge.chargedAt,
    metadata: input.plannedCharge.metadata,
  };
}

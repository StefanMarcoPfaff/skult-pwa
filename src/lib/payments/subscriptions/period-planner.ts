import {
  getBillingAnchorDay,
  getFirstDayOfMonth,
  getFirstDayOfNextMonth,
  getLastDayOfMonth,
  getServiceMonth,
  resolveBillingAnchorDateForMonth,
  toBerlinStartOfDayIso,
} from "@/lib/payments/subscriptions/dates";
import type {
  CreateSubscriptionPeriodInput,
  SubscriptionDateString,
} from "@/lib/payments/subscriptions/types";

export type PlannedSubscriptionPeriod = {
  periodStart: SubscriptionDateString;
  periodEnd: SubscriptionDateString;
  serviceMonth: SubscriptionDateString;
  plannedChargeAt: string;
};

export function planInitialSubscriptionPeriod(input: {
  contractStartDate: SubscriptionDateString;
  billingAnchorDay?: number;
}): PlannedSubscriptionPeriod {
  const serviceMonth = getServiceMonth(input.contractStartDate);
  return {
    periodStart: input.contractStartDate,
    periodEnd: getLastDayOfMonth(input.contractStartDate),
    serviceMonth,
    plannedChargeAt: toBerlinStartOfDayIso(
      resolveBillingAnchorDateForMonth(serviceMonth, input.billingAnchorDay ?? getBillingAnchorDay(input.contractStartDate))
    ),
  };
}

export function planNextSubscriptionPeriod(input: {
  previousServiceMonth: SubscriptionDateString;
  billingAnchorDay: number;
}): PlannedSubscriptionPeriod {
  const serviceMonth = getFirstDayOfNextMonth(input.previousServiceMonth);
  return {
    periodStart: getFirstDayOfMonth(serviceMonth),
    periodEnd: getLastDayOfMonth(serviceMonth),
    serviceMonth,
    plannedChargeAt: toBerlinStartOfDayIso(resolveBillingAnchorDateForMonth(serviceMonth, input.billingAnchorDay)),
  };
}

export function planSubscriptionPeriods(input: {
  contractStartDate: SubscriptionDateString;
  billingAnchorDay?: number;
  count: number;
}): PlannedSubscriptionPeriod[] {
  if (input.count <= 0) {
    return [];
  }

  const billingAnchorDay = input.billingAnchorDay ?? getBillingAnchorDay(input.contractStartDate);
  const periods: PlannedSubscriptionPeriod[] = [planInitialSubscriptionPeriod(input)];

  while (periods.length < input.count) {
    periods.push(
      planNextSubscriptionPeriod({
        previousServiceMonth: periods[periods.length - 1].serviceMonth,
        billingAnchorDay,
      })
    );
  }

  return periods;
}

export function toCreateSubscriptionPeriodInput(
  subscriptionContractId: string,
  period: PlannedSubscriptionPeriod
): CreateSubscriptionPeriodInput {
  return {
    subscriptionContractId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    serviceMonth: period.serviceMonth,
    status: "planned",
    plannedChargeAt: period.plannedChargeAt,
  };
}

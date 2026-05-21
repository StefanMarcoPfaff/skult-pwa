import {
  diffInCalendarDaysInclusive,
  getDaysInMonth,
  getFirstDayOfMonth,
  getLastDayOfMonth,
} from "@/lib/payments/subscriptions/dates";
import type { SubscriptionDateString } from "@/lib/payments/subscriptions/types";

export type InitialProrationResult = {
  serviceMonth: SubscriptionDateString;
  periodStart: SubscriptionDateString;
  periodEnd: SubscriptionDateString;
  totalDaysInMonth: number;
  billableDays: number;
  prorationRatio: number;
  fullAmountCents: number;
  proratedAmountCents: number;
};

export type ProratedFirstSubscriptionAmount = {
  full_month_amount_cents: number;
  prorated_amount_cents: number;
  period_start: SubscriptionDateString;
  period_end: SubscriptionDateString;
  days_in_month: number;
  billable_days: number;
  explanation: string;
};

export function calculateProrationRatio(input: {
  activeStartDate: SubscriptionDateString;
  activeEndDate: SubscriptionDateString;
  fullPeriodStartDate: SubscriptionDateString;
  fullPeriodEndDate: SubscriptionDateString;
}): number {
  const fullDays = diffInCalendarDaysInclusive(input.fullPeriodStartDate, input.fullPeriodEndDate);
  const activeDays = diffInCalendarDaysInclusive(input.activeStartDate, input.activeEndDate);
  return activeDays / fullDays;
}

export function calculateProratedAmountCents(input: {
  fullAmountCents: number;
  billableDays: number;
  totalDays: number;
}): number {
  if (input.fullAmountCents < 0) {
    throw new Error("fullAmountCents must not be negative");
  }
  if (input.totalDays <= 0) {
    throw new Error("totalDays must be positive");
  }
  if (input.billableDays < 0) {
    throw new Error("billableDays must not be negative");
  }

  return Math.round((input.fullAmountCents * input.billableDays) / input.totalDays);
}

export function calculateInitialProration(input: {
  monthlyAmountCents: number;
  contractStartDate: SubscriptionDateString;
}): InitialProrationResult {
  const serviceMonth = getFirstDayOfMonth(input.contractStartDate);
  const periodStart = input.contractStartDate;
  const periodEnd = getLastDayOfMonth(input.contractStartDate);
  const totalDaysInMonth = getDaysInMonth(input.contractStartDate);
  const billableDays = diffInCalendarDaysInclusive(periodStart, periodEnd);
  const prorationRatio = billableDays / totalDaysInMonth;

  return {
    serviceMonth,
    periodStart,
    periodEnd,
    totalDaysInMonth,
    billableDays,
    prorationRatio,
    fullAmountCents: input.monthlyAmountCents,
    proratedAmountCents: calculateProratedAmountCents({
      fullAmountCents: input.monthlyAmountCents,
      billableDays,
      totalDays: totalDaysInMonth,
    }),
  };
}

export function calculateProratedFirstSubscriptionAmount(input: {
  monthlyAmountCents: number;
  contractStartDate: SubscriptionDateString;
}): ProratedFirstSubscriptionAmount {
  const proration = calculateInitialProration(input);
  const isFullMonth = proration.billableDays === proration.totalDaysInMonth;

  return {
    full_month_amount_cents: proration.fullAmountCents,
    prorated_amount_cents: proration.proratedAmountCents,
    period_start: proration.periodStart,
    period_end: proration.periodEnd,
    days_in_month: proration.totalDaysInMonth,
    billable_days: proration.billableDays,
    explanation: isFullMonth
      ? "Start ist am Monatsersten. Die Erstzahlung entspricht dem vollen Monatsbetrag."
      : `Erstzahlung anteilig fuer ${proration.billableDays} von ${proration.totalDaysInMonth} Tagen bis Monatsende.`,
  };
}

import { STRIPE_PLATFORM_FEE_PERCENT } from "@/lib/stripe-connect";

export const STRIPE_ESTIMATE_PERCENT = 1.5;
export const STRIPE_ESTIMATE_FIXED_FEE_CENTS = 25;

export type CoursePriceBreakdown = {
  grossCents: number;
  platformFeeCents: number;
  stripeFeeEstimateCents: number;
  payoutCents: number;
};

export function estimateStripeFeeCents(amountCents: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  return Math.round(amountCents * (STRIPE_ESTIMATE_PERCENT / 100)) + STRIPE_ESTIMATE_FIXED_FEE_CENTS;
}

export function calculateCoursePriceBreakdown(amountCents: number): CoursePriceBreakdown {
  const grossCents = Number.isFinite(amountCents) && amountCents > 0 ? Math.round(amountCents) : 0;
  const platformFeeCents = Math.round(grossCents * (STRIPE_PLATFORM_FEE_PERCENT / 100));
  const stripeFeeEstimateCents = estimateStripeFeeCents(grossCents);
  const payoutCents = Math.max(0, grossCents - platformFeeCents - stripeFeeEstimateCents);

  return {
    grossCents,
    platformFeeCents,
    stripeFeeEstimateCents,
    payoutCents,
  };
}

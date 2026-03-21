import { STRIPE_PLATFORM_FEE_PERCENT } from "@/lib/stripe-connect";

export type CoursePriceBreakdown = {
  grossCents: number;
  platformFeeCents: number;
  payoutCents: number;
};

export function calculateCoursePriceBreakdown(amountCents: number): CoursePriceBreakdown {
  const grossCents = Number.isFinite(amountCents) && amountCents > 0 ? Math.round(amountCents) : 0;
  const platformFeeCents = Math.round(grossCents * (STRIPE_PLATFORM_FEE_PERCENT / 100));
  const payoutCents = Math.max(0, grossCents - platformFeeCents);

  return {
    grossCents,
    platformFeeCents,
    payoutCents,
  };
}

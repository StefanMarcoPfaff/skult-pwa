import type { ProviderType } from "@/lib/provider-profiles";
import { getPlatformFeePercent } from "@/lib/stripe-connect";

export type CoursePriceBreakdown = {
  grossCents: number;
  platformFeeCents: number;
  payoutCents: number;
};

export function calculateCoursePriceBreakdown(
  amountCents: number,
  providerType: ProviderType | null | undefined
): CoursePriceBreakdown {
  const grossCents = Number.isFinite(amountCents) && amountCents > 0 ? Math.round(amountCents) : 0;
  const platformFeeCents = Math.round(grossCents * (getPlatformFeePercent(providerType) / 100));
  const payoutCents = Math.max(0, grossCents - platformFeeCents);

  return {
    grossCents,
    platformFeeCents,
    payoutCents,
  };
}

import type { ProviderType } from "@/lib/provider-profiles";
import { calculatePlatformFeeAmount } from "@/lib/platform-fees";

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
  const platformFeeCents = calculatePlatformFeeAmount(grossCents, providerType);
  const payoutCents = Math.max(0, grossCents - platformFeeCents);

  return {
    grossCents,
    platformFeeCents,
    payoutCents,
  };
}

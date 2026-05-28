import type { ProviderType } from "@/lib/provider-profiles";
import {
  calculatePlatformFeeCents,
  calculateProviderPayoutCents,
  DEFAULT_PLATFORM_FEE_PERCENT,
} from "@/lib/platform-fees";

export type CoursePriceBreakdown = {
  grossCents: number;
  platformFeeCents: number;
  payoutCents: number;
};

export function calculateCoursePriceBreakdown(
  amountCents: number,
  providerType: ProviderType | null | undefined,
  platformFeePercent = DEFAULT_PLATFORM_FEE_PERCENT
): CoursePriceBreakdown {
  void providerType;
  const grossCents = Number.isFinite(amountCents) && amountCents > 0 ? Math.round(amountCents) : 0;
  const platformFeeCents = calculatePlatformFeeCents(grossCents, platformFeePercent);
  const payoutCents = calculateProviderPayoutCents(grossCents, platformFeePercent);

  return {
    grossCents,
    platformFeeCents,
    payoutCents,
  };
}

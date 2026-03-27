import type { ProviderType } from "@/lib/provider-profiles";

export const INDEPENDENT_TEACHER_PLATFORM_FEE_PERCENT = 10;
export const STUDIO_PROVIDER_PLATFORM_FEE_PERCENT = 5;

// RESER owns platform fee logic in code. Stripe dashboard pricing must not be treated as authoritative.
export function getPlatformFeePercent(providerType: ProviderType | null | undefined): number {
  return providerType === "studio_provider"
    ? STUDIO_PROVIDER_PLATFORM_FEE_PERCENT
    : INDEPENDENT_TEACHER_PLATFORM_FEE_PERCENT;
}

export function calculatePlatformFeeAmount(
  grossAmountCents: number,
  providerType: ProviderType | null | undefined
): number {
  const normalizedGrossAmount =
    Number.isFinite(grossAmountCents) && grossAmountCents > 0 ? Math.round(grossAmountCents) : 0;

  return Math.round(normalizedGrossAmount * (getPlatformFeePercent(providerType) / 100));
}

export function calculateProviderPayoutAmount(
  grossAmountCents: number,
  providerType: ProviderType | null | undefined
): number {
  const normalizedGrossAmount =
    Number.isFinite(grossAmountCents) && grossAmountCents > 0 ? Math.round(grossAmountCents) : 0;

  return Math.max(
    0,
    normalizedGrossAmount - calculatePlatformFeeAmount(normalizedGrossAmount, providerType)
  );
}

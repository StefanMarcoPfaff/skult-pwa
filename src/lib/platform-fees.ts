import type { ProviderType } from "@/lib/provider-profiles";

export const DEFAULT_PLATFORM_FEE_PERCENT = 0.07;
export const DEFAULT_PROVIDER_SHARE_PERCENT = 0.93;

// RESER owns platform fee logic in code. Stripe dashboard pricing must not be treated as authoritative.
export function getPlatformFeePercentForProvider(providerType?: ProviderType | null): number {
  void providerType;
  return DEFAULT_PLATFORM_FEE_PERCENT;
}

function normalizeGrossAmountCents(grossAmountCents: number): number {
  return Number.isFinite(grossAmountCents) && grossAmountCents > 0 ? Math.round(grossAmountCents) : 0;
}

export function calculatePlatformFeeCents(grossAmountCents: number): number {
  const normalizedGrossAmount = normalizeGrossAmountCents(grossAmountCents);

  return Math.round(normalizedGrossAmount * DEFAULT_PLATFORM_FEE_PERCENT);
}

export function calculateProviderPayoutCents(grossAmountCents: number): number {
  const normalizedGrossAmount = normalizeGrossAmountCents(grossAmountCents);

  return Math.max(0, normalizedGrossAmount - calculatePlatformFeeCents(normalizedGrossAmount));
}

export function getPlatformFeePercent(providerType?: ProviderType | null): number {
  void providerType;
  return DEFAULT_PLATFORM_FEE_PERCENT * 100;
}

export function calculatePlatformFeeAmount(grossAmountCents: number, providerType?: ProviderType | null): number {
  void providerType;
  const normalizedGrossAmount =
    Number.isFinite(grossAmountCents) && grossAmountCents > 0 ? Math.round(grossAmountCents) : 0;

  return calculatePlatformFeeCents(normalizedGrossAmount);
}

export function calculateProviderPayoutAmount(
  grossAmountCents: number,
  providerType?: ProviderType | null
): number {
  void providerType;
  const normalizedGrossAmount =
    Number.isFinite(grossAmountCents) && grossAmountCents > 0 ? Math.round(grossAmountCents) : 0;

  return calculateProviderPayoutCents(normalizedGrossAmount);
}

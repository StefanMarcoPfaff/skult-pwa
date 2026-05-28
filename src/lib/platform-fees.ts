import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderType } from "@/lib/provider-profiles";

export const DEFAULT_PLATFORM_FEE_PERCENT = 0.07;
export const DEFAULT_PROVIDER_SHARE_PERCENT = 0.93;

export type PlatformFeeConfig = {
  platformFeePercent: number;
  providerSharePercent: number;
  isOverride: boolean;
  overrideNote: string | null;
  overrideUpdatedAt: string | null;
};

type ProviderPlatformFeeOverrideRow = {
  platform_fee_percent_override: number | string | null;
  platform_fee_override_note: string | null;
  platform_fee_override_updated_at: string | null;
};

export type UpdateProviderPlatformFeeOverrideInput = {
  providerId: string;
  platformFeePercent: number | null;
  note?: string | null;
};

// RESER owns platform fee logic in code. Stripe dashboard pricing must not be treated as authoritative.
export function getDefaultPlatformFeeConfig(): PlatformFeeConfig {
  return {
    platformFeePercent: DEFAULT_PLATFORM_FEE_PERCENT,
    providerSharePercent: DEFAULT_PROVIDER_SHARE_PERCENT,
    isOverride: false,
    overrideNote: null,
    overrideUpdatedAt: null,
  };
}

function normalizePlatformFeePercent(value: number | string | null | undefined): number | null {
  if (value === null || typeof value === "undefined") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0.3) return null;
  return parsed;
}

export async function getPlatformFeeConfigForProvider(
  supabase: Pick<SupabaseClient, "from">,
  providerId: string | null | undefined
): Promise<PlatformFeeConfig> {
  if (!providerId) return getDefaultPlatformFeeConfig();

  const { data } = await supabase
    .from("provider_payout_profiles")
    .select("platform_fee_percent_override,platform_fee_override_note,platform_fee_override_updated_at")
    .eq("teacher_id", providerId)
    .not("platform_fee_percent_override", "is", null)
    .order("platform_fee_override_updated_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<ProviderPlatformFeeOverrideRow>();

  const overridePercent = normalizePlatformFeePercent(data?.platform_fee_percent_override);
  if (overridePercent === null) return getDefaultPlatformFeeConfig();

  return {
    platformFeePercent: overridePercent,
    providerSharePercent: Math.max(0, 1 - overridePercent),
    isOverride: true,
    overrideNote: data?.platform_fee_override_note ?? null,
    overrideUpdatedAt: data?.platform_fee_override_updated_at ?? null,
  };
}

export async function getPlatformFeePercentForProvider(
  supabase: Pick<SupabaseClient, "from">,
  providerId: string | null | undefined
): Promise<number> {
  const config = await getPlatformFeeConfigForProvider(supabase, providerId);
  return config.platformFeePercent;
}

export async function updateProviderPlatformFeeOverride(
  input: UpdateProviderPlatformFeeOverrideInput
): Promise<PlatformFeeConfig> {
  const { createSupabaseAdmin } = await import("@/lib/supabase/admin");
  const admin = createSupabaseAdmin();
  const normalizedPercent =
    input.platformFeePercent === null ? null : normalizePlatformFeePercent(input.platformFeePercent);

  if (input.platformFeePercent !== null && normalizedPercent === null) {
    throw new Error("platform_fee_percent_override must be between 0 and 0.30");
  }

  const payload = {
    platform_fee_percent_override: normalizedPercent,
    platform_fee_override_note: input.note?.trim() || null,
    platform_fee_override_updated_at: normalizedPercent === null ? null : new Date().toISOString(),
  };

  const { data: existing } = await admin
    .from("provider_payout_profiles")
    .select("id")
    .eq("teacher_id", input.providerId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (!existing?.id) {
    throw new Error("provider_payout_profile_not_found");
  }

  await admin.from("provider_payout_profiles").update(payload).eq("id", existing.id);

  return getPlatformFeeConfigForProvider(admin, input.providerId);
}

export function getLegacyDefaultPlatformFeePercentForProvider(providerType?: ProviderType | null): number {
  void providerType;
  return DEFAULT_PLATFORM_FEE_PERCENT;
}

function normalizeGrossAmountCents(grossAmountCents: number): number {
  return Number.isFinite(grossAmountCents) && grossAmountCents > 0 ? Math.round(grossAmountCents) : 0;
}

export function calculatePlatformFeeCents(
  grossAmountCents: number,
  platformFeePercent = DEFAULT_PLATFORM_FEE_PERCENT
): number {
  const normalizedGrossAmount = normalizeGrossAmountCents(grossAmountCents);
  const normalizedPercent = normalizePlatformFeePercent(platformFeePercent) ?? DEFAULT_PLATFORM_FEE_PERCENT;

  return Math.round(normalizedGrossAmount * normalizedPercent);
}

export function calculateProviderPayoutCents(
  grossAmountCents: number,
  platformFeePercent = DEFAULT_PLATFORM_FEE_PERCENT
): number {
  const normalizedGrossAmount = normalizeGrossAmountCents(grossAmountCents);

  return Math.max(0, normalizedGrossAmount - calculatePlatformFeeCents(normalizedGrossAmount, platformFeePercent));
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

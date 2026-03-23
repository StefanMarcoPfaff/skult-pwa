import {
  getCourseTerminationModelLabel,
  getWorkshopCancellationPolicyLabel,
} from "@/lib/offer-policies";

export const PROVIDER_TYPES = ["independent_teacher", "studio_provider"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const ACTIVE_CANCELLATION_MODELS = ["monthly", "quarterly", "semiannual"] as const;
export type CancellationModel = (typeof ACTIVE_CANCELLATION_MODELS)[number];

export type StoredCancellationModel =
  | CancellationModel
  | "minimum_3_months"
  | "minimum_6_months"
  | "fixed_course";

export const WORKSHOP_STORNO_POLICIES = [
  "no_refund",
  "free_until_14_days_then_100",
  "free_until_7_days_then_100",
  "fifty_until_14_days_then_100",
] as const;
export type WorkshopStornoPolicy = (typeof WORKSHOP_STORNO_POLICIES)[number];

type ProviderNameInput = {
  first_name?: string | null;
  last_name?: string | null;
  organization_name?: string | null;
};

export function isProviderType(value: string | null | undefined): value is ProviderType {
  return value === "independent_teacher" || value === "studio_provider";
}

export function isCancellationModel(value: string | null | undefined): value is CancellationModel {
  return ACTIVE_CANCELLATION_MODELS.includes(value as CancellationModel);
}

export function isWorkshopStornoPolicy(value: string | null | undefined): value is WorkshopStornoPolicy {
  return WORKSHOP_STORNO_POLICIES.includes(value as WorkshopStornoPolicy);
}

export function normalizeCancellationModel(value: string | null | undefined): CancellationModel {
  if (value === "quarterly" || value === "minimum_3_months") return "quarterly";
  if (value === "semiannual" || value === "minimum_6_months" || value === "fixed_course") {
    return "semiannual";
  }
  return "monthly";
}

export function getCancellationModelLabel(value: string | null | undefined): string {
  return getCourseTerminationModelLabel(value);
}

export function getWorkshopStornoPolicyLabel(value: string | null | undefined): string {
  return getWorkshopCancellationPolicyLabel(value);
}

export function getProfileAccountName(input: ProviderNameInput): string {
  return [input.first_name, input.last_name].filter(Boolean).join(" ").trim();
}

export function getProviderDisplayName(
  providerType: ProviderType,
  input: ProviderNameInput
): string {
  if (providerType === "studio_provider") {
    return String(input.organization_name ?? "").trim() || getProfileAccountName(input);
  }
  return getProfileAccountName(input);
}

export function shouldShowStudioLabel(providerType: ProviderType | null | undefined): boolean {
  return providerType === "studio_provider";
}

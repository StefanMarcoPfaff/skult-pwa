import { formatMoney } from "@/lib/course-display";
import { formatBerlinDateTimeRange } from "@/lib/formatting/berlin-time";
import { shouldShowStudioLabel } from "@/lib/provider-profiles";

export type WorkshopProviderDisplayInput = {
  providerType?: "independent_teacher" | "studio_provider" | null;
  providerName?: string | null;
  instructorName?: string | null;
  fallbackProviderName?: string | null;
};

export function isFreeWorkshopOffer(priceCents: number | null | undefined, paymentStatus?: string | null): boolean {
  return paymentStatus === "free" || priceCents === null || priceCents === undefined || !Number.isFinite(priceCents) || priceCents <= 0;
}

export function formatWorkshopPriceLabel(
  priceCents: number | null | undefined,
  currency: string | null | undefined,
  paymentStatus?: string | null
): string {
  if (isFreeWorkshopOffer(priceCents, paymentStatus)) return "Kostenfreie Reservierung";
  return formatMoney(priceCents ?? 0, currency || "EUR");
}

export function formatWorkshopSessionLine(startsAt: string | null, endsAt: string | null): string {
  return formatBerlinDateTimeRange(startsAt, endsAt) ?? "Termin folgt";
}

export function resolveWorkshopProviderDisplay(input: WorkshopProviderDisplayInput): {
  organizationLabel: string | null;
  instructorLabel: string | null;
} {
  const organizationLabel =
    (shouldShowStudioLabel(input.providerType) ? input.providerName : null) ??
    input.providerName ??
    input.fallbackProviderName ??
    null;
  const instructorLabel =
    input.instructorName && input.instructorName !== organizationLabel ? input.instructorName : null;

  return {
    organizationLabel,
    instructorLabel,
  };
}

export function shouldShowWorkshopCancellationPolicy(priceCents: number | null | undefined, paymentStatus?: string | null): boolean {
  return !isFreeWorkshopOffer(priceCents, paymentStatus);
}

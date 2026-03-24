import { getCancellationModelLabel } from "@/lib/provider-profiles";

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function formatRecurringCoursePrice(
  priceCents: number | null,
  currency: string | null
): string | null {
  if (priceCents === null || !Number.isFinite(priceCents)) return null;
  if (priceCents === 0) return "Kostenlos";
  return `${formatMoney(priceCents, currency || "EUR")} / Monat`;
}

export function formatCoursePriceFromRow(input: {
  kind: string | null;
  priceType: string | null;
  priceCents: number | null;
  currency: string | null;
}): string | null {
  if ((input.priceType ?? "").toLowerCase() === "free") return "Kostenlos";
  if (input.priceCents === null || !Number.isFinite(input.priceCents) || input.priceCents < 0) {
    return null;
  }

  if ((input.kind ?? "").toLowerCase() === "course") {
    return formatRecurringCoursePrice(input.priceCents, input.currency);
  }

  return formatMoney(input.priceCents, input.currency || "EUR");
}

export function getCancellationNotice(cancellationModel: string | null | undefined): string | null {
  if (!cancellationModel) return null;

  const label = getCancellationModelLabel(cancellationModel);
  return `Abrechnung: monatlich ab Buchungsdatum. Kündigung: ${label}`;
}

export const PILOT_PAID_OFFERS_MESSAGE =
  "Kostenpflichtige Angebote sind während der Pilotphase noch nicht verfügbar.\nAktuell kannst du RESER vollständig mit kostenlosen Angeboten testen.";

function parseBooleanEnvFlag(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function isPilotModeEnabled(): boolean {
  return parseBooleanEnvFlag(process.env.PILOT_MODE);
}

export function assertPaidOffersAllowed(amountCents: number | null | undefined): void {
  const normalizedAmount =
    typeof amountCents === "number" && Number.isFinite(amountCents)
      ? Math.max(0, Math.trunc(amountCents))
      : 0;

  if (isPilotModeEnabled() && normalizedAmount > 0) {
    throw new Error(PILOT_PAID_OFFERS_MESSAGE);
  }
}

export function getPaymentLineItemsTotalCents(
  lineItems: Array<{ quantity: number; priceData: { unitAmount: number } }>
): number {
  return lineItems.reduce((sum, item) => {
    const quantity = Number.isFinite(item.quantity) ? Math.max(0, Math.trunc(item.quantity)) : 0;
    const unitAmount = Number.isFinite(item.priceData.unitAmount)
      ? Math.max(0, Math.trunc(item.priceData.unitAmount))
      : 0;
    return sum + quantity * unitAmount;
  }, 0);
}

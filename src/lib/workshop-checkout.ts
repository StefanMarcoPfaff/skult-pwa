const WORKSHOP_CHECKOUT_CURRENCY = "EUR";

export function normalizeCurrencyCode(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

export function getWorkshopCheckoutCurrency(): string {
  return WORKSHOP_CHECKOUT_CURRENCY;
}

export function normalizeWorkshopCurrency(value: string | null | undefined): string {
  const normalized = normalizeCurrencyCode(value);
  return normalized || WORKSHOP_CHECKOUT_CURRENCY;
}

export function isWorkshopCheckoutCurrencySupported(value: string | null | undefined): boolean {
  return normalizeWorkshopCurrency(value) === WORKSHOP_CHECKOUT_CURRENCY;
}

export function getWorkshopCheckoutCurrencyError(value: string | null | undefined): string {
  const normalized = normalizeCurrencyCode(value);

  if (!normalized) {
    return "Dieser Workshop hat keine gültige Währung hinterlegt und ist aktuell nicht checkout-fähig.";
  }

  return `Dieser Workshop ist aktuell nur für Zahlungen in EUR checkout-fähig. Hinterlegt ist derzeit ${normalized}.`;
}

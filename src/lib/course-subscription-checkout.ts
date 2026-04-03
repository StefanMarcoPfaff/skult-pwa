const COURSE_SUBSCRIPTION_CHECKOUT_CURRENCY = "EUR";

function normalizeCurrencyCode(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

export function getCourseSubscriptionCheckoutCurrency(): string {
  return COURSE_SUBSCRIPTION_CHECKOUT_CURRENCY;
}

export function normalizeCourseSubscriptionCurrency(value: string | null | undefined): string {
  const normalized = normalizeCurrencyCode(value);
  return normalized || COURSE_SUBSCRIPTION_CHECKOUT_CURRENCY;
}

export function isCourseSubscriptionCheckoutCurrencySupported(
  value: string | null | undefined
): boolean {
  return normalizeCourseSubscriptionCurrency(value) === COURSE_SUBSCRIPTION_CHECKOUT_CURRENCY;
}

export function getCourseSubscriptionCheckoutCurrencyError(
  value: string | null | undefined
): string {
  const normalized = normalizeCurrencyCode(value);

  if (!normalized) {
    return "Dieser Kurs hat keine gueltige Waehrung hinterlegt und ist aktuell nicht checkout-faehig.";
  }

  return `Dieser Kurs ist aktuell nur fuer Subscription-Checkout in EUR freigegeben. Hinterlegt ist derzeit ${normalized}.`;
}

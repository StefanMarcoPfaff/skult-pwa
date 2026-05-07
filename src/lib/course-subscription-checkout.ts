const COURSE_SUBSCRIPTION_CHECKOUT_CURRENCY = "EUR";
const COURSE_SUBSCRIPTION_BILLING_TIME_ZONE = "Europe/Berlin";

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
  return normalizeCurrencyCode(value) === COURSE_SUBSCRIPTION_CHECKOUT_CURRENCY;
}

export function getCourseSubscriptionCheckoutCurrencyError(
  value: string | null | undefined
): string {
  const normalized = normalizeCurrencyCode(value);

  if (!normalized) {
    return "Dieses laufende Angebot hat keine gueltige Waehrung hinterlegt und ist aktuell nicht checkout-faehig.";
  }

  return `Dieses laufende Angebot ist aktuell nur fuer Subscription-Checkout in EUR freigegeben. Hinterlegt ist derzeit ${normalized}.`;
}

function getTimeZoneParts(referenceDate: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const values = Object.fromEntries(
    formatter
      .formatToParts(referenceDate)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function getTimeZoneOffsetMs(referenceDate: Date, timeZone: string): number {
  const parts = getTimeZoneParts(referenceDate, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - referenceDate.getTime();
}

function zonedMidnightToUnixSeconds(year: number, month: number, day: number, timeZone: string): number {
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const firstPass = utcGuess - getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  const secondPass = utcGuess - getTimeZoneOffsetMs(new Date(firstPass), timeZone);
  return Math.floor(secondPass / 1000);
}

export function getCourseSubscriptionBillingCycleAnchor(
  referenceDate: Date = new Date()
): number {
  const { year, month, day } = getTimeZoneParts(referenceDate, COURSE_SUBSCRIPTION_BILLING_TIME_ZONE);

  if (day === 1) {
    return Math.floor(referenceDate.getTime() / 1000);
  }

  const anchorMonth = month === 12 ? 1 : month + 1;
  const anchorYear = month === 12 ? year + 1 : year;

  return zonedMidnightToUnixSeconds(
    anchorYear,
    anchorMonth,
    1,
    COURSE_SUBSCRIPTION_BILLING_TIME_ZONE
  );
}

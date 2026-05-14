import { SUBSCRIPTION_DOMAIN_TIME_ZONE, type SubscriptionDateString } from "@/lib/payments/subscriptions/types";

type DateParts = {
  year: number;
  month: number;
  day: number;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateParts(parts: DateParts): SubscriptionDateString {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function parseDateParts(value: string): DateParts | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function getTimeZoneDateParts(referenceDate: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
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
  };
}

function getTimeZoneDateTimeParts(referenceDate: Date, timeZone: string) {
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
  const parts = getTimeZoneDateTimeParts(referenceDate, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - referenceDate.getTime();
}

function zonedDateTimeToIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timeZone: string
): string {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const firstPass = utcGuess - getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  const secondPass = utcGuess - getTimeZoneOffsetMs(new Date(firstPass), timeZone);
  return new Date(secondPass).toISOString();
}

export function isSubscriptionDateString(value: string | null | undefined): value is SubscriptionDateString {
  return Boolean(value && parseDateParts(value));
}

export function normalizeSubscriptionDateString(value: string | null | undefined): SubscriptionDateString | null {
  if (!value) return null;
  const parsed = parseDateParts(value);
  return parsed ? formatDateParts(parsed) : null;
}

export function getBerlinTodayDate(referenceDate: Date = new Date()): SubscriptionDateString {
  return formatDateParts(getTimeZoneDateParts(referenceDate, SUBSCRIPTION_DOMAIN_TIME_ZONE));
}

export function getFirstDayOfMonth(value: SubscriptionDateString): SubscriptionDateString {
  const parsed = parseDateParts(value);
  if (!parsed) {
    throw new Error(`Invalid subscription date: ${value}`);
  }
  return formatDateParts({ year: parsed.year, month: parsed.month, day: 1 });
}

export function getLastDayOfMonth(value: SubscriptionDateString): SubscriptionDateString {
  const parsed = parseDateParts(value);
  if (!parsed) {
    throw new Error(`Invalid subscription date: ${value}`);
  }
  const day = new Date(Date.UTC(parsed.year, parsed.month, 0)).getUTCDate();
  return formatDateParts({ year: parsed.year, month: parsed.month, day });
}

export function getFirstDayOfNextMonth(value: SubscriptionDateString): SubscriptionDateString {
  const parsed = parseDateParts(value);
  if (!parsed) {
    throw new Error(`Invalid subscription date: ${value}`);
  }
  const year = parsed.month === 12 ? parsed.year + 1 : parsed.year;
  const month = parsed.month === 12 ? 1 : parsed.month + 1;
  return formatDateParts({ year, month, day: 1 });
}

export function getBillingAnchorDay(value: SubscriptionDateString): number {
  const parsed = parseDateParts(value);
  if (!parsed) {
    throw new Error(`Invalid subscription date: ${value}`);
  }
  return parsed.day;
}

export function resolveBillingAnchorDateForMonth(
  serviceMonth: SubscriptionDateString,
  billingAnchorDay: number
): SubscriptionDateString {
  const parsed = parseDateParts(serviceMonth);
  if (!parsed) {
    throw new Error(`Invalid subscription date: ${serviceMonth}`);
  }
  const monthFirst = formatDateParts({ year: parsed.year, month: parsed.month, day: 1 });
  const monthLast = parseDateParts(getLastDayOfMonth(monthFirst));
  if (!monthLast) {
    throw new Error(`Unable to resolve last day of month for ${serviceMonth}`);
  }
  return formatDateParts({
    year: parsed.year,
    month: parsed.month,
    day: Math.min(Math.max(1, billingAnchorDay), monthLast.day),
  });
}

export function getServiceMonth(value: SubscriptionDateString): SubscriptionDateString {
  return getFirstDayOfMonth(value);
}

export function getDaysInMonth(value: SubscriptionDateString): number {
  return Number(getLastDayOfMonth(value).slice(-2));
}

export function diffInCalendarDaysInclusive(start: SubscriptionDateString, end: SubscriptionDateString): number {
  const parsedStart = parseDateParts(start);
  const parsedEnd = parseDateParts(end);
  if (!parsedStart || !parsedEnd) {
    throw new Error(`Invalid subscription date range: ${start}..${end}`);
  }

  const startUtc = Date.UTC(parsedStart.year, parsedStart.month - 1, parsedStart.day);
  const endUtc = Date.UTC(parsedEnd.year, parsedEnd.month - 1, parsedEnd.day);
  if (endUtc < startUtc) {
    throw new Error(`End date must not be before start date: ${start}..${end}`);
  }

  return Math.floor((endUtc - startUtc) / (24 * 60 * 60 * 1000)) + 1;
}

export function toBerlinStartOfDayIso(value: SubscriptionDateString): string {
  const parsed = parseDateParts(value);
  if (!parsed) {
    throw new Error(`Invalid subscription date: ${value}`);
  }
  return zonedDateTimeToIso(parsed.year, parsed.month, parsed.day, 0, 0, 0, 0, SUBSCRIPTION_DOMAIN_TIME_ZONE);
}

export function toBerlinEndOfDayIso(value: SubscriptionDateString): string {
  const parsed = parseDateParts(value);
  if (!parsed) {
    throw new Error(`Invalid subscription date: ${value}`);
  }
  return zonedDateTimeToIso(parsed.year, parsed.month, parsed.day, 23, 59, 59, 999, SUBSCRIPTION_DOMAIN_TIME_ZONE);
}

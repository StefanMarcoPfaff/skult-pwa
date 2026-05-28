const BERLIN_TIME_ZONE = "Europe/Berlin";

export function formatBerlinDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatBerlinDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN_TIME_ZONE,
    dateStyle: "medium",
  }).format(date);
}

function getBerlinDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BERLIN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const partValue = (type: string) => Number(parts.find((part) => part.type === type)?.value);

  return {
    year: partValue("year"),
    month: partValue("month"),
    day: partValue("day"),
  };
}

function getBerlinOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BERLIN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const partValue = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const berlinAsUtc = Date.UTC(
    partValue("year"),
    partValue("month") - 1,
    partValue("day"),
    partValue("hour"),
    partValue("minute"),
    partValue("second")
  );

  return berlinAsUtc - date.getTime();
}

export function getBerlinStartOfTodayUtcIso(now = new Date()): string {
  const { year, month, day } = getBerlinDateParts(now);
  const approximateUtcMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const offsetMs = getBerlinOffsetMs(approximateUtcMidnight);

  return new Date(approximateUtcMidnight.getTime() - offsetMs).toISOString();
}

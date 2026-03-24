const DEFAULT_SITE_URL = "http://localhost:3000";

export type CalendarEventParams = {
  title: string;
  startsAt: string;
  endsAt?: string | null;
  location?: string | null;
  description?: string | null;
  filename?: string | null;
};

function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "event";
}

function toIcsDate(value: string): string {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildCalendarUrl(input: CalendarEventParams): string {
  const url = new URL("/api/calendar", getSiteUrl());
  url.searchParams.set("title", input.title);
  url.searchParams.set("starts_at", input.startsAt);
  if (input.endsAt) url.searchParams.set("ends_at", input.endsAt);
  if (input.location) url.searchParams.set("location", input.location);
  if (input.description) url.searchParams.set("description", input.description);
  if (input.filename) url.searchParams.set("filename", sanitizeFileName(input.filename));
  return url.toString();
}

export function buildCalendarFile(input: CalendarEventParams): { filename: string; content: string } {
  const uid = `${sanitizeFileName(input.filename ?? input.title)}@reser`;
  const now = new Date().toISOString();
  const endsAt =
    input.endsAt && !Number.isNaN(new Date(input.endsAt).getTime())
      ? input.endsAt
      : new Date(new Date(input.startsAt).getTime() + 60 * 60 * 1000).toISOString();

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RESER//Calendar//DE",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toIcsDate(now)}`,
    `DTSTART:${toIcsDate(input.startsAt)}`,
    `DTEND:${toIcsDate(endsAt)}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    input.location ? `LOCATION:${escapeIcsText(input.location)}` : null,
    input.description ? `DESCRIPTION:${escapeIcsText(input.description)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return {
    filename: `${sanitizeFileName(input.filename ?? input.title)}.ics`,
    content: `${lines.join("\r\n")}\r\n`,
  };
}

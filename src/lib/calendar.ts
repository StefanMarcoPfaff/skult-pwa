import { generateRecurringCourseSessions } from "@/lib/course-sessions";
import { getSiteUrl } from "@/lib/site-url";

const DEFAULT_EVENT_DURATION_MINUTES = 60;
const DEFAULT_CALENDAR_PROD_ID = "-//RESER//Calendar//DE";

export type CalendarBookingSource = "ticket" | "trial" | "registered" | "workshop";

export type CalendarFileEvent = {
  title: string;
  startsAt: string;
  endsAt?: string | null;
  location?: string | null;
  description?: string | null;
  uid?: string | null;
  recurrenceRule?: string | null;
};

export type CalendarFileInput = {
  filename?: string | null;
  events: CalendarFileEvent[];
};

export type CalendarCourseInput = {
  courseId: string;
  title: string;
  location?: string | null;
  locationDetails?: string | null;
  publicUrl?: string | null;
  startsAt?: string | null;
  durationMinutes?: number | null;
  weekday?: number | null;
  startTime?: string | null;
  recurrenceType?: string | null;
};

export type CalendarSessionInput = {
  courseId: string;
  title: string;
  location?: string | null;
  locationDetails?: string | null;
  publicUrl?: string | null;
  sessions: Array<{
    id?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
  }>;
};

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "event";
}

function normalizeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
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

function foldIcsLine(value: string): string {
  if (value.length <= 74) return value;

  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += 74) {
    chunks.push(index === 0 ? value.slice(index, index + 74) : ` ${value.slice(index, index + 74)}`);
  }
  return chunks.join("\r\n");
}

function buildEventUid(event: CalendarFileEvent, index: number, filename: string): string {
  const normalizedStart = normalizeDate(event.startsAt)?.toISOString() ?? `index-${index}`;
  return `${sanitizeFileName(event.uid ?? `${filename}-${normalizedStart}`)}@reser`;
}

function resolveEventEnd(event: CalendarFileEvent): string {
  const explicitEnd = normalizeDate(event.endsAt ?? null);
  if (explicitEnd) return explicitEnd.toISOString();

  const start = normalizeDate(event.startsAt);
  if (!start) {
    return new Date(Date.now() + DEFAULT_EVENT_DURATION_MINUTES * 60 * 1000).toISOString();
  }

  return new Date(start.getTime() + DEFAULT_EVENT_DURATION_MINUTES * 60 * 1000).toISOString();
}

export function getCalendarLocation(location?: string | null, locationDetails?: string | null): string | null {
  const parts = [location?.trim(), locationDetails?.trim()].filter(
    (value): value is string => Boolean(value)
  );
  return parts.length > 0 ? parts.join(" | ") : null;
}

export function buildCalendarDescription(input: {
  publicUrl?: string | null;
  summaryLines?: Array<string | null | undefined>;
}): string | null {
  const lines = (input.summaryLines ?? [])
    .map((line) => line?.trim() ?? "")
    .filter((line) => line.length > 0);

  if (input.publicUrl?.trim()) {
    lines.push(`RESER-Link: ${input.publicUrl.trim()}`);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

export function buildCalendarFile(input: CalendarFileInput): { filename: string; content: string } {
  const filenameBase = sanitizeFileName(input.filename ?? "event");
  const validEvents = input.events.filter((event) => normalizeDate(event.startsAt));

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${DEFAULT_CALENDAR_PROD_ID}`,
    "CALSCALE:GREGORIAN",
  ];

  const now = new Date().toISOString();

  validEvents.forEach((event, index) => {
    const eventLines = [
      "BEGIN:VEVENT",
      `UID:${buildEventUid(event, index, filenameBase)}`,
      `DTSTAMP:${toIcsDate(now)}`,
      `DTSTART:${toIcsDate(event.startsAt)}`,
      `DTEND:${toIcsDate(resolveEventEnd(event))}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      event.location ? `LOCATION:${escapeIcsText(event.location)}` : null,
      event.description ? `DESCRIPTION:${escapeIcsText(event.description)}` : null,
      event.recurrenceRule ? `RRULE:${event.recurrenceRule}` : null,
      "END:VEVENT",
    ].filter((line): line is string => Boolean(line));

    lines.push(...eventLines.map(foldIcsLine));
  });

  lines.push("END:VCALENDAR");

  return {
    filename: `${filenameBase}.ics`,
    content: `${lines.join("\r\n")}\r\n`,
  };
}

export function buildOfferCalendarPath(offerId: string): string {
  return `/api/calendar/offer/${encodeURIComponent(offerId)}`;
}

export function buildOfferCalendarUrl(offerId: string): string {
  return new URL(buildOfferCalendarPath(offerId), getSiteUrl()).toString();
}

export function buildBookingCalendarPath(id: string, source: CalendarBookingSource): string {
  const url = new URL(`/api/calendar/booking/${encodeURIComponent(id)}`, getSiteUrl());
  url.searchParams.set("source", source);
  return `${url.pathname}${url.search}`;
}

export function buildBookingCalendarUrl(id: string, source: CalendarBookingSource): string {
  return new URL(buildBookingCalendarPath(id, source), getSiteUrl()).toString();
}

export function buildRecurringCourseCalendarEvent(input: CalendarCourseInput): CalendarFileEvent | null {
  if (
    !input.startsAt ||
    !input.startTime ||
    !input.recurrenceType ||
    input.durationMinutes === null ||
    input.durationMinutes === undefined ||
    input.durationMinutes <= 0
  ) {
    return null;
  }

  const now = new Date();
  const fromDate = new Date(now.getTime() - input.durationMinutes * 60 * 1000);
  const untilDate = new Date(now);
  untilDate.setMonth(untilDate.getMonth() + 6);

  const occurrences = generateRecurringCourseSessions({
    starts_at: input.startsAt,
    weekday: input.weekday ?? null,
    start_time: input.startTime,
    duration_minutes: input.durationMinutes,
    recurrence_type: input.recurrenceType,
    fromDate,
    untilDate,
    limit: 24,
  });

  const nextOccurrence = occurrences.find((occurrence) => {
    const endsAt = normalizeDate(occurrence.ends_at);
    return endsAt ? endsAt.getTime() >= now.getTime() : true;
  });

  if (!nextOccurrence) return null;

  return {
    title: input.title,
    startsAt: nextOccurrence.starts_at,
    endsAt: nextOccurrence.ends_at,
    location: getCalendarLocation(input.location, input.locationDetails),
    description: buildCalendarDescription({
      publicUrl: input.publicUrl,
      summaryLines: [
        "Fortlaufendes Angebot auf RESER",
        "Kalenderdatei enthaelt den naechsten konkreten Termin.",
      ],
    }),
    uid: `course-${input.courseId}`,
  };
}

export function buildSessionCalendarEvents(input: CalendarSessionInput): CalendarFileEvent[] {
  const location = getCalendarLocation(input.location, input.locationDetails);

  return input.sessions
    .filter((session) => normalizeDate(session.starts_at ?? null))
    .map((session, index) => ({
      title: input.title,
      startsAt: session.starts_at as string,
      endsAt: session.ends_at ?? null,
      location,
      description: buildCalendarDescription({
        publicUrl: input.publicUrl,
      }),
      uid: `session-${input.courseId}-${session.id ?? index + 1}`,
    }));
}

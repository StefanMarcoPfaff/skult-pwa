export type CourseRecurrenceType = "weekly" | "biweekly" | "monthly";

export type GenerateCourseSessionsInput = {
  starts_at: string | null;
  weekday: number | null;
  start_time: string | null;
  duration_minutes: number | null;
  recurrence_type: string | null;
  fromDate: Date;
  untilDate: Date;
  limit: number;
};

export type CourseSessionOccurrence = {
  starts_at: string;
  ends_at: string;
};

const MS_PER_MINUTE = 60 * 1000;

function parseRecurrenceType(value: string | null): CourseRecurrenceType | null {
  if (value === "weekly" || value === "biweekly" || value === "monthly") return value;
  return null;
}

function parseTime(startTime: string | null): { hour: number; minute: number } | null {
  if (!startTime) return null;

  const match = startTime.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;

  return { hour, minute };
}

function toValidDate(value: string | null): Date | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function normalizeAnchorDate(
  startsAt: Date,
  weekday: number | null,
  startTime: string | null
): Date | null {
  if (weekday !== null && (weekday < 0 || weekday > 6 || !Number.isInteger(weekday))) {
    return null;
  }

  const anchor = new Date(startsAt);
  const parsedTime = parseTime(startTime);
  if (parsedTime) {
    anchor.setHours(parsedTime.hour, parsedTime.minute, 0, 0);
  }

  return anchor;
}

function addMonthsFromAnchor(anchor: Date, monthsToAdd: number): Date {
  const year = anchor.getFullYear();
  const month = anchor.getMonth() + monthsToAdd;
  const day = anchor.getDate();
  const hour = anchor.getHours();
  const minute = anchor.getMinutes();
  const second = anchor.getSeconds();
  const ms = anchor.getMilliseconds();

  const monthStart = new Date(year, month, 1, hour, minute, second, ms);
  const lastDayOfMonth = new Date(year, month + 1, 0, hour, minute, second, ms).getDate();
  monthStart.setDate(Math.min(day, lastDayOfMonth));

  return monthStart;
}

function addDaysInLocalTime(date: Date, daysToAdd: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + daysToAdd);
  return next;
}

function buildOccurrence(startsAt: Date, durationMinutes: number): CourseSessionOccurrence {
  return {
    starts_at: startsAt.toISOString(),
    ends_at: new Date(startsAt.getTime() + durationMinutes * MS_PER_MINUTE).toISOString(),
  };
}

export function generateRecurringCourseSessions(
  input: GenerateCourseSessionsInput
): CourseSessionOccurrence[] {
  const recurrenceType = parseRecurrenceType(input.recurrence_type?.toLowerCase() ?? null);
  if (!recurrenceType) return [];
  if (!Number.isInteger(input.limit) || input.limit <= 0) return [];
  if (input.duration_minutes === null || input.duration_minutes <= 0) return [];

  const rawAnchor = toValidDate(input.starts_at);
  if (!rawAnchor) return [];

  const anchor = normalizeAnchorDate(rawAnchor, input.weekday, input.start_time);
  if (!anchor) return [];

  const fromTime = input.fromDate.getTime();
  const untilTime = input.untilDate.getTime();
  if (Number.isNaN(fromTime) || Number.isNaN(untilTime) || fromTime > untilTime) return [];

  const occurrences: CourseSessionOccurrence[] = [];

  if (recurrenceType === "weekly") {
    // starts_at is the explicit course start anchor; weekly sessions advance from that date in 7-day steps.
    let occurrence = new Date(anchor);
    while (occurrence.getTime() < fromTime) {
      occurrence = addDaysInLocalTime(occurrence, 7);
    }

    while (occurrence.getTime() <= untilTime && occurrences.length < input.limit) {
      occurrences.push(buildOccurrence(occurrence, input.duration_minutes));
      occurrence = addDaysInLocalTime(occurrence, 7);
    }

    return occurrences;
  }

  if (recurrenceType === "biweekly") {
    // starts_at is the explicit course start anchor so a 14-day rhythm stays fixed even when viewed weeks later.
    let occurrence = new Date(anchor);
    while (occurrence.getTime() < fromTime) {
      occurrence = addDaysInLocalTime(occurrence, 14);
    }

    while (occurrence.getTime() <= untilTime && occurrences.length < input.limit) {
      occurrences.push(buildOccurrence(occurrence, input.duration_minutes));
      occurrence = addDaysInLocalTime(occurrence, 14);
    }

    return occurrences;
  }

  // starts_at is the explicit course start anchor so monthly recurrences keep the original calendar position.
  let monthOffset = 0;
  let occurrence = addMonthsFromAnchor(anchor, monthOffset);
  while (occurrence.getTime() < fromTime) {
    monthOffset += 1;
    occurrence = addMonthsFromAnchor(anchor, monthOffset);
  }

  while (occurrence.getTime() <= untilTime && occurrences.length < input.limit) {
    occurrences.push(buildOccurrence(occurrence, input.duration_minutes));
    monthOffset += 1;
    occurrence = addMonthsFromAnchor(anchor, monthOffset);
  }

  return occurrences;
}

export const COURSE_BERLIN_TIME_ZONE = "Europe/Berlin";

export type CourseStatus =
  | "draft"
  | "active"
  | "pause_scheduled"
  | "paused"
  | "stop_scheduled"
  | "ended";

const COURSE_STATUS_VALUES: CourseStatus[] = [
  "draft",
  "active",
  "pause_scheduled",
  "paused",
  "stop_scheduled",
  "ended",
];

type TimeZoneDateParts = {
  year: number;
  month: number;
  day: number;
};

function getTimeZoneDateParts(referenceDate: Date, timeZone: string): TimeZoneDateParts {
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

function parseDateInput(value: string): TimeZoneDateParts | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

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

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateParts(parts: TimeZoneDateParts): string {
  return `${parts.year}-${padDatePart(parts.month)}-${padDatePart(parts.day)}`;
}

export function getBerlinTodayDate(referenceDate: Date = new Date()): string {
  return formatDateParts(getTimeZoneDateParts(referenceDate, COURSE_BERLIN_TIME_ZONE));
}

export function isFirstDayOfMonthDate(value: string): boolean {
  const parts = parseDateInput(value);
  return Boolean(parts && parts.day === 1);
}

export function isLastDayOfMonthDate(value: string): boolean {
  const parts = parseDateInput(value);
  if (!parts) return false;

  const lastDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
  return parts.day === lastDay;
}

export function toCourseLifecycleDate(value: string): string | null {
  const parts = parseDateInput(value);
  if (!parts) return null;
  return formatDateParts(parts);
}

export function getLastDayOfMonthDate(year: number, month: number): string {
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return formatDateParts({ year, month, day });
}

export function getFirstDayOfNextMonthDate(value: string): string | null {
  const parts = parseDateInput(value);
  if (!parts) return null;

  const year = parts.month === 12 ? parts.year + 1 : parts.year;
  const month = parts.month === 12 ? 1 : parts.month + 1;
  return formatDateParts({ year, month, day: 1 });
}

export function getNextPossiblePauseDate(referenceDate: Date = new Date()): string {
  const { year, month } = getTimeZoneDateParts(referenceDate, COURSE_BERLIN_TIME_ZONE);
  return getLastDayOfMonthDate(year, month);
}

export function formatCourseLifecycleDate(value: string | null): string | null {
  if (!value) return null;
  const parts = parseDateInput(value);
  if (!parts) return null;

  return new Intl.DateTimeFormat("de-DE", {
    timeZone: COURSE_BERLIN_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

export function getCourseStatusLabel(status: CourseStatus): string {
  switch (status) {
    case "draft":
      return "Entwurf";
    case "active":
      return "Aktiv";
    case "pause_scheduled":
      return "Pause geplant";
    case "paused":
      return "Pausiert";
    case "stop_scheduled":
      return "Stopp geplant";
    case "ended":
      return "Beendet";
    default:
      return status;
  }
}

export function isCourseStatus(value: string | null | undefined): value is CourseStatus {
  return COURSE_STATUS_VALUES.includes(value as CourseStatus);
}

export function resolveDashboardCourseStatus(input: {
  status?: string | null;
  isPublished?: boolean | null;
  endsAt?: string | null;
}): CourseStatus {
  if (isCourseStatus(input.status)) {
    return input.status;
  }

  if (input.isPublished) {
    return "active";
  }

  if (input.endsAt) {
    const endsAt = new Date(input.endsAt).getTime();
    if (Number.isFinite(endsAt) && endsAt < Date.now()) {
      return "ended";
    }
  }

  return "draft";
}

export function isCourseOpenForNewRegistrations(
  status: CourseStatus | null | undefined,
  endsAt: string | null | undefined
): boolean {
  if (status === "draft" || status === "paused" || status === "ended") {
    return false;
  }

  if (!endsAt) return true;
  const parsed = new Date(endsAt).getTime();
  return !Number.isNaN(parsed);
}

export function isCourseLifecyclePubliclyVisible(
  status: CourseStatus | null | undefined
): boolean {
  return status === "active" || status === "pause_scheduled" || status === "stop_scheduled";
}

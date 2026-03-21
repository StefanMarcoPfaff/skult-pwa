export const COURSE_END_NOTICE_DAYS = 28;

function parseDateInput(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

  const candidate = new Date(year, month - 1, day);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }

  return candidate;
}

export function getMinimumCourseEndDate(now = new Date()): Date {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  startOfToday.setDate(startOfToday.getDate() + COURSE_END_NOTICE_DAYS);
  return startOfToday;
}

export function getMinimumCourseEndDateInput(now = new Date()): string {
  const date = getMinimumCourseEndDate(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toCourseEndIso(value: string): string | null {
  const date = parseDateInput(value);
  if (!date) return null;

  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

export function formatCourseEndDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function isCourseEnded(value: string | null, now = new Date()): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < now.getTime();
}

export function isCourseEndingScheduled(value: string | null, now = new Date()): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() >= now.getTime();
}

export function isCourseClosedForNewRegistrations(value: string | null): boolean {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

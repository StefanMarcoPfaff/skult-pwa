import {
  buildRecurringCourseCalendarEvent,
  buildSessionCalendarEvents,
  type CalendarFileInput,
} from "@/lib/calendar";
import { getSiteUrl } from "@/lib/site-url";

export type OfferCalendarCourseRow = {
  id: string;
  title: string | null;
  kind: string | null;
  location: string | null;
  location_details: string | null;
  starts_at: string | null;
  duration_minutes: number | null;
  weekday: number | null;
  start_time: string | null;
  recurrence_type: string | null;
};

export type OfferCalendarSessionRow = {
  id?: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

function buildPublicOfferUrl(courseId: string): string {
  return `${getSiteUrl()}/courses/${courseId}`;
}

function sanitizeOfferTitle(title: string | null, fallback: string): string {
  return title?.trim() || fallback;
}

export function hasOfferCalendarData(input: {
  kind: string | null;
  startsAt: string | null;
  durationMinutes?: number | null;
  startTime?: string | null;
  recurrenceType?: string | null;
  sessionCount?: number;
}): boolean {
  if (input.kind === "course") {
    return Boolean(
      input.startsAt &&
        input.startTime &&
        input.recurrenceType &&
        input.durationMinutes &&
        input.durationMinutes > 0
    );
  }

  return Boolean((input.sessionCount ?? 0) > 0 || input.startsAt);
}

export function buildOfferCalendarFileInput(
  course: OfferCalendarCourseRow,
  sessions: OfferCalendarSessionRow[]
): CalendarFileInput | null {
  const title = sanitizeOfferTitle(course.title, "Angebot");
  const publicUrl = buildPublicOfferUrl(course.id);

  if (course.kind === "course") {
    const event = buildRecurringCourseCalendarEvent({
      courseId: course.id,
      title,
      location: course.location,
      locationDetails: course.location_details,
      publicUrl,
      startsAt: course.starts_at,
      durationMinutes: course.duration_minutes,
      weekday: course.weekday,
      startTime: course.start_time,
      recurrenceType: course.recurrence_type,
    });

    if (!event) return null;

    return {
      filename: title,
      events: [event],
    };
  }

  const events = buildSessionCalendarEvents({
    courseId: course.id,
    title,
    location: course.location,
    locationDetails: course.location_details,
    publicUrl,
    sessions,
  });

  if (events.length === 0 && course.starts_at) {
    return {
      filename: title,
      events: [
        {
          title,
          startsAt: course.starts_at,
          location: [course.location, course.location_details].filter(Boolean).join(" | ") || null,
          description: `RESER-Link: ${publicUrl}`,
          uid: `offer-${course.id}`,
        },
      ],
    };
  }

  return events.length > 0 ? { filename: title, events } : null;
}

export function buildTrialCalendarFileInput(input: {
  reservationId: string;
  courseId: string;
  courseTitle: string | null;
  location: string | null;
  locationDetails: string | null;
  startsAt: string | null;
  endsAt: string | null;
}): CalendarFileInput | null {
  if (!input.startsAt) return null;

  const title = `Probestunde: ${sanitizeOfferTitle(input.courseTitle, "Laufendes Angebot")}`;

  return {
    filename: title,
    events: [
      {
        title,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        location: [input.location, input.locationDetails].filter(Boolean).join(" | ") || null,
        description: `RESER-Link: ${buildPublicOfferUrl(input.courseId)}`,
        uid: `trial-${input.reservationId}`,
      },
    ],
  };
}

export function buildRegisteredParticipantCalendarFileInput(
  course: OfferCalendarCourseRow
): CalendarFileInput | null {
  const title = sanitizeOfferTitle(course.title, "Laufendes Angebot");
  const event = buildRecurringCourseCalendarEvent({
    courseId: course.id,
    title,
    location: course.location,
    locationDetails: course.location_details,
    publicUrl: buildPublicOfferUrl(course.id),
    startsAt: course.starts_at,
    durationMinutes: course.duration_minutes,
    weekday: course.weekday,
    startTime: course.start_time,
    recurrenceType: course.recurrence_type,
  });

  if (!event) return null;

  return {
    filename: title,
    events: [event],
  };
}

export function buildWorkshopBookingCalendarFileInput(
  course: OfferCalendarCourseRow,
  sessions: OfferCalendarSessionRow[]
): CalendarFileInput | null {
  return buildOfferCalendarFileInput(course, sessions);
}

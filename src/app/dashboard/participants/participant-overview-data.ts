import { getParticipantArchiveEligibility } from "@/app/dashboard/archive-rules";
import { buildBookingCalendarPath } from "@/lib/calendar";
import { hasOfferCalendarData } from "@/lib/calendar-resolver";
import {
  getCourseParticipantTicketBindingId,
  hasActiveRegisteredCourseParticipation,
} from "@/lib/course-participant-bindings";
import { formatCourseLifecycleDate, getNextMonthEndDate } from "@/lib/course-lifecycle-shared";
import { buildMailtoHref, buildParticipantMailSubject } from "@/lib/mailto";
import { getOfferKindLabel } from "@/lib/offer-ui";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getContractParticipationGate } from "@/lib/subscription-participation";
import type { ParticipantOverviewItem } from "./ParticipantOverviewList";
import { getParticipantStatusPresentation } from "./participant-status-ui";
import { getParticipantLifecycleDisplay, getWorkshopParticipantLifecycleDisplay } from "./participant-lifecycle";

type CourseRow = {
  id: string;
  title: string;
  kind: string | null;
  instructor_name: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  start_time: string | null;
  duration_minutes: number | null;
  recurrence_type: string | null;
};

type SessionRow = {
  id: string;
  course_id: string;
  starts_at: string | null;
  ends_at: string | null;
};

type TrialReservationRow = {
  id: string;
  course_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status: string | null;
  decision_status: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  decision_taken_at: string | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  registration_expires_at: string | null;
  converted_at: string | null;
  cancelled_at: string | null;
  archived_at: string | null;
};

type RegistrationIntentRow = {
  id: string;
  course_id: string;
  trial_reservation_id: string | null;
  status: string | null;
  is_simulation: boolean | null;
  stripe_subscription_id: string | null;
  subscription_contract_id: string | null;
  subscription_status: string | null;
  subscription_pause_start_date: string | null;
  subscription_pause_end_date: string | null;
  subscription_stop_date: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  completed_at: string | null;
  archived_at: string | null;
};

type SubscriptionContractRow = {
  id: string;
  status: string | null;
  cancel_effective_date?: string | null;
};

type BookingRow = {
  id: string;
  course_id: string | null;
  status: string | null;
  payment_status: string | null;
  checked_in_at: string | null;
  created_at: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  refunded_at: string | null;
  stripe_refund_id: string | null;
  archived_at: string | null;
};

type TicketLookupRow = {
  id: string;
  booking_id: string | null;
  workshop_booking_guest_id?: string | null;
  trial_reservation_id: string | null;
  subscription_id: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  status: string | null;
  checked_in_at: string | null;
};

type WorkshopGuestLookupRow = {
  id: string;
  booking_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  position: number | null;
};

type AttendanceLookupRow = {
  course_id: string;
  session_id: string | null;
  event_date: string | null;
  ticket_id: string;
  checked_in_at: string;
};

type EventContext = {
  sessionId: string | null;
  eventDate: string;
};

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function participantName(firstName: string | null, lastName: string | null, fallback: string) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || fallback;
}

function needsTeacherDecision(reservation: TrialReservationRow, checkedInAt: string | null): boolean {
  return !reservation.cancelled_at && (reservation.decision_status ?? "pending") === "pending" && Boolean(checkedInAt);
}

function normalizeEventDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 10) : null;
}

function createAttendanceKey(courseId: string, sessionId: string | null, eventDate: string, ticketId: string) {
  return `${courseId}::${sessionId ?? "none"}::${eventDate}::${ticketId}`;
}

function buildModeHref(courseId: string, event: EventContext, mode: string) {
  const params = new URLSearchParams();
  params.set("mode", mode);
  if (event.sessionId) params.set("sessionId", event.sessionId);
  params.set("eventDate", event.eventDate);
  return `/dashboard/courses/${courseId}/check-in?${params.toString()}`;
}

function buildTeacherScanHref(courseId: string, event: EventContext) {
  const returnTo = buildModeHref(courseId, event, "scan");
  const params = new URLSearchParams();
  params.set("courseId", courseId);
  if (event.sessionId) params.set("sessionId", event.sessionId);
  params.set("eventDate", event.eventDate);
  params.set("returnTo", returnTo);
  return `/dashboard/check-in?${params.toString()}`;
}

function buildParticipantDetailHref(
  id: string,
  source: "trial" | "registered" | "workshop",
  options?: { ticketId?: string | null; guestId?: string | null }
) {
  const params = new URLSearchParams();
  params.set("source", source);
  params.set("from", "participants");
  if (options?.ticketId) params.set("ticketId", options.ticketId);
  if (options?.guestId) params.set("guestId", options.guestId);
  return `/dashboard/participants/${id}?${params.toString()}`;
}

function getDefaultCourseEvent(course: CourseRow, sessions: SessionRow[]): EventContext | null {
  const now = Date.now();
  const sortedSessions = [...sessions].sort((left, right) =>
    String(left.starts_at ?? "").localeCompare(String(right.starts_at ?? ""))
  );

  for (const session of sortedSessions) {
    const startTime = session.starts_at ? new Date(session.starts_at).getTime() : Number.NaN;
    const endTime = session.ends_at ? new Date(session.ends_at).getTime() : Number.NaN;
    const matchesCurrentOrFuture =
      (Number.isFinite(endTime) && endTime >= now) || (Number.isFinite(startTime) && startTime >= now);
    const eventDate = normalizeEventDate(session.starts_at);

    if (matchesCurrentOrFuture && eventDate) {
      return { sessionId: session.id, eventDate };
    }
  }

  const lastSession = sortedSessions.at(-1);
  const lastSessionDate = normalizeEventDate(lastSession?.starts_at);
  if (lastSession?.id && lastSessionDate) {
    return { sessionId: lastSession.id, eventDate: lastSessionDate };
  }

  const fallbackDate = normalizeEventDate(course.starts_at);
  if (!fallbackDate) return null;
  return { sessionId: null, eventDate: fallbackDate };
}

function getTrialEvent(reservation: TrialReservationRow, course: CourseRow, sessions: SessionRow[]): EventContext | null {
  const reservationDate = normalizeEventDate(reservation.trial_starts_at);
  if (!reservationDate) return null;

  const exactSession = sessions.find((session) => session.starts_at === reservation.trial_starts_at);
  if (exactSession) {
    return { sessionId: exactSession.id, eventDate: reservationDate };
  }

  const sameDaySession = sessions.find((session) => normalizeEventDate(session.starts_at) === reservationDate);
  if (sameDaySession) {
    return { sessionId: sameDaySession.id, eventDate: reservationDate };
  }

  return { sessionId: null, eventDate: reservationDate };
}

export async function loadParticipantOverviewItems(input: {
  teacherId: string;
  courseIds?: string[];
}): Promise<ParticipantOverviewItem[]> {
  const admin = createSupabaseAdmin();
  const { data: ownCourses } = await admin
    .from("courses")
    .select("id,title,kind,instructor_name,location,starts_at,ends_at,start_time,duration_minutes,recurrence_type")
    .eq("teacher_id", input.teacherId)
    .is("archived_at", null)
    .returns<CourseRow[]>();

  const allowedCourseIds = input.courseIds?.length ? new Set(input.courseIds) : null;
  const courses = (ownCourses ?? []).filter((course) => !allowedCourseIds || allowedCourseIds.has(course.id));
  const courseIds = courses.map((course) => course.id);
  if (courseIds.length === 0) {
    return [];
  }

  const [sessionsResult, reservationsResult, intentsResult, bookingsResult] = await Promise.all([
    admin
      .from("course_sessions")
      .select("id,course_id,starts_at,ends_at")
      .in("course_id", courseIds)
      .returns<SessionRow[]>(),
    admin
      .from("trial_reservations")
      .select(
        "id,course_id,first_name,last_name,email,status,decision_status,approved_at,rejected_at,decision_taken_at,trial_starts_at,trial_ends_at,registration_expires_at,converted_at,cancelled_at,archived_at"
      )
      .in("course_id", courseIds)
      .returns<TrialReservationRow[]>(),
    admin
      .from("course_registration_intents")
      .select(
        "id,course_id,trial_reservation_id,status,is_simulation,stripe_subscription_id,subscription_contract_id,subscription_status,subscription_pause_start_date,subscription_pause_end_date,subscription_stop_date,first_name,last_name,email,completed_at,archived_at"
      )
      .in("course_id", courseIds)
      .returns<RegistrationIntentRow[]>(),
    admin
      .from("bookings")
      .select(
        "id,course_id,status,payment_status,checked_in_at,created_at,customer_first_name,customer_last_name,customer_email,refunded_at,stripe_refund_id,archived_at"
      )
      .in("course_id", courseIds)
      .returns<BookingRow[]>(),
  ]);

  const sessions = sessionsResult.data ?? [];
  const reservations = (reservationsResult.data ?? []).filter((reservation) => !reservation.archived_at);
  const intents = (intentsResult.data ?? []).filter((intent) => !intent.archived_at);
  const bookings = (bookingsResult.data ?? []).filter((booking) => !booking.archived_at);
  const subscriptionContractIds = Array.from(
    new Set(
      intents
        .map((intent) => intent.subscription_contract_id)
        .filter((contractId): contractId is string => Boolean(contractId))
    )
  );
  const { data: subscriptionContracts } =
    subscriptionContractIds.length > 0
      ? await admin
          .from("subscription_contracts")
          .select("id,status,cancel_effective_date")
          .in("id", subscriptionContractIds)
          .returns<SubscriptionContractRow[]>()
      : { data: [] as SubscriptionContractRow[] };
  const contractStatusById = new Map(
    (subscriptionContracts ?? []).map((contract) => [contract.id, contract.status ?? null] as const)
  );
  const contractById = new Map((subscriptionContracts ?? []).map((contract) => [contract.id, contract] as const));

  const trialReservationIds = reservations.map((reservation) => reservation.id);
  const subscriptionIds = intents
    .map((intent) =>
      getCourseParticipantTicketBindingId(intent, contractStatusById.get(intent.subscription_contract_id ?? "") ?? null)
    )
    .filter((bindingId): bindingId is string => Boolean(bindingId));
  const bookingIds = bookings.map((booking) => booking.id);

  const [trialTicketsResult, subscriptionTicketsResult, workshopTicketsResult] = await Promise.all([
    trialReservationIds.length > 0
      ? admin
          .from("tickets")
          .select("id,booking_id,trial_reservation_id,subscription_id,status,checked_in_at")
          .in("trial_reservation_id", trialReservationIds)
          .returns<TicketLookupRow[]>()
      : Promise.resolve({ data: [] as TicketLookupRow[] }),
    subscriptionIds.length > 0
      ? admin
          .from("tickets")
          .select("id,booking_id,trial_reservation_id,subscription_id,status,checked_in_at")
          .in("subscription_id", subscriptionIds)
          .returns<TicketLookupRow[]>()
      : Promise.resolve({ data: [] as TicketLookupRow[] }),
    bookingIds.length > 0
      ? admin
          .from("tickets")
          .select("id,booking_id,workshop_booking_guest_id,trial_reservation_id,subscription_id,customer_name,customer_email,status,checked_in_at")
          .in("booking_id", bookingIds)
          .returns<TicketLookupRow[]>()
      : Promise.resolve({ data: [] as TicketLookupRow[] }),
  ]);

  const { data: workshopGuests } =
    bookingIds.length > 0
      ? await admin
          .from("workshop_booking_guests")
          .select("id,booking_id,first_name,last_name,email,position")
          .in("booking_id", bookingIds)
          .returns<WorkshopGuestLookupRow[]>()
      : { data: [] as WorkshopGuestLookupRow[] };

  const ticketRows = [
    ...(trialTicketsResult.data ?? []),
    ...(subscriptionTicketsResult.data ?? []),
    ...(workshopTicketsResult.data ?? []),
  ];
  const ticketIds = ticketRows.map((ticket) => ticket.id);

  const { data: attendanceRows } =
    ticketIds.length > 0
      ? await admin
          .from("attendance_records")
          .select("course_id,session_id,event_date,ticket_id,checked_in_at")
          .in("course_id", courseIds)
          .in("ticket_id", ticketIds)
          .returns<AttendanceLookupRow[]>()
      : { data: [] as AttendanceLookupRow[] };

  const courseById = new Map(courses.map((course) => [course.id, course]));
  const sessionsByCourseId = new Map<string, SessionRow[]>();
  for (const session of sessions) {
    const existing = sessionsByCourseId.get(session.course_id) ?? [];
    existing.push(session);
    sessionsByCourseId.set(session.course_id, existing);
  }

  const completedIntentByReservationId = new Map(
    intents
      .filter(
        (intent) =>
          intent.trial_reservation_id &&
          hasActiveRegisteredCourseParticipation(intent, contractStatusById.get(intent.subscription_contract_id ?? "") ?? null)
      )
      .map((intent) => [intent.trial_reservation_id as string, intent])
  );
  const trialTicketByReservationId = new Map(
    (trialTicketsResult.data ?? [])
      .filter((ticket) => ticket.trial_reservation_id)
      .map((ticket) => [ticket.trial_reservation_id as string, ticket])
  );
  const subscriptionTicketById = new Map(
    (subscriptionTicketsResult.data ?? [])
      .filter((ticket) => ticket.subscription_id)
      .map((ticket) => [ticket.subscription_id as string, ticket])
  );
  const workshopTicketsByBookingId = new Map<string, TicketLookupRow[]>();
  for (const ticket of (workshopTicketsResult.data ?? []).filter((row) => row.booking_id)) {
    const bookingId = ticket.booking_id as string;
    const current = workshopTicketsByBookingId.get(bookingId) ?? [];
    current.push(ticket);
    workshopTicketsByBookingId.set(bookingId, current);
  }
  for (const tickets of workshopTicketsByBookingId.values()) {
    tickets.sort((left, right) => {
      if (!left.workshop_booking_guest_id && right.workshop_booking_guest_id) return -1;
      if (left.workshop_booking_guest_id && !right.workshop_booking_guest_id) return 1;
      return String(left.customer_name ?? "").localeCompare(String(right.customer_name ?? ""), "de", {
        sensitivity: "base",
      });
    });
  }
  const workshopGuestById = new Map((workshopGuests ?? []).map((guest) => [guest.id, guest] as const));
  const attendanceByKey = new Map(
    ((attendanceRows as AttendanceLookupRow[] | null) ?? []).map((row) => [
      createAttendanceKey(row.course_id, row.session_id, row.event_date ?? "", row.ticket_id),
      row,
    ])
  );

  const defaultMonthEnd = getNextMonthEndDate();
  const items: ParticipantOverviewItem[] = [];

  for (const reservation of reservations) {
    if (completedIntentByReservationId.has(reservation.id)) continue;

    const course = courseById.get(reservation.course_id);
    if (!course) continue;

    const ticket = trialTicketByReservationId.get(reservation.id);
    const event = getTrialEvent(reservation, course, sessionsByCourseId.get(course.id) ?? []);
    const checkedInAt =
      ticket && event
        ? attendanceByKey.get(createAttendanceKey(course.id, event.sessionId, event.eventDate, ticket.id))
            ?.checked_in_at ??
          ticket.checked_in_at ??
          null
        : ticket?.checked_in_at ?? null;
    const lifecycle = getParticipantLifecycleDisplay({
      reservationCancelledAt: reservation.cancelled_at,
      reservationDecisionStatus: reservation.decision_status,
      trialTicketStatus: ticket?.status ?? null,
      hasCompletedRegistration: false,
    });
    const mailHref = buildMailtoHref({
      to: reservation.email ? [reservation.email] : [],
      subject: buildParticipantMailSubject(course.title),
    });
    const trialNeedsDecision = needsTeacherDecision(reservation, checkedInAt);
    const trialStatus = {
      kind: "trial" as const,
      decisionStatus: reservation.decision_status,
      cancelledAt: reservation.cancelled_at,
    };
    const trialStatusPresentation = getParticipantStatusPresentation(trialStatus, checkedInAt);
    const checkInEnabled =
      Boolean(ticket && event) &&
      !checkedInAt &&
      !reservation.cancelled_at &&
      reservation.decision_status !== "rejected";
    const trialCalendarEnabled = Boolean(reservation.trial_starts_at);
    const archiveEligibility = getParticipantArchiveEligibility({
      source: "trial",
      archivedAt: reservation.archived_at,
      decisionStatus: reservation.decision_status,
      cancelledAt: reservation.cancelled_at,
      checkedInAt,
      hasCompletedRegistration: false,
    });

    items.push({
      id: `trial-${reservation.id}`,
      detailHref: buildParticipantDetailHref(reservation.id, "trial"),
      displayName: participantName(reservation.first_name, reservation.last_name, "Probeteilnahme"),
      email: reservation.email,
      offerId: course.id,
      offerTitle: course.title,
      offerKindLabel: getOfferKindLabel(course.kind),
      sourceLabel: "Probeteilnahme",
      metaLabel:
        reservation.trial_starts_at && reservation.trial_ends_at
          ? `${formatDateTime(reservation.trial_starts_at)} - ${formatDateTime(reservation.trial_ends_at)}`
          : reservation.trial_starts_at
            ? formatDateTime(reservation.trial_starts_at)
            : null,
      decisionInfo:
        (reservation.decision_status ?? "pending") === "approved" && reservation.registration_expires_at
          ? `Freigegeben bis ${formatDateTime(reservation.registration_expires_at)}`
          : reservation.decision_status === "rejected"
            ? `Abgesagt am ${formatDateTime(reservation.decision_taken_at ?? reservation.rejected_at)}`
            : null,
      highlight: trialNeedsDecision,
      status: trialStatus,
      statusLabel: trialStatusPresentation.sortLabel,
      mailHref,
      calendarAction: {
        href: trialCalendarEnabled ? buildBookingCalendarPath(reservation.id, "trial") : null,
        disabledReason: trialCalendarEnabled ? null : "Kalenderdatei erst mit Termin verfügbar",
      },
      lifecycleAction: {
        kind: "trial",
        reservationId: reservation.id,
        redirectTo: "/dashboard/participants",
        playClassName: lifecycle.playClassName,
        pauseClassName: lifecycle.pauseClassName,
        stopClassName: lifecycle.stopClassName,
        playDisabled: lifecycle.playDisabled,
        stopDisabled: lifecycle.stopDisabled,
        showApprovalAction: trialNeedsDecision,
        showCancellationAction: !reservation.cancelled_at && reservation.status !== "cancelled",
      },
      checkIn:
        ticket && event
          ? {
              courseId: course.id,
              sessionId: event.sessionId,
              eventDate: event.eventDate,
              ticketId: ticket.id,
              room: course.location,
              instructorName: course.instructor_name,
              scanHref: buildTeacherScanHref(course.id, event),
              showHref: buildModeHref(course.id, event, "show"),
              enabled: checkInEnabled,
              disabledReason: checkedInAt
                ? "Bereits eingecheckt"
                : reservation.cancelled_at || reservation.decision_status === "rejected"
                  ? "Nicht mehr eincheckbar"
                  : "Nicht eincheckbar",
              checkedInAt,
            }
          : null,
      archiveAction: {
        participantId: reservation.id,
        source: "trial",
        redirectTo: "/dashboard/participants",
        title: "Teilnahme archivieren?",
        text: "Die Probeteilnahme bleibt historisch erhalten und wird nur aus den aktiven Übersichten entfernt.",
        allowed: archiveEligibility.allowed,
        reason: archiveEligibility.reason,
      },
      sortDate: reservation.trial_starts_at ?? reservation.trial_ends_at ?? "",
    });
  }

  for (const intent of intents) {
    const subscriptionContractStatus = contractStatusById.get(intent.subscription_contract_id ?? "") ?? null;
    const participantBindingId = getCourseParticipantTicketBindingId(intent, subscriptionContractStatus);
    if (!participantBindingId) continue;

    const course = courseById.get(intent.course_id);
    if (!course) continue;

    const ticket = subscriptionTicketById.get(participantBindingId);
    const event = getDefaultCourseEvent(course, sessionsByCourseId.get(course.id) ?? []);
    const participationGate = getContractParticipationGate({
      contractStatus: subscriptionContractStatus,
      subscriptionStatus: intent.subscription_status ?? null,
      pauseStartDate: intent.subscription_pause_start_date,
      pauseEndDate: intent.subscription_pause_end_date,
      cancelEffectiveDate: contractById.get(intent.subscription_contract_id ?? "")?.cancel_effective_date ?? null,
      subscriptionStopDate: intent.subscription_stop_date,
      eventDate: event?.eventDate ?? null,
    });
    const checkedInAt =
      ticket && event
        ? attendanceByKey.get(createAttendanceKey(course.id, event.sessionId, event.eventDate, ticket.id))
            ?.checked_in_at ?? null
        : null;
    const lifecycle = getParticipantLifecycleDisplay({
      hasCompletedRegistration: true,
      subscriptionStatus: intent.subscription_status ?? null,
    });
    const mailHref = buildMailtoHref({
      to: intent.email ? [intent.email] : [],
      subject: buildParticipantMailSubject(course.title),
    });
    const checkInEnabled =
      Boolean(ticket && event) &&
      !checkedInAt &&
      participationGate.allowed;
    const registeredCalendarEnabled = hasOfferCalendarData({
      kind: course.kind,
      startsAt: course.starts_at,
      durationMinutes: course.duration_minutes,
      startTime: course.start_time,
      recurrenceType: course.recurrence_type,
      sessionCount: (sessionsByCourseId.get(course.id) ?? []).length,
    });
    const registeredStatus = {
      kind: "registered" as const,
      subscriptionStatus: intent.subscription_status,
      subscriptionStopDate: intent.subscription_stop_date,
    };
    const registeredStatusPresentation = getParticipantStatusPresentation(registeredStatus, checkedInAt);
    const pauseLabel =
      intent.subscription_status === "paused"
        ? "Pausiert"
        : intent.subscription_status === "pause_scheduled"
          ? "Pausierung geplant"
          : "Pausieren";
    const playLabel =
      intent.subscription_status === "paused" || intent.subscription_status === "pause_scheduled"
        ? "Angemeldet"
        : intent.subscription_status === "cancelled" || intent.subscription_status === "inactive"
          ? "Gekündigt"
          : "Verbindlich angemeldet";
    const stopLabel =
      intent.subscription_status === "cancel_scheduled"
        ? "Kündigung geplant"
        : intent.subscription_status === "cancelled" || intent.subscription_status === "inactive"
          ? "Gekündigt"
          : "Kündigen";
    const archiveEligibility = getParticipantArchiveEligibility({
      source: "registered",
      archivedAt: intent.archived_at,
      subscriptionStatus: intent.subscription_status,
      stripeSubscriptionId: participantBindingId,
      completedAt: intent.completed_at,
    });
    const hasLifecycleReservation = Boolean(intent.trial_reservation_id);
    const hasInteractiveLifecycle = hasLifecycleReservation && !intent.is_simulation;

    items.push({
      id: `registered-${intent.id}`,
      detailHref: buildParticipantDetailHref(intent.id, "registered"),
      displayName: participantName(intent.first_name, intent.last_name, "Teilnehmer*in"),
      email: intent.email,
      offerId: course.id,
      offerTitle: course.title,
      offerKindLabel: getOfferKindLabel(course.kind),
      sourceLabel: "Verbindliche Anmeldung",
      metaLabel: intent.completed_at
        ? `Angemeldet am ${formatDateTime(intent.completed_at)}`
        : intent.is_simulation
          ? "Intern aktiviert (Simulation)"
          : null,
      decisionInfo:
        intent.subscription_status === "pause_scheduled"
          ? `Pause endet am ${formatCourseLifecycleDate(intent.subscription_pause_end_date) ?? "-"}`
          : intent.subscription_status === "cancel_scheduled"
            ? `Endet am ${formatCourseLifecycleDate(intent.subscription_stop_date) ?? "-"}`
            : null,
      highlight: false,
      status: registeredStatus,
      statusLabel: registeredStatusPresentation.sortLabel,
      mailHref,
      calendarAction: {
        href:
          registeredCalendarEnabled && intent.trial_reservation_id
            ? buildBookingCalendarPath(intent.trial_reservation_id, "registered")
            : null,
        disabledReason: registeredCalendarEnabled ? null : "Kalenderdatei erst mit Termin verfügbar",
      },
      lifecycleAction: {
        kind: "registered",
        reservationId: intent.trial_reservation_id ?? "",
        redirectTo: "/dashboard/participants",
        defaultActiveUntilDate: defaultMonthEnd,
        defaultPauseEndDate: intent.subscription_pause_end_date,
        defaultStopDate: defaultMonthEnd,
        playLabel: intent.is_simulation && !hasLifecycleReservation ? "Simulation aktiv" : playLabel,
        playClassName: lifecycle.playClassName,
        pauseClassName: lifecycle.pauseClassName,
        stopClassName: lifecycle.stopClassName,
        pauseLabel: intent.is_simulation && !hasLifecycleReservation ? "Pause spaeter" : pauseLabel,
        stopLabel: intent.is_simulation && !hasLifecycleReservation ? "Kuendigung spaeter" : stopLabel,
        pauseDisabled: lifecycle.pauseDisabled || !hasInteractiveLifecycle,
        stopDisabled: lifecycle.stopDisabled || !hasInteractiveLifecycle,
      },
      checkIn:
        ticket && event
          ? {
              courseId: course.id,
              sessionId: event.sessionId,
              eventDate: event.eventDate,
              ticketId: ticket.id,
              room: course.location,
              instructorName: course.instructor_name,
              scanHref: buildTeacherScanHref(course.id, event),
              showHref: buildModeHref(course.id, event, "show"),
              enabled: checkInEnabled,
              disabledReason: checkedInAt
                ? "Bereits eingecheckt"
                : !participationGate.allowed
                  ? participationGate.reason ?? "Derzeit nicht eincheckbar"
                  : "Nicht eincheckbar",
              checkedInAt,
            }
          : null,
      archiveAction: {
        participantId: intent.trial_reservation_id ?? intent.id,
        source: "registered",
        redirectTo: "/dashboard/participants",
        title: "Teilnahme archivieren?",
        text: "Die Teilnahme bleibt historisch erhalten und wird nur aus den aktiven Übersichten entfernt.",
        allowed: hasLifecycleReservation ? archiveEligibility.allowed : false,
        reason: hasLifecycleReservation
          ? archiveEligibility.reason
          : "Direkte Kurssimulationen ohne Probeteilnahme werden erst in einem spaeteren PR archiviert.",
      },
      sortDate: intent.completed_at ?? "",
    });
  }

  for (const booking of bookings) {
    if (!booking.course_id) continue;
    const course = courseById.get(booking.course_id);
    if (!course) continue;

    const ticketsForBooking = workshopTicketsByBookingId.get(booking.id) ?? [];
    const fallbackPrimaryTicket: TicketLookupRow | null =
      ticketsForBooking.length === 0
        ? {
            id: `legacy-booking-${booking.id}`,
            booking_id: booking.id,
            workshop_booking_guest_id: null,
            trial_reservation_id: null,
            subscription_id: null,
            customer_name: participantName(booking.customer_first_name, booking.customer_last_name, "Teilnehmer*in"),
            customer_email: booking.customer_email,
            status: booking.status,
            checked_in_at: booking.checked_in_at,
          }
        : null;

    for (const ticket of fallbackPrimaryTicket ? [fallbackPrimaryTicket] : ticketsForBooking) {
      const guest = ticket.workshop_booking_guest_id
        ? workshopGuestById.get(ticket.workshop_booking_guest_id)
        : null;
      const isAdditionalParticipant = Boolean(ticket.workshop_booking_guest_id);
      const displayName = isAdditionalParticipant
        ? participantName(
            guest?.first_name ?? null,
            guest?.last_name ?? null,
            ticket.customer_name ?? "Weitere teilnehmende Person"
          )
        : participantName(
            booking.customer_first_name,
            booking.customer_last_name,
            ticket.customer_name ?? "Teilnehmer*in"
          );
      const contactEmail = isAdditionalParticipant
        ? guest?.email?.trim() || booking.customer_email || ticket.customer_email || null
        : booking.customer_email || ticket.customer_email || null;
      const hasOwnEmail = isAdditionalParticipant && Boolean(guest?.email?.trim());
      const event = getDefaultCourseEvent(course, sessionsByCourseId.get(course.id) ?? []);
      const checkedInAt =
        event && !fallbackPrimaryTicket
          ? attendanceByKey.get(createAttendanceKey(course.id, event.sessionId, event.eventDate, ticket.id))
              ?.checked_in_at ??
            ticket.checked_in_at ??
            null
          : ticket.checked_in_at ?? booking.checked_in_at ?? null;
      const lifecycle = getWorkshopParticipantLifecycleDisplay({
        bookingStatus: booking.status,
        checkedInAt,
        refundedAt: booking.refunded_at,
        stripeRefundId: booking.stripe_refund_id,
      });
      const mailHref = buildMailtoHref({
        to: contactEmail ? [contactEmail] : [],
        subject: buildParticipantMailSubject(course.title),
      });
      const workshopStatus = {
        kind: "workshop" as const,
        bookingStatus: booking.status,
        paymentStatus: booking.payment_status,
        refundedAt: booking.refunded_at,
        stripeRefundId: booking.stripe_refund_id,
      };
      const workshopStatusPresentation = getParticipantStatusPresentation(workshopStatus, checkedInAt);
      const archiveEligibility = getParticipantArchiveEligibility({
        source: "workshop",
        archivedAt: booking.archived_at,
        bookingStatus: booking.status,
        checkedInAt,
        refundedAt: booking.refunded_at,
        stripeRefundId: booking.stripe_refund_id,
      });
      const workshopCalendarEnabled = hasOfferCalendarData({
        kind: course.kind,
        startsAt: course.starts_at,
        sessionCount: (sessionsByCourseId.get(course.id) ?? []).length,
      });

      items.push({
        id: `workshop-${booking.id}-${ticket.id}`,
        detailHref: buildParticipantDetailHref(booking.id, "workshop", {
          ticketId: fallbackPrimaryTicket ? null : ticket.id,
          guestId: ticket.workshop_booking_guest_id ?? null,
        }),
        displayName,
        email: contactEmail,
        offerId: course.id,
        offerTitle: course.title,
        offerKindLabel: getOfferKindLabel(course.kind),
        sourceLabel: isAdditionalParticipant ? "Weitere teilnehmende Person" : "Buchende Person",
        metaLabel: booking.created_at ? `Gebucht am ${formatDateTime(booking.created_at)}` : null,
        decisionInfo: isAdditionalParticipant
          ? hasOwnEmail
            ? "Teil einer Mehrpersonen-Buchung"
            : "Teil einer Mehrpersonen-Buchung · Kontakt über buchende Person"
          : null,
        highlight: false,
        status: workshopStatus,
        statusLabel: workshopStatusPresentation.sortLabel,
        mailHref,
        calendarAction: {
        href: workshopCalendarEnabled ? buildBookingCalendarPath(booking.id, "workshop") : null,
        disabledReason: workshopCalendarEnabled ? null : "Kalenderdatei erst mit Termin verfügbar",
      },
      lifecycleAction: {
        kind: "workshop",
        bookingId: booking.id,
        redirectTo: "/dashboard/participants",
        paymentStatus: booking.payment_status,
        playMode: lifecycle.playMode,
        stopDisabled:
          isAdditionalParticipant ||
          booking.status !== "paid" ||
          Boolean(booking.refunded_at) ||
          Boolean(booking.stripe_refund_id),
        playClassName: lifecycle.playClassName,
        pauseClassName: lifecycle.pauseClassName,
        stopClassName: lifecycle.stopClassName,
      },
      checkIn:
        event && !fallbackPrimaryTicket
          ? {
              courseId: course.id,
              sessionId: event.sessionId,
              eventDate: event.eventDate,
              ticketId: ticket.id,
              room: course.location,
              instructorName: course.instructor_name,
              scanHref: buildTeacherScanHref(course.id, event),
              showHref: buildModeHref(course.id, event, "show"),
              enabled:
                !checkedInAt &&
                booking.status === "paid" &&
                ticket.status !== "cancelled" &&
                ticket.status !== "expired",
              disabledReason: checkedInAt
                ? "Bereits eingecheckt"
                : booking.status !== "paid" || ticket.status === "cancelled" || ticket.status === "expired"
                  ? "Teilnahme storniert"
                  : null,
              checkedInAt,
            }
          : null,
      archiveAction: {
        participantId: booking.id,
        source: "workshop",
        redirectTo: "/dashboard/participants",
        title: "Teilnahme archivieren?",
        text: isAdditionalParticipant
          ? "Diese Person ist Teil einer Mehrpersonen-Buchung. Archivieren ist aktuell nur auf Buchungsebene vorgesehen."
          : "Die Buchung bleibt historisch erhalten und wird nur aus den aktiven Übersichten entfernt.",
        allowed: isAdditionalParticipant ? false : archiveEligibility.allowed,
        reason: isAdditionalParticipant
          ? "Einzelarchivierung pro Ticket ist als Folge-PR offen."
          : archiveEligibility.reason,
      },
      sortDate: booking.created_at ?? "",
    });
    }
  }

  items.sort((left, right) => {
    const leftPriority = left.highlight ? 0 : 1;
    const rightPriority = right.highlight ? 0 : 1;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return right.sortDate.localeCompare(left.sortDate);
  });

  return items;
}



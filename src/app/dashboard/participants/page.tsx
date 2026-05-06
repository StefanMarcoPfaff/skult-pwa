import { redirect } from "next/navigation";
import { formatCourseLifecycleDate, getNextMonthEndDate } from "@/lib/course-lifecycle-shared";
import { buildMailtoHref, buildParticipantMailSubject } from "@/lib/mailto";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getParticipantLifecycleDisplay, getWorkshopParticipantLifecycleDisplay } from "./participant-lifecycle";
import { ParticipantOverviewList, type ParticipantOverviewItem } from "./ParticipantOverviewList";

type CourseRow = {
  id: string;
  title: string;
  kind: string | null;
  instructor_name: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
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
};

type RegistrationIntentRow = {
  id: string;
  course_id: string;
  trial_reservation_id: string;
  status: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  subscription_pause_end_date: string | null;
  subscription_stop_date: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  completed_at: string | null;
};

type BookingRow = {
  id: string;
  course_id: string | null;
  status: string | null;
  checked_in_at: string | null;
  created_at: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
};

type TicketLookupRow = {
  id: string;
  booking_id: string | null;
  trial_reservation_id: string | null;
  subscription_id: string | null;
  status: string | null;
  checked_in_at: string | null;
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

function resolveSavedState(searchParams: Record<string, string | string[] | undefined>): string | null {
  const savedParam = Array.isArray(searchParams.saved) ? searchParams.saved[0] : searchParams.saved;
  if (savedParam) return savedParam;

  const approvedParam = Array.isArray(searchParams.approved) ? searchParams.approved[0] : searchParams.approved;
  const rejectedParam = Array.isArray(searchParams.rejected) ? searchParams.rejected[0] : searchParams.rejected;
  const attendanceRequiredParam = Array.isArray(searchParams.attendanceRequired)
    ? searchParams.attendanceRequired[0]
    : searchParams.attendanceRequired;
  const cancelledParam = Array.isArray(searchParams.cancelled) ? searchParams.cancelled[0] : searchParams.cancelled;

  if (approvedParam === "1") return "approved";
  if (rejectedParam === "1") return "rejected";
  if (attendanceRequiredParam === "1") return "attendance_required";
  if (cancelledParam === "1") return "cancelled";
  return null;
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

  if (course.kind === "workshop") return { sessionId: null, eventDate: reservationDate };
  return { sessionId: null, eventDate: reservationDate };
}

function FlashMessages(props: { saved: string | null }) {
  return (
    <>
      {props.saved === "approved" ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Der ProbeschÃƒÂ¼ler wurde fÃƒÂ¼r die Anmeldung freigegeben.
        </p>
      ) : null}
      {props.saved === "rejected" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Der ProbeschÃƒÂ¼ler wurde freundlich abgesagt.
        </p>
      ) : null}
      {props.saved === "attendance_required" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Eine Entscheidung ist erst mÃƒÂ¶glich, nachdem das Probestunden-Ticket eingecheckt wurde.
        </p>
      ) : null}
      {props.saved === "cancelled" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Diese Probestunden-Reservierung wurde bereits storniert und kann nicht mehr freigegeben werden.
        </p>
      ) : null}
      {props.saved === "trial_cancelled" ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Die Probestunde wurde storniert und die Benachrichtigungen wurden versendet.
        </p>
      ) : null}
      {props.saved === "trial_cancel_invalid" || props.saved === "trial_cancel_error" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Die Probestunde konnte nicht storniert werden.
        </p>
      ) : null}
      {props.saved === "participant_pause_scheduled" ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Die Teilnahme wurde pausiert bzw. zur Pause vorgemerkt.
        </p>
      ) : null}
      {props.saved === "participant_cancel_scheduled" ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Die KÃƒÂ¼ndigung wurde gespeichert.
        </p>
      ) : null}
    </>
  );
}

async function loadParticipantItems(
  searchParams: Promise<Record<string, string | string[] | undefined>>
): Promise<{ saved: string | null; items: ParticipantOverviewItem[] }> {
  const sp = await searchParams;
  const saved = resolveSavedState(sp);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createSupabaseAdmin();
  const { data: ownCourses } = await admin
    .from("courses")
    .select("id,title,kind,instructor_name,location,starts_at,ends_at")
    .eq("teacher_id", user.id)
    .returns<CourseRow[]>();

  const courses = ownCourses ?? [];
  const courseIds = courses.map((course) => course.id);
  if (courseIds.length === 0) {
    return { saved, items: [] };
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
        "id,course_id,first_name,last_name,email,status,decision_status,approved_at,rejected_at,decision_taken_at,trial_starts_at,trial_ends_at,registration_expires_at,converted_at,cancelled_at"
      )
      .in("course_id", courseIds)
      .returns<TrialReservationRow[]>(),
    admin
      .from("course_registration_intents")
      .select(
        "id,course_id,trial_reservation_id,status,stripe_subscription_id,subscription_status,subscription_pause_end_date,subscription_stop_date,first_name,last_name,email,completed_at"
      )
      .in("course_id", courseIds)
      .returns<RegistrationIntentRow[]>(),
    admin
      .from("bookings")
      .select("id,course_id,status,checked_in_at,created_at,customer_first_name,customer_last_name,customer_email")
      .in("course_id", courseIds)
      .eq("status", "paid")
      .returns<BookingRow[]>(),
  ]);

  const sessions = sessionsResult.data ?? [];
  const reservations = reservationsResult.data ?? [];
  const intents = intentsResult.data ?? [];
  const bookings = bookingsResult.data ?? [];

  const trialReservationIds = reservations.map((reservation) => reservation.id);
  const subscriptionIds = intents
    .filter((intent) => intent.status === "checkout_completed" && intent.stripe_subscription_id)
    .map((intent) => intent.stripe_subscription_id as string);
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
          .select("id,booking_id,trial_reservation_id,subscription_id,status,checked_in_at")
          .in("booking_id", bookingIds)
          .returns<TicketLookupRow[]>()
      : Promise.resolve({ data: [] as TicketLookupRow[] }),
  ]);

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
      .filter((intent) => intent.status === "checkout_completed" && intent.stripe_subscription_id)
      .map((intent) => [intent.trial_reservation_id, intent])
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
  const workshopTicketByBookingId = new Map(
    (workshopTicketsResult.data ?? [])
      .filter((ticket) => ticket.booking_id)
      .map((ticket) => [ticket.booking_id as string, ticket])
  );
  const attendanceByKey = new Map(
    ((attendanceRows as AttendanceLookupRow[] | null) ?? []).map((row) => [
      createAttendanceKey(row.course_id, row.session_id, row.event_date ?? "", row.ticket_id),
      row,
    ])
  );

  const defaultMonthEnd = getNextMonthEndDate();
  const itemsWithSortDate: Array<ParticipantOverviewItem & { sortDate: string }> = [];

  for (const reservation of reservations) {
    if (completedIntentByReservationId.has(reservation.id)) continue;

    const course = courseById.get(reservation.course_id);
    if (!course) continue;

    const ticket = trialTicketByReservationId.get(reservation.id);
    const event = getTrialEvent(reservation, course, sessionsByCourseId.get(course.id) ?? []);
    const checkedInAt =
      ticket && event
        ? attendanceByKey.get(createAttendanceKey(course.id, event.sessionId, event.eventDate, ticket.id))?.checked_in_at ??
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
    const checkInEnabled =
      Boolean(ticket && event) &&
      !checkedInAt &&
      !reservation.cancelled_at &&
      reservation.decision_status !== "rejected";

    itemsWithSortDate.push({
      id: `trial-${reservation.id}`,
      detailHref: `/dashboard/participants/${reservation.id}?source=trial`,
      displayName: participantName(reservation.first_name, reservation.last_name, "Probeschüler*in"),
      email: reservation.email,
      offerTitle: course.title,
      offerKindLabel: course.kind === "workshop" ? "Workshop" : "Kurs",
      sourceLabel: "Probestunde",
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
      status: {
        kind: "trial",
        decisionStatus: reservation.decision_status,
        cancelledAt: reservation.cancelled_at,
      },
      mailHref,
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
      sortDate: reservation.trial_starts_at ?? reservation.trial_ends_at ?? "",
    });
  }

  for (const intent of intents) {
    if (intent.status !== "checkout_completed" || !intent.stripe_subscription_id) continue;

    const course = courseById.get(intent.course_id);
    if (!course) continue;

    const ticket = subscriptionTicketById.get(intent.stripe_subscription_id);
    const event = getDefaultCourseEvent(course, sessionsByCourseId.get(course.id) ?? []);
    const checkedInAt =
      ticket && event
        ? attendanceByKey.get(createAttendanceKey(course.id, event.sessionId, event.eventDate, ticket.id))?.checked_in_at ?? null
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
      ["active", "pause_scheduled"].includes(intent.subscription_status ?? "active");

    itemsWithSortDate.push({
      id: `registered-${intent.id}`,
      detailHref: `/dashboard/participants/${intent.trial_reservation_id}?source=trial`,
      displayName: participantName(intent.first_name, intent.last_name, "Teilnehmer*in"),
      email: intent.email,
      offerTitle: course.title,
      offerKindLabel: "Kurs",
      sourceLabel: "Verbindliche Anmeldung",
      metaLabel: intent.completed_at ? `Angemeldet am ${formatDateTime(intent.completed_at)}` : null,
      decisionInfo:
        intent.subscription_status === "pause_scheduled"
          ? `Pause endet am ${formatCourseLifecycleDate(intent.subscription_pause_end_date) ?? "-"}`
          : intent.subscription_status === "cancel_scheduled"
            ? `Endet am ${formatCourseLifecycleDate(intent.subscription_stop_date) ?? "-"}`
            : null,
      highlight: false,
      status: {
        kind: "registered",
        subscriptionStatus: intent.subscription_status,
      },
      mailHref,
      lifecycleAction: {
        kind: "registered",
        reservationId: intent.trial_reservation_id,
        redirectTo: "/dashboard/participants",
        defaultActiveUntilDate: defaultMonthEnd,
        defaultPauseEndDate: intent.subscription_pause_end_date,
        defaultStopDate: defaultMonthEnd,
        playClassName: lifecycle.playClassName,
        pauseClassName: lifecycle.pauseClassName,
        stopClassName: lifecycle.stopClassName,
        pauseDisabled: lifecycle.pauseDisabled,
        stopDisabled: lifecycle.stopDisabled,
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
                : ["paused", "cancel_scheduled", "cancelled"].includes(intent.subscription_status ?? "")
                  ? "Derzeit nicht eincheckbar"
                  : "Nicht eincheckbar",
              checkedInAt,
            }
          : null,
      sortDate: intent.completed_at ?? "",
    });
  }

  for (const booking of bookings) {
    if (!booking.course_id) continue;
    const course = courseById.get(booking.course_id);
    if (!course) continue;

    const ticket = workshopTicketByBookingId.get(booking.id);
    const event = getDefaultCourseEvent(course, sessionsByCourseId.get(course.id) ?? []);
    const checkedInAt =
      ticket && event
        ? attendanceByKey.get(createAttendanceKey(course.id, event.sessionId, event.eventDate, ticket.id))?.checked_in_at ??
          ticket.checked_in_at ??
          booking.checked_in_at ??
          null
        : ticket?.checked_in_at ?? booking.checked_in_at ?? null;
    const lifecycle = getWorkshopParticipantLifecycleDisplay(booking.status === "paid");
    const mailHref = buildMailtoHref({
      to: booking.customer_email ? [booking.customer_email] : [],
      subject: buildParticipantMailSubject(course.title),
    });

    itemsWithSortDate.push({
      id: `workshop-${booking.id}`,
      detailHref: `/dashboard/participants/${booking.id}?source=workshop`,
      displayName: participantName(booking.customer_first_name, booking.customer_last_name, "Workshop-Teilnehmer*in"),
      email: booking.customer_email,
      offerTitle: course.title,
      offerKindLabel: "Workshop",
      sourceLabel: "Workshop-Buchung",
      metaLabel: booking.created_at ? `Gebucht am ${formatDateTime(booking.created_at)}` : null,
      decisionInfo: null,
      highlight: false,
      status: {
        kind: "workshop",
        bookingStatus: booking.status,
      },
      mailHref,
      lifecycleAction: {
        kind: "workshop",
        playClassName: lifecycle.playClassName,
        pauseClassName: lifecycle.pauseClassName,
        stopClassName: lifecycle.stopClassName,
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
              enabled: !checkedInAt,
              disabledReason: checkedInAt ? "Bereits eingecheckt" : null,
              checkedInAt,
            }
          : null,
      sortDate: booking.created_at ?? "",
    });
  }

  itemsWithSortDate.sort((left, right) => {
    const leftPriority = left.highlight ? 0 : 1;
    const rightPriority = right.highlight ? 0 : 1;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return right.sortDate.localeCompare(left.sortDate);
  });

  return {
    saved,
    items: itemsWithSortDate.map(({ sortDate: _sortDate, ...item }) => item),
  };
}

export default async function DashboardParticipantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { saved, items } = await loadParticipantItems(searchParams);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Teilnehmer*innen</h1>
        <p className="text-sm text-muted-foreground">
          Hier siehst du Probestunden, verbindliche Anmeldungen, Workshop-Buchungen und Check-ins fÃƒÂ¼r deine Angebote.
        </p>
      </header>

      <FlashMessages saved={saved} />

      {items.length === 0 ? (
        <section className="rounded-2xl border p-6">
          <p className="text-sm text-muted-foreground">Bisher liegen noch keine Teilnehmer*innen oder Probestunden vor.</p>
        </section>
      ) : (
        <ParticipantOverviewList items={items} />
      )}
    </main>
  );
}

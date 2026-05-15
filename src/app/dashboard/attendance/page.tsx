import Link from "next/link";
import { redirect } from "next/navigation";
import { getProviderDisplayName, type ProviderType } from "@/lib/provider-profiles";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import DashboardFilterPanel from "../_components/DashboardFilterPanel";
import DashboardPageHeader from "../_components/DashboardPageHeader";
import StatusFilterChips from "../_components/StatusFilterChips";
import AttendanceTableClient from "./AttendanceTableClient";

type SearchParams = Record<string, string | string[] | undefined>;

type CourseRow = {
  id: string;
  title: string | null;
  kind: string | null;
  teacher_id: string | null;
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

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: ProviderType | null;
  organization_name: string | null;
};

type AttendanceRow = {
  course_id: string;
  session_id: string | null;
  event_date: string | null;
  ticket_id: string;
  checked_in_at: string;
  checked_in_by: string | null;
  method: "teacher_scan" | "participant_scan" | "manual";
  room: string | null;
  instructor_name: string | null;
};

type WorkshopBookingRow = {
  id: string;
  course_id: string | null;
  status: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  created_at: string | null;
};

type TrialReservationRow = {
  id: string;
  course_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
};

type RegistrationIntentRow = {
  id: string;
  course_id: string;
  trial_reservation_id: string;
  status: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  stripe_subscription_id: string | null;
  completed_at: string | null;
};

type TicketRow = {
  id: string;
  booking_id: string | null;
  trial_reservation_id: string | null;
  subscription_id: string | null;
  customer_name: string;
  customer_email: string;
  checked_in_at: string | null;
};

type AttendanceViewRow = {
  rowKey: string;
  date: string;
  time: string;
  offerTitle: string;
  offerKind: "laufendes Angebot" | "einmaliges Angebot";
  participantName: string;
  participantEmail: string | null;
  instructorName: string;
  room: string | null;
  methodLabel: string | null;
  checkedInAt: string | null;
  status: "present" | "not_checked_in";
  sortDate: number;
};

type EventInstance = {
  courseId: string;
  sessionId: string | null;
  eventDate: string;
  startsAt: string | null;
  endsAt: string | null;
};

type CandidateParticipant = {
  ticketId: string;
  participantName: string;
  participantEmail: string | null;
  kind: "registered" | "trial" | "workshop";
  eventDate: string;
};

function getParam(sp: SearchParams, key: string): string {
  const value = sp[key];
  return Array.isArray(value) ? String(value[0] ?? "").trim() : String(value ?? "").trim();
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("de-DE", { dateStyle: "medium" });
}

function formatTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function formatName(firstName: string | null, lastName: string | null, fallback: string): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || fallback;
}

function mapMethodLabel(method: AttendanceRow["method"] | null): string | null {
  if (method === "teacher_scan") return "Anbietende scannen";
  if (method === "participant_scan") return "Teilnehmer scannt";
  if (method === "manual") return "manuell";
  return null;
}

function normalizeKind(kind: string | null): "laufendes Angebot" | "einmaliges Angebot" {
  return String(kind ?? "").toLowerCase() === "workshop" ? "einmaliges Angebot" : "laufendes Angebot";
}

function isoDateFromDateInput(value: string): string | null {
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function sameDate(value: string | null, date: string): boolean {
  return Boolean(value && value.slice(0, 10) === date);
}

function getAttendanceStatusFilter(value: string): "all" | "present" | "not_checked_in" {
  if (value === "present" || value === "not_checked_in") return value;
  return "all";
}

function buildAttendanceFilterHref(
  sp: SearchParams,
  status: "all" | "present" | "not_checked_in"
): string {
  const params = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(sp)) {
    if (key === "status" || rawValue === undefined) continue;
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (!value) continue;
    params.set(key, value);
  }

  if (status !== "all") {
    params.set("status", status);
  }

  const query = params.toString();
  return query ? `/dashboard/attendance?${query}` : "/dashboard/attendance";
}

export default async function DashboardAttendancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdmin();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const sp = await searchParams;
  const from = isoDateFromDateInput(getParam(sp, "from"));
  const to = isoDateFromDateInput(getParam(sp, "to"));
  const offerFilter = getParam(sp, "offer");
  const instructorFilter = getParam(sp, "instructor").toLowerCase();
  const roomFilter = getParam(sp, "room").toLowerCase();
  const participantFilter = getParam(sp, "participant").toLowerCase();
  const methodFilter = getParam(sp, "method");
  const statusFilter = getAttendanceStatusFilter(getParam(sp, "status"));

  const [{ data: profile }, { data: courses }] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name,last_name,provider_type,organization_name")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>(),
    admin
      .from("courses")
      .select("id,title,kind,teacher_id,instructor_name,location,starts_at,ends_at")
      .eq("teacher_id", user.id)
      .order("title", { ascending: true })
      .returns<CourseRow[]>(),
  ]);

  const providerDisplayName =
    profile?.provider_type ? getProviderDisplayName(profile.provider_type, profile) : user.email ?? "Anbietende";

  const visibleCourses = (courses ?? []).filter((course) => !offerFilter || course.id === offerFilter);
  const courseIds = visibleCourses.map((course) => course.id);
  const courseById = new Map(visibleCourses.map((course) => [course.id, course]));

  let sessionRows: SessionRow[] = [];
  let attendanceRows: AttendanceRow[] = [];
  let workshopBookings: WorkshopBookingRow[] = [];
  let trialReservations: TrialReservationRow[] = [];
  let registrationIntents: RegistrationIntentRow[] = [];
  let ticketRows: TicketRow[] = [];

  if (courseIds.length > 0) {
    const [sessionsResult, attendanceResult, workshopBookingsResult, trialReservationsResult, intentsResult] =
      await Promise.all([
        admin
          .from("course_sessions")
          .select("id,course_id,starts_at,ends_at")
          .in("course_id", courseIds)
          .returns<SessionRow[]>(),
        admin
          .from("attendance_records")
          .select("course_id,session_id,event_date,ticket_id,checked_in_at,checked_in_by,method,room,instructor_name")
          .in("course_id", courseIds)
          .returns<AttendanceRow[]>(),
        admin
          .from("bookings")
          .select("id,course_id,status,customer_first_name,customer_last_name,customer_email,created_at")
          .in("course_id", courseIds)
          .eq("status", "paid")
          .returns<WorkshopBookingRow[]>(),
        admin
          .from("trial_reservations")
          .select("id,course_id,first_name,last_name,email,trial_starts_at,trial_ends_at")
          .in("course_id", courseIds)
          .returns<TrialReservationRow[]>(),
        admin
          .from("course_registration_intents")
          .select("id,course_id,trial_reservation_id,status,first_name,last_name,email,stripe_subscription_id,completed_at")
          .in("course_id", courseIds)
          .returns<RegistrationIntentRow[]>(),
      ]);

    sessionRows = sessionsResult.data ?? [];
    attendanceRows = attendanceResult.data ?? [];
    workshopBookings = workshopBookingsResult.data ?? [];
    trialReservations = trialReservationsResult.data ?? [];
    registrationIntents = intentsResult.data ?? [];

    const bookingIds = workshopBookings.map((row) => row.id);
    const reservationIds = trialReservations.map((row) => row.id);
    const subscriptionIds = registrationIntents
      .filter((row) => row.status === "checkout_completed" && row.stripe_subscription_id)
      .map((row) => row.stripe_subscription_id as string);

    const ticketSelect =
      "id,booking_id,trial_reservation_id,subscription_id,customer_name,customer_email,checked_in_at";
    const ticketBuckets = await Promise.all([
      bookingIds.length > 0
        ? admin.from("tickets").select(ticketSelect).in("booking_id", bookingIds).returns<TicketRow[]>()
        : Promise.resolve({ data: [] as TicketRow[] }),
      reservationIds.length > 0
        ? admin
            .from("tickets")
            .select(ticketSelect)
            .in("trial_reservation_id", reservationIds)
            .returns<TicketRow[]>()
        : Promise.resolve({ data: [] as TicketRow[] }),
      subscriptionIds.length > 0
        ? admin.from("tickets").select(ticketSelect).in("subscription_id", subscriptionIds).returns<TicketRow[]>()
        : Promise.resolve({ data: [] as TicketRow[] }),
    ]);

    ticketRows = [...(ticketBuckets[0].data ?? []), ...(ticketBuckets[1].data ?? []), ...(ticketBuckets[2].data ?? [])];
  }

  const eventInstances: EventInstance[] = [];
  for (const course of visibleCourses) {
    const sessionsForCourse = sessionRows.filter((session) => session.course_id === course.id);
    if (sessionsForCourse.length > 0) {
      for (const session of sessionsForCourse) {
        eventInstances.push({
          courseId: course.id,
          sessionId: session.id,
          eventDate: String(session.starts_at ?? "").slice(0, 10),
          startsAt: session.starts_at,
          endsAt: session.ends_at,
        });
      }
      continue;
    }

    if (course.starts_at) {
      eventInstances.push({
        courseId: course.id,
        sessionId: null,
        eventDate: course.starts_at.slice(0, 10),
        startsAt: course.starts_at,
        endsAt: course.ends_at,
      });
    }
  }

  const filteredEvents = eventInstances.filter((event) => {
    if (from && event.eventDate < from) return false;
    if (to && event.eventDate > to) return false;
    return true;
  });

  const workshopTicketsByBookingId = new Map(
    ticketRows.filter((ticket) => ticket.booking_id).map((ticket) => [ticket.booking_id as string, ticket])
  );
  const trialTicketsByReservationId = new Map(
    ticketRows
      .filter((ticket) => ticket.trial_reservation_id)
      .map((ticket) => [ticket.trial_reservation_id as string, ticket])
  );
  const subscriptionTicketsById = new Map(
    ticketRows
      .filter((ticket) => ticket.subscription_id)
      .map((ticket) => [ticket.subscription_id as string, ticket])
  );

  const attendanceByKey = new Map(
    attendanceRows.map((row) => [
      `${row.session_id ?? row.event_date ?? "na"}::${row.ticket_id}`,
      row,
    ])
  );

  const rows: AttendanceViewRow[] = [];

  for (const event of filteredEvents) {
    const course = courseById.get(event.courseId);
    if (!course) continue;
    const instructorName = course.instructor_name?.trim() || providerDisplayName;
    const room = course.location;
    const kindLabel = normalizeKind(course.kind);

    if (course.kind === "workshop") {
      for (const booking of workshopBookings.filter((row) => row.course_id === course.id)) {
        const ticket = workshopTicketsByBookingId.get(booking.id);
        if (!ticket) continue;
        const attendance = attendanceByKey.get(`${event.sessionId ?? event.eventDate}::${ticket.id}`) ?? null;
        rows.push({
          rowKey: `${event.sessionId ?? event.eventDate}::${ticket.id}`,
          date: formatDate(event.startsAt ?? event.eventDate),
          time: formatTime(event.startsAt),
          offerTitle: course.title ?? "Einmaliges Angebot",
          offerKind: kindLabel,
          participantName: formatName(
            booking.customer_first_name,
            booking.customer_last_name,
            ticket.customer_name || "Teilnehmer*in eines einmaligen Angebots"
          ),
          participantEmail: booking.customer_email ?? ticket.customer_email ?? null,
          instructorName,
          room: attendance?.room ?? room,
          methodLabel: mapMethodLabel(attendance?.method ?? null),
          checkedInAt: attendance?.checked_in_at ?? null,
          status: attendance ? "present" : "not_checked_in",
          sortDate: new Date(event.startsAt ?? event.eventDate).getTime(),
        });
      }
      continue;
    }

    const candidates: CandidateParticipant[] = [];

    for (const reservation of trialReservations.filter((row) => row.course_id === course.id)) {
      if (!sameDate(reservation.trial_starts_at, event.eventDate)) continue;
      const ticket = trialTicketsByReservationId.get(reservation.id);
      if (!ticket) continue;
      candidates.push({
        ticketId: ticket.id,
        participantName: formatName(reservation.first_name, reservation.last_name, ticket.customer_name || "Probeschüler*in"),
        participantEmail: reservation.email ?? ticket.customer_email ?? null,
        kind: "trial",
        eventDate: event.eventDate,
      });
    }

    for (const intent of registrationIntents.filter((row) => row.course_id === course.id && row.status === "checkout_completed")) {
      const ticket = intent.stripe_subscription_id
        ? subscriptionTicketsById.get(intent.stripe_subscription_id)
        : null;
      if (!ticket) continue;
      candidates.push({
        ticketId: ticket.id,
        participantName: formatName(intent.first_name, intent.last_name, ticket.customer_name || "Teilnehmer*in"),
        participantEmail: intent.email ?? ticket.customer_email ?? null,
        kind: "registered",
        eventDate: event.eventDate,
      });
    }

    for (const candidate of candidates) {
      const attendance = attendanceByKey.get(`${event.sessionId ?? event.eventDate}::${candidate.ticketId}`) ?? null;
      rows.push({
        rowKey: `${event.sessionId ?? event.eventDate}::${candidate.ticketId}`,
        date: formatDate(event.startsAt ?? event.eventDate),
        time: formatTime(event.startsAt),
        offerTitle: course.title ?? "Laufendes Angebot",
        offerKind: kindLabel,
        participantName: candidate.participantName,
        participantEmail: candidate.participantEmail,
        instructorName,
        room: attendance?.room ?? room,
        methodLabel: mapMethodLabel(attendance?.method ?? null),
        checkedInAt: attendance?.checked_in_at ?? null,
        status: attendance ? "present" : "not_checked_in",
        sortDate: new Date(event.startsAt ?? event.eventDate).getTime(),
      });
    }
  }

  const filteredRows = rows
    .filter((row) => {
      if (instructorFilter && !row.instructorName.toLowerCase().includes(instructorFilter)) return false;
      if (roomFilter && !String(row.room ?? "").toLowerCase().includes(roomFilter)) return false;
      if (
        participantFilter &&
        !`${row.participantName} ${row.participantEmail ?? ""}`.toLowerCase().includes(participantFilter)
      ) {
        return false;
      }
      if (methodFilter) {
        const methodValue =
          methodFilter === "teacher_scan"
            ? "Anbietende scannen"
            : methodFilter === "participant_scan"
              ? "Teilnehmer scannt"
              : methodFilter === "manual"
                ? "manuell"
                : "";
        if ((row.methodLabel ?? "") !== methodValue) return false;
      }
      if (statusFilter === "present" && row.status !== "present") return false;
      if (statusFilter === "not_checked_in" && row.status !== "not_checked_in") return false;
      return true;
    })
    .sort((left, right) => {
      const leftTs = left.checkedInAt ?? `${left.date} ${left.time}`;
      const rightTs = right.checkedInAt ?? `${right.date} ${right.time}`;
      return String(rightTs).localeCompare(String(leftTs));
    });

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <DashboardPageHeader
        title="Anwesenheit & Check-ins"
        description="Interne Übersicht über Anwesenheiten, Check-in-Methode und nicht erfasste Teilnahmen."
      />
      <DashboardFilterPanel>
        <div className="space-y-4">
          <StatusFilterChips
            ariaLabel="Anwesenheitsstatus"
            items={[
              {
                href: buildAttendanceFilterHref(sp, "all"),
                active: statusFilter === "all",
                label: "Alle",
                tone: "neutral",
              },
              {
                href: buildAttendanceFilterHref(sp, "not_checked_in"),
                active: statusFilter === "not_checked_in",
                label: "Offen",
                tone: "amber",
              },
              {
                href: buildAttendanceFilterHref(sp, "present"),
                active: statusFilter === "present",
                label: "Anwesend/Erfasst",
                tone: "emerald",
              },
            ]}
          />

          <form className="grid gap-4 md:grid-cols-4">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Von</span>
              <input type="date" name="from" defaultValue={from ?? ""} className="min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Bis</span>
              <input type="date" name="to" defaultValue={to ?? ""} className="min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Angebot</span>
              <select name="offer" defaultValue={offerFilter} className="min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3">
                <option value="">Alle Angebote</option>
                {(courses ?? []).map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title ?? "Angebot"}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Anbietende</span>
              <input
                type="text"
                name="instructor"
                defaultValue={getParam(sp, "instructor")}
                placeholder="Name filtern"
                className="min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Raum</span>
              <input
                type="text"
                name="room"
                defaultValue={getParam(sp, "room")}
                placeholder="Ort / Raum"
                className="min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Teilnehmer*in</span>
              <input
                type="text"
                name="participant"
                defaultValue={getParam(sp, "participant")}
                placeholder="Name oder E-Mail"
                className="min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Check-in-Methode</span>
              <select name="method" defaultValue={methodFilter} className="min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3">
                <option value="">Alle Methoden</option>
                <option value="teacher_scan">Anbietende scannen</option>
                <option value="participant_scan">Teilnehmer scannt</option>
                <option value="manual">manuell</option>
              </select>
            </label>
            <div className="flex items-end gap-3 md:col-span-4">
              <input type="hidden" name="status" value={statusFilter} />
              <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white">
                Filter anwenden
              </button>
              <Link href="/dashboard/attendance" className="inline-flex min-h-11 items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold">
                Zurücksetzen
              </Link>
            </div>
          </form>
        </div>
      </DashboardFilterPanel>

      <AttendanceTableClient rows={filteredRows} />
    </main>
  );
}




import Link from "next/link";
import QRCode from "react-qr-code";
import { redirect } from "next/navigation";
import { loadAttendanceMap } from "@/lib/attendance";
import { getSiteUrl } from "@/lib/site-url";
import { createSessionCheckInToken } from "@/lib/session-checkin-token";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ManualAttendanceClient, { type ManualAttendanceEntry } from "./ManualAttendanceClient";

type SearchParams = Record<string, string | string[] | undefined>;

type CourseRow = {
  id: string;
  title: string | null;
  kind: string | null;
  teacher_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  instructor_name: string | null;
  location: string | null;
};

type SessionRow = {
  id: string;
  course_id: string;
  starts_at: string | null;
  ends_at: string | null;
};

type TrialReservationRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
};

type TrialTicketRow = {
  id: string;
  trial_reservation_id: string | null;
  customer_name: string;
  customer_email: string;
  checked_in_at: string | null;
};

type RegistrationIntentRow = {
  id: string;
  trial_reservation_id: string;
  status: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  stripe_subscription_id: string | null;
  completed_at: string | null;
};

type SubscriptionTicketRow = {
  id: string;
  subscription_id: string | null;
  customer_name: string;
  customer_email: string;
  checked_in_at: string | null;
};

type WorkshopBookingRow = {
  id: string;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  created_at: string | null;
};

type WorkshopTicketRow = {
  id: string;
  booking_id: string | null;
  customer_name: string;
  customer_email: string;
  checked_in_at: string | null;
};

type EventOption = {
  key: string;
  sessionId: string | null;
  eventDate: string;
  label: string;
  sublabel: string | null;
};

function getParam(sp: SearchParams, key: string): string {
  const value = sp[key];
  return Array.isArray(value) ? String(value[0] ?? "").trim() : String(value ?? "").trim();
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDateTimeRange(start: string | null, end: string | null): string {
  if (!start) return "-";
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) return "-";

  const base = date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const startTime = date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (!end) return `${base} | ${startTime}`;

  const endDate = new Date(end);
  const endTime = Number.isNaN(endDate.getTime())
    ? "-"
    : endDate.toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
      });
  return `${base} | ${startTime}-${endTime}`;
}

function formatName(firstName: string | null, lastName: string | null, fallback: string): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || fallback;
}

function isManualEntry(entry: ManualAttendanceEntry | null): entry is ManualAttendanceEntry {
  return Boolean(entry);
}

function buildModeHref(basePath: string, eventOption: EventOption, mode: string): string {
  const params = new URLSearchParams();
  params.set("mode", mode);
  if (eventOption.sessionId) params.set("sessionId", eventOption.sessionId);
  params.set("eventDate", eventOption.eventDate);
  return `${basePath}?${params.toString()}`;
}

function matchesCourseTrialToEvent(reservation: TrialReservationRow, eventOption: EventOption): boolean {
  if (!reservation.trial_starts_at) return false;
  if (eventOption.sessionId) {
    return reservation.trial_starts_at.slice(0, 16) === eventOption.label.slice(0, 16) || reservation.trial_starts_at.slice(0, 10) === eventOption.eventDate;
  }
  return reservation.trial_starts_at.slice(0, 10) === eventOption.eventDate;
}

async function requireTeacher() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

export default async function DashboardCourseCheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const mode = getParam(sp, "mode") || "scan";
  const selectedSessionId = getParam(sp, "sessionId");
  const selectedEventDate = getParam(sp, "eventDate");
  const user = await requireTeacher();
  const admin = createSupabaseAdmin();

  const { data: course } = await admin
    .from("courses")
    .select("id,title,kind,teacher_id,starts_at,ends_at,instructor_name,location")
    .eq("id", id)
    .maybeSingle<CourseRow>();

  if (!course || course.teacher_id !== user.id) {
    redirect("/dashboard/courses");
  }

  const { data: sessions } = await admin
    .from("course_sessions")
    .select("id,course_id,starts_at,ends_at")
    .eq("course_id", id)
    .order("starts_at", { ascending: true })
    .returns<SessionRow[]>();

  const eventOptions: EventOption[] =
    (sessions ?? []).length > 0
      ? (sessions ?? []).map((session) => ({
          key: session.id,
          sessionId: session.id,
          eventDate: String(session.starts_at ?? "").slice(0, 10),
          label: String(session.starts_at ?? ""),
          sublabel: formatDateTimeRange(session.starts_at, session.ends_at),
        }))
      : [
          {
            key: `fallback-${id}`,
            sessionId: null,
            eventDate: String(course.starts_at ?? new Date().toISOString()).slice(0, 10),
            label: String(course.starts_at ?? ""),
            sublabel: formatDateTimeRange(course.starts_at, course.ends_at),
          },
        ];

  const selectedEvent =
    eventOptions.find(
      (option) =>
        (selectedSessionId && option.sessionId === selectedSessionId) ||
        (!selectedSessionId && selectedEventDate && option.eventDate === selectedEventDate)
    ) ?? eventOptions[0];

  const basePath = `/dashboard/courses/${course.id}/check-in`;
  const teacherScanHref = `/dashboard/check-in?courseId=${encodeURIComponent(course.id)}${
    selectedEvent.sessionId ? `&sessionId=${encodeURIComponent(selectedEvent.sessionId)}` : ""
  }&eventDate=${encodeURIComponent(selectedEvent.eventDate)}&returnTo=${encodeURIComponent(
    buildModeHref(basePath, selectedEvent, "scan")
  )}`;

  const qrExpiry = new Date();
  qrExpiry.setHours(qrExpiry.getHours() + 2);
  const qrToken = createSessionCheckInToken({
    courseId: course.id,
    sessionId: selectedEvent.sessionId,
    eventDate: selectedEvent.eventDate,
    expiresAt: qrExpiry,
  });
  const participantQrUrl = `${getSiteUrl()}/check-in/session/${qrToken}`;

  let manualEntries: ManualAttendanceEntry[] = [];

  if (mode === "manual") {
    if (course.kind === "workshop" || course.kind === "exclusive_offer") {
      const { data: bookings } = await admin
        .from("bookings")
        .select("id,customer_first_name,customer_last_name,customer_email,created_at")
        .eq("course_id", course.id)
        .eq("status", "paid")
        .returns<WorkshopBookingRow[]>();

      const bookingIds = (bookings ?? []).map((booking) => booking.id);
      const { data: tickets } =
        bookingIds.length > 0
          ? await admin
              .from("tickets")
              .select("id,booking_id,customer_name,customer_email,checked_in_at")
              .in("booking_id", bookingIds)
              .returns<WorkshopTicketRow[]>()
          : { data: [] as WorkshopTicketRow[] };

      const ticketByBookingId = new Map(
        (tickets ?? []).filter((ticket) => ticket.booking_id).map((ticket) => [ticket.booking_id as string, ticket])
      );
      const attendanceMap = await loadAttendanceMap({
        courseId: course.id,
        sessionId: selectedEvent.sessionId,
        eventDate: selectedEvent.eventDate,
        ticketIds: (tickets ?? []).map((ticket) => ticket.id),
      });

      manualEntries = (bookings ?? [])
        .map<ManualAttendanceEntry | null>((booking) => {
          const ticket = ticketByBookingId.get(booking.id);
          if (!ticket) return null;
          return {
            id: booking.id,
            ticketId: ticket.id,
            name: formatName(
              booking.customer_first_name,
              booking.customer_last_name,
              ticket.customer_name || "Teilnehmer*in"
            ),
            email: booking.customer_email ?? ticket.customer_email ?? null,
            typeLabel: "Einmalangebot-Buchung",
            meta: booking.created_at ? `Gebucht am ${formatDateTime(booking.created_at)}` : null,
            legacyCheckedInAt: ticket.checked_in_at,
            attendanceCheckedInAt: attendanceMap.get(ticket.id)?.checked_in_at ?? null,
          };
        })
        .filter(isManualEntry);
    } else {
      const [{ data: reservations }, { data: intents }] = await Promise.all([
        admin
          .from("trial_reservations")
          .select("id,first_name,last_name,email,trial_starts_at,trial_ends_at")
          .eq("course_id", course.id)
          .returns<TrialReservationRow[]>(),
        admin
          .from("course_registration_intents")
          .select("id,trial_reservation_id,status,first_name,last_name,email,stripe_subscription_id,completed_at")
          .eq("course_id", course.id)
          .returns<RegistrationIntentRow[]>(),
      ]);

      const relevantTrials = (reservations ?? []).filter((reservation) =>
        matchesCourseTrialToEvent(reservation, selectedEvent)
      );
      const trialReservationIds = relevantTrials.map((reservation) => reservation.id);
      const subscriptionIds = (intents ?? [])
        .filter((intent) => intent.status === "checkout_completed" && intent.stripe_subscription_id)
        .map((intent) => intent.stripe_subscription_id as string);

      const [{ data: trialTickets }, { data: subscriptionTickets }] = await Promise.all([
        trialReservationIds.length > 0
          ? admin
              .from("tickets")
              .select("id,trial_reservation_id,customer_name,customer_email,checked_in_at")
              .in("trial_reservation_id", trialReservationIds)
              .returns<TrialTicketRow[]>()
          : Promise.resolve({ data: [] as TrialTicketRow[] }),
        subscriptionIds.length > 0
          ? admin
              .from("tickets")
              .select("id,subscription_id,customer_name,customer_email,checked_in_at")
              .in("subscription_id", subscriptionIds)
              .returns<SubscriptionTicketRow[]>()
          : Promise.resolve({ data: [] as SubscriptionTicketRow[] }),
      ]);

      const trialTicketByReservationId = new Map(
        (trialTickets ?? [])
          .filter((ticket) => ticket.trial_reservation_id)
          .map((ticket) => [ticket.trial_reservation_id as string, ticket])
      );
      const subscriptionTicketById = new Map(
        (subscriptionTickets ?? [])
          .filter((ticket) => ticket.subscription_id)
          .map((ticket) => [ticket.subscription_id as string, ticket])
      );
      const attendanceMap = await loadAttendanceMap({
        courseId: course.id,
        sessionId: selectedEvent.sessionId,
        eventDate: selectedEvent.eventDate,
        ticketIds: [...(trialTickets ?? []).map((ticket) => ticket.id), ...(subscriptionTickets ?? []).map((ticket) => ticket.id)],
      });

      const trialEntries = relevantTrials
        .map<ManualAttendanceEntry | null>((reservation) => {
          const ticket = trialTicketByReservationId.get(reservation.id);
          if (!ticket) return null;
          return {
            id: reservation.id,
            ticketId: ticket.id,
            name: formatName(reservation.first_name, reservation.last_name, ticket.customer_name || "Probeschueler*in"),
            email: reservation.email ?? ticket.customer_email ?? null,
            typeLabel: "Probestunde",
            meta: formatDateTimeRange(reservation.trial_starts_at, reservation.trial_ends_at),
            legacyCheckedInAt: ticket.checked_in_at,
            attendanceCheckedInAt: attendanceMap.get(ticket.id)?.checked_in_at ?? null,
          };
        })
        .filter(isManualEntry);

      const registeredEntries = (intents ?? [])
        .filter((intent) => intent.status === "checkout_completed" && intent.stripe_subscription_id)
        .map<ManualAttendanceEntry | null>((intent) => {
          const ticket = subscriptionTicketById.get(intent.stripe_subscription_id as string);
          if (!ticket) return null;
          return {
            id: intent.id,
            ticketId: ticket.id,
            name: formatName(intent.first_name, intent.last_name, ticket.customer_name || "Teilnehmer*in"),
            email: intent.email ?? ticket.customer_email ?? null,
            typeLabel: "Verbindliche Anmeldung",
            meta: intent.completed_at ? `Angemeldet am ${formatDateTime(intent.completed_at)}` : null,
            legacyCheckedInAt: ticket.checked_in_at,
            attendanceCheckedInAt: attendanceMap.get(ticket.id)?.checked_in_at ?? null,
          };
        })
        .filter(isManualEntry);

      manualEntries = [...registeredEntries, ...trialEntries];
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <Link href={`/dashboard/courses/${course.id}`} className="inline-flex text-sm font-semibold">
        Zurueck zum Angebot
      </Link>

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Check-in starten</h1>
        <p className="text-sm text-muted-foreground">
          {course.title ?? "Angebot"}: Waehle zuerst den Termin und danach den passenden Check-in-Modus.
        </p>
      </header>

      <section className="rounded-2xl border p-5">
        <h2 className="text-lg font-semibold">Termin waehlen</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {eventOptions.map((option) => {
            const isSelected = option.key === selectedEvent.key;
            return (
              <Link
                key={option.key}
                href={buildModeHref(basePath, option, mode)}
                className={`rounded-2xl border p-4 text-sm transition ${
                  isSelected ? "border-foreground bg-foreground text-background" : "hover:border-foreground/30"
                }`}
              >
                <p className="font-semibold">{option.sublabel ?? formatDateTimeRange(option.label, null)}</p>
                <p className={isSelected ? "text-background/80" : "text-muted-foreground"}>
                  {course.location ?? "Ort folgt"}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border p-5">
        <h2 className="text-lg font-semibold">Modus waehlen</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link
            href={buildModeHref(basePath, selectedEvent, "scan")}
            className={`rounded-2xl border p-4 text-sm ${mode === "scan" ? "border-foreground bg-muted" : ""}`}
          >
            <p className="font-semibold">Teilnehmer-QR scannen</p>
            <p className="mt-2 text-muted-foreground">Anbietende scannen das persönliche Ticket vor Ort.</p>
          </Link>
          <Link
            href={buildModeHref(basePath, selectedEvent, "show")}
            className={`rounded-2xl border p-4 text-sm ${mode === "show" ? "border-foreground bg-muted" : ""}`}
          >
            <p className="font-semibold">Termin-QR anzeigen</p>
            <p className="mt-2 text-muted-foreground">Teilnehmer*innen scannen den kurzfristigen Termin-Code selbst.</p>
          </Link>
          <Link
            href={buildModeHref(basePath, selectedEvent, "manual")}
            className={`rounded-2xl border p-4 text-sm ${mode === "manual" ? "border-foreground bg-muted" : ""}`}
          >
            <p className="font-semibold">Manuell einchecken</p>
            <p className="mt-2 text-muted-foreground">Ideal fuer groessere Gruppen mit schneller Tap-Liste.</p>
          </Link>
        </div>
      </section>

      {mode === "scan" ? (
        <section className="rounded-2xl border p-5">
          <h2 className="text-xl font-semibold">Teilnehmer-QR scannen</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Der bestehende Scanner bleibt aktiv. Fuer diesen Termin wird zusaetzlich eine Anwesenheit pro Session gespeichert.
          </p>
          <div className="mt-4">
            <Link href={teacherScanHref} className="inline-flex rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">
              Scanner fuer diesen Termin oeffnen
            </Link>
          </div>
        </section>
      ) : null}

      {mode === "show" ? (
        <section className="rounded-2xl border p-5">
          <h2 className="text-xl font-semibold">Termin-QR anzeigen</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Dieser QR-Code ist nur fuer den ausgewaehlten Termin gueltig und laeuft nach zwei Stunden automatisch ab.
          </p>
          <div className="mt-4 inline-block rounded-2xl border bg-white p-4">
            <QRCode value={participantQrUrl} size={220} />
          </div>
          <p className="mt-4 break-all text-xs text-muted-foreground">{participantQrUrl}</p>
          <p className="mt-3 text-sm text-amber-700">
            Teilnehmer*innen benoetigen zusaetzlich ihr eigenes Ticket auf demselben Geraet oder den Ticket-Token als Fallback.
          </p>
        </section>
      ) : null}

      {mode === "manual" ? (
        <section className="rounded-2xl border p-5">
          <h2 className="text-xl font-semibold">Manuelle Anwesenheit</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Bereits erfasste Personen sind sofort sichtbar. Du kannst sie fuer genau diesen Termin an- oder abwaehlen.
          </p>
          <div className="mt-4">
            <ManualAttendanceClient
              courseId={course.id}
              sessionId={selectedEvent.sessionId}
              eventDate={selectedEvent.eventDate}
              room={course.location}
              instructorName={course.instructor_name}
              entries={manualEntries}
            />
          </div>
        </section>
      ) : null}
    </main>
  );
}

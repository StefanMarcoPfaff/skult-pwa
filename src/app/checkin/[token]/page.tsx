import { notFound } from "next/navigation";
import { deriveAttendanceDisplayStatus, recordAttendanceForTicketToken, loadAttendanceMap } from "@/lib/attendance";
import { loadValidCheckInAccessLink } from "@/lib/checkin-access-links";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import CheckInScannerClient from "@/app/dashboard/check-in/CheckInScannerClient";
import { TeacherMagicCheckInClient, type TeacherMagicEntry } from "./TeacherMagicCheckInClient";

type SearchParams = Record<string, string | string[] | undefined>;

type CourseRow = {
  id: string;
  title: string | null;
  kind: string | null;
  starts_at: string | null;
  ends_at: string | null;
  weekday: number | null;
  start_time: string | null;
  duration_minutes: number | null;
  recurrence_type: string | null;
  location: string | null;
  instructor_name: string | null;
};

type SessionRow = {
  id: string;
  starts_at: string | null;
  ends_at: string | null;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

type TicketRow = {
  id: string;
  customer_name: string;
  checked_in_at: string | null;
  status: string | null;
};

type EventOption = {
  key: string;
  sessionId: string | null;
  eventDate: string;
  label: string;
  isToday: boolean;
};

function getParam(sp: SearchParams, key: string): string {
  const value = sp[key];
  return Array.isArray(value) ? String(value[0] ?? "").trim() : String(value ?? "").trim();
}

function formatDateTimeRange(start: string | null, end: string | null): string {
  if (!start) return "-";
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) return "-";
  const day = date.toLocaleDateString("de-DE", { dateStyle: "medium" });
  const startTime = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (!end) return `${day} | ${startTime}`;
  const endDate = new Date(end);
  const endTime = Number.isNaN(endDate.getTime())
    ? "-"
    : endDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${day} | ${startTime}-${endTime}`;
}

function getDateKey(value: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function getWeekdayInBerlin(value: Date = new Date()): number {
  const shortDay = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", weekday: "short" }).format(value);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(shortDay);
}

function formatEventDate(start: string | null): string {
  if (!start) return getDateKey();
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) return String(start).slice(0, 10);
  return getDateKey(date);
}

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Teilnehmer*in", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

function isMissingTableOrColumnError(error: unknown): boolean {
  const maybeError = error as SupabaseErrorLike;
  return (
    maybeError?.code === "42P01" ||
    maybeError?.code === "42703" ||
    maybeError?.code === "PGRST204" ||
    maybeError?.code === "PGRST205" ||
    /schema cache|does not exist|Could not find/i.test(String(maybeError?.message ?? ""))
  );
}

export default async function TeacherMagicCheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const verified = await loadValidCheckInAccessLink(token);

  if (!verified) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
          Dieser Check-in-Link ist abgelaufen oder ungültig.
        </section>
      </main>
    );
  }

  const admin = createSupabaseAdmin();
  let courseResult = await admin
    .from("courses")
    .select("id,title,kind,starts_at,ends_at,weekday,start_time,duration_minutes,recurrence_type,location,instructor_name")
    .eq("id", verified.link.course_id)
    .maybeSingle<CourseRow>();
  if (courseResult.error && isMissingTableOrColumnError(courseResult.error)) {
    courseResult = await admin
      .from("courses")
      .select("id,title,kind,starts_at,ends_at,weekday,start_time,duration_minutes,recurrence_type")
      .eq("id", verified.link.course_id)
      .maybeSingle<CourseRow>();
  }

  const course = courseResult.data ?? null;

  if (!course) notFound();

  const { data: sessions, error: sessionsError } = await admin
    .from("course_sessions")
    .select("id,starts_at,ends_at")
    .eq("course_id", course.id)
    .order("starts_at", { ascending: true })
    .returns<SessionRow[]>();
  if (sessionsError && !isMissingTableOrColumnError(sessionsError)) {
    throw sessionsError;
  }

  const today = getDateKey();
  const eventOptions: EventOption[] =
    (sessions ?? []).length > 0
      ? (sessions ?? []).map((session) => ({
          key: session.id,
          sessionId: session.id,
          eventDate: formatEventDate(session.starts_at),
          label: formatDateTimeRange(session.starts_at, session.ends_at),
          isToday: formatEventDate(session.starts_at) === today,
        }))
      : course.kind === "course" && course.weekday === getWeekdayInBerlin() && course.start_time
        ? [
            {
              key: `recurring-${course.id}-${today}`,
              sessionId: null,
              eventDate: today,
              label: `${new Date().toLocaleDateString("de-DE", { dateStyle: "medium" })} | ${course.start_time.slice(0, 5)}`,
              isToday: true,
            },
          ]
        : [
          {
            key: `course-${course.id}`,
            sessionId: null,
            eventDate: formatEventDate(course.starts_at),
            label: formatDateTimeRange(course.starts_at, course.ends_at),
            isToday: formatEventDate(course.starts_at) === today,
          },
        ];

  const selectedSessionId = getParam(sp, "sessionId");
  const selectedEventDate = getParam(sp, "eventDate");
  const selectedEventFromParams =
    eventOptions.find(
      (option) =>
        (selectedSessionId && option.sessionId === selectedSessionId) ||
        (!selectedSessionId && selectedEventDate && option.eventDate === selectedEventDate)
    ) ?? null;
  const todayEvent = eventOptions.find((option) => option.isToday) ?? null;
  const selectedEvent = selectedEventFromParams ?? todayEvent ?? eventOptions[0];
  const checkInEnabled = Boolean(selectedEvent?.isToday);

  const scannedTicketToken = getParam(sp, "token");
  let scanMessage: { ok: boolean; text: string } | null = null;
  if (scannedTicketToken) {
    if (!checkInEnabled) {
      scanMessage = { ok: false, text: "Heute ist kein Check-in für dieses Angebot möglich." };
    } else {
      try {
      const result = await recordAttendanceForTicketToken({
        qrToken: scannedTicketToken,
        courseId: course.id,
        sessionId: selectedEvent.sessionId,
        eventDate: selectedEvent.eventDate,
        checkedInBy: null,
        method: "qr_scan",
        attendanceStatus: "present",
        room: course.location,
        instructorName: course.instructor_name,
        source: "qr_scan",
        checkInAccessLinkId: verified.link.id,
        checkedInByLabel: "Check-in-Link",
        overwriteExisting: true,
        updateLegacyTicket: false,
        allowLegacyFallback: false,
      });
      scanMessage = {
        ok: true,
        text: result.alreadyRecorded ? "Ticket war bereits eingecheckt." : "Ticket wurde eingecheckt.",
      };
      } catch {
      scanMessage = { ok: false, text: "Dieses Ticket gehört nicht zu diesem Angebot oder ist ungültig." };
      }
    }
  }

  let ticketsResult = await admin
    .from("tickets")
    .select("id,customer_name,checked_in_at,status")
    .eq("course_id", course.id)
    .not("status", "in", '("cancelled","expired")')
    .order("customer_name", { ascending: true })
    .returns<TicketRow[]>();
  if (ticketsResult.error && isMissingTableOrColumnError(ticketsResult.error)) {
    ticketsResult = await admin
      .from("tickets")
      .select("id,customer_name,checked_in_at")
      .eq("course_id", course.id)
      .order("customer_name", { ascending: true })
      .returns<TicketRow[]>();
  }
  if (ticketsResult.error) {
    throw ticketsResult.error;
  }
  const tickets = ticketsResult.data ?? [];

  const ticketIds = tickets.map((ticket) => ticket.id);
  const attendanceMap = await loadAttendanceMap({
    courseId: course.id,
    sessionId: selectedEvent.sessionId,
    eventDate: selectedEvent.eventDate,
    ticketIds,
  });

  const entries: TeacherMagicEntry[] = tickets
    .filter((ticket) => ticket.status !== "cancelled" && ticket.status !== "expired")
    .map((ticket) => {
      const name = splitName(ticket.customer_name);
      const attendance = attendanceMap.get(ticket.id) ?? null;
      const allowLegacyStatus = eventOptions.length === 1 && course.kind !== "course";
      const attendanceStatus = attendance
        ? deriveAttendanceDisplayStatus(attendance, selectedEvent.eventDate)
        : allowLegacyStatus && ticket.checked_in_at
          ? "present"
          : deriveAttendanceDisplayStatus(null, selectedEvent.eventDate);
      return {
        id: ticket.id,
        ticketId: ticket.id,
        firstName: name.firstName,
        lastName: name.lastName,
        attendanceStatus,
        markedAt: attendance?.marked_at ?? attendance?.checked_in_at ?? (allowLegacyStatus ? ticket.checked_in_at : null),
      };
    });

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">{course.title ?? "Check-in"}</h1>
        <p className="text-sm text-muted-foreground">
          Wähle den Termin aus und checke Teilnehmende per Ticket-Scan oder manuell ein.
        </p>
      </header>

      <section className="rounded-2xl border p-5">
          <h2 className="text-lg font-semibold">Termin wählen</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {eventOptions.map((option) => {
              const params = new URLSearchParams();
              if (option.sessionId) params.set("sessionId", option.sessionId);
              params.set("eventDate", option.eventDate);
              const isSelected = option.key === selectedEvent.key;
              return (
                <a
                  key={option.key}
                  href={`/checkin/${encodeURIComponent(token)}?${params.toString()}`}
                  className={`rounded-2xl border p-4 text-sm ${
                    option.isToday ? "border-green-600 bg-green-50 text-green-900" : isSelected ? "border-foreground bg-muted" : ""
                  }`}
                >
                  {option.label}
                  {option.isToday ? <span className="mt-1 block text-xs font-semibold">Heute - Check-in möglich</span> : null}
                </a>
              );
            })}
          </div>
          {!todayEvent ? (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Check-in ist nur am jeweiligen Angebotstag möglich.
            </p>
          ) : null}
        </section>

      {scanMessage ? (
        <section className={`rounded-2xl border p-4 text-sm ${scanMessage.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {scanMessage.text}
        </section>
      ) : null}

      {checkInEnabled ? (
        <CheckInScannerClient
          redirectPath={`/checkin/${token}`}
          redirectParams={{
            sessionId: selectedEvent.sessionId ?? undefined,
            eventDate: selectedEvent.eventDate,
          }}
        />
      ) : null}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Manuell einchecken</h2>
        <TeacherMagicCheckInClient
          accessToken={token}
          sessionId={selectedEvent.sessionId}
          eventDate={selectedEvent.eventDate}
          room={course.location}
          instructorName={course.instructor_name}
          checkInEnabled={checkInEnabled}
          entries={entries}
        />
      </section>
    </main>
  );
}

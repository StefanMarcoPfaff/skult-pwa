import { notFound } from "next/navigation";
import { recordAttendanceForTicketToken, loadAttendanceMap } from "@/lib/attendance";
import { loadValidCheckInAccessLink } from "@/lib/checkin-access-links";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import CheckInScannerClient from "@/app/dashboard/check-in/CheckInScannerClient";
import { TeacherMagicCheckInClient, type TeacherMagicEntry } from "./TeacherMagicCheckInClient";

type SearchParams = Record<string, string | string[] | undefined>;

type CourseRow = {
  id: string;
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  instructor_name: string | null;
};

type SessionRow = {
  id: string;
  starts_at: string | null;
  ends_at: string | null;
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

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Teilnehmer*in", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
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
  const { data: course } = await admin
    .from("courses")
    .select("id,title,starts_at,ends_at,location,instructor_name")
    .eq("id", verified.link.course_id)
    .maybeSingle<CourseRow>();

  if (!course) notFound();

  const { data: sessions } = await admin
    .from("course_sessions")
    .select("id,starts_at,ends_at")
    .eq("course_id", course.id)
    .order("starts_at", { ascending: true })
    .returns<SessionRow[]>();

  const eventOptions: EventOption[] =
    (sessions ?? []).length > 0
      ? (sessions ?? []).map((session) => ({
          key: session.id,
          sessionId: session.id,
          eventDate: String(session.starts_at ?? "").slice(0, 10),
          label: formatDateTimeRange(session.starts_at, session.ends_at),
        }))
      : [
          {
            key: `course-${course.id}`,
            sessionId: null,
            eventDate: String(course.starts_at ?? new Date().toISOString()).slice(0, 10),
            label: formatDateTimeRange(course.starts_at, course.ends_at),
          },
        ];

  const selectedSessionId = getParam(sp, "sessionId");
  const selectedEventDate = getParam(sp, "eventDate");
  const selectedEvent =
    eventOptions.find(
      (option) =>
        (selectedSessionId && option.sessionId === selectedSessionId) ||
        (!selectedSessionId && selectedEventDate && option.eventDate === selectedEventDate)
    ) ?? eventOptions[0];

  const scannedTicketToken = getParam(sp, "token");
  let scanMessage: { ok: boolean; text: string } | null = null;
  if (scannedTicketToken) {
    try {
      const result = await recordAttendanceForTicketToken({
        qrToken: scannedTicketToken,
        courseId: course.id,
        sessionId: selectedEvent.sessionId,
        eventDate: selectedEvent.eventDate,
        checkedInBy: null,
        method: "teacher_scan",
        room: course.location,
        instructorName: course.instructor_name,
        source: "teacher_magic_link",
        checkInAccessLinkId: verified.link.id,
        checkedInByLabel: "Dozent*innen-Link",
      });
      scanMessage = {
        ok: true,
        text: result.alreadyRecorded ? "Ticket war bereits eingecheckt." : "Ticket wurde eingecheckt.",
      };
    } catch {
      scanMessage = { ok: false, text: "Dieses Ticket gehört nicht zu diesem Angebot oder ist ungültig." };
    }
  }

  const { data: tickets } = await admin
    .from("tickets")
    .select("id,customer_name,checked_in_at,status")
    .eq("course_id", course.id)
    .not("status", "in", '("cancelled","expired")')
    .order("customer_name", { ascending: true })
    .returns<TicketRow[]>();

  const ticketIds = (tickets ?? []).map((ticket) => ticket.id);
  const attendanceMap = await loadAttendanceMap({
    courseId: course.id,
    sessionId: selectedEvent.sessionId,
    eventDate: selectedEvent.eventDate,
    ticketIds,
  });

  const entries: TeacherMagicEntry[] = (tickets ?? []).map((ticket) => {
    const name = splitName(ticket.customer_name);
    return {
      id: ticket.id,
      ticketId: ticket.id,
      firstName: name.firstName,
      lastName: name.lastName,
      attendanceCheckedInAt: attendanceMap.get(ticket.id)?.checked_in_at ?? ticket.checked_in_at ?? null,
    };
  });

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">{course.title ?? "Check-in"}</h1>
        <p className="text-sm text-muted-foreground">{selectedEvent.label}</p>
      </header>

      {eventOptions.length > 1 ? (
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
                  className={`rounded-2xl border p-4 text-sm ${isSelected ? "border-foreground bg-muted" : ""}`}
                >
                  {option.label}
                </a>
              );
            })}
          </div>
        </section>
      ) : null}

      {scanMessage ? (
        <section className={`rounded-2xl border p-4 text-sm ${scanMessage.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {scanMessage.text}
        </section>
      ) : null}

      <CheckInScannerClient
        redirectPath={`/checkin/${token}`}
        redirectParams={{
          sessionId: selectedEvent.sessionId ?? undefined,
          eventDate: selectedEvent.eventDate,
        }}
      />

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Teilnehmende</h2>
        <TeacherMagicCheckInClient
          accessToken={token}
          sessionId={selectedEvent.sessionId}
          eventDate={selectedEvent.eventDate}
          room={course.location}
          instructorName={course.instructor_name}
          entries={entries}
        />
      </section>
    </main>
  );
}

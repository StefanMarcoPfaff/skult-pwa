import Link from "next/link";
import { redirect } from "next/navigation";
import { recordAttendanceForTicketToken } from "@/lib/attendance";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadTicketByQrToken } from "@/lib/tickets";
import CheckInScannerClient from "./CheckInScannerClient";

type SearchParams = Record<string, string | string[] | undefined>;

type CheckInState =
  | "attendance_checked_in"
  | "workshop_checked_in"
  | "trial_checked_in"
  | "already_used"
  | "cancelled"
  | "expired"
  | "invalid";

type CheckInResult = {
  state: CheckInState;
  message: string;
  tone: "neutral" | "success" | "warning" | "danger";
  ticketType: string | null;
  customerName: string | null;
  courseTitle: string | null;
  checkedInAt: string | null;
};

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

function logCheckInEvent(message: string, payload: Record<string, unknown>) {
  if (!isDev()) return;
  console.log("[ticket-check-in]", message, payload);
}

function getParam(sp: SearchParams, key: string): string {
  const value = sp[key];
  return Array.isArray(value) ? String(value[0] ?? "").trim() : String(value ?? "").trim();
}

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function requireTeacher() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

async function processLegacyTicketCheckIn(token: string, teacherId: string): Promise<CheckInResult> {
  const lookup = await loadTicketByQrToken(token);
  if (!lookup) {
    logCheckInEvent("invalid", { token });
    return {
      state: "invalid",
      message: "invalid token",
      tone: "danger",
      ticketType: null,
      customerName: null,
      courseTitle: null,
      checkedInAt: null,
    };
  }

  if (lookup.teacherId && lookup.teacherId !== teacherId) {
    return {
      state: "invalid",
      message: "invalid token",
      tone: "danger",
      ticketType: lookup.ticket.type,
      customerName: lookup.ticket.customer_name,
      courseTitle: lookup.courseTitle,
      checkedInAt: lookup.ticket.checked_in_at,
    };
  }

  if (lookup.ticket.status === "checked_in") {
    return {
      state: "already_used",
      message: "already used",
      tone: "warning",
      ticketType: lookup.ticket.type,
      customerName: lookup.ticket.customer_name,
      courseTitle: lookup.courseTitle,
      checkedInAt: lookup.ticket.checked_in_at,
    };
  }

  if (lookup.ticket.status === "cancelled") {
    return {
      state: "cancelled",
      message: "cancelled",
      tone: "warning",
      ticketType: lookup.ticket.type,
      customerName: lookup.ticket.customer_name,
      courseTitle: lookup.courseTitle,
      checkedInAt: lookup.ticket.checked_in_at,
    };
  }

  if (lookup.ticket.status === "expired") {
    return {
      state: "expired",
      message: "expired",
      tone: "warning",
      ticketType: lookup.ticket.type,
      customerName: lookup.ticket.customer_name,
      courseTitle: lookup.courseTitle,
      checkedInAt: lookup.ticket.checked_in_at,
    };
  }

  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();
  const { data: updated, error } = await admin
    .from("tickets")
    .update({
      status: "checked_in",
      checked_in_at: now,
      checked_in_by: teacherId,
    })
    .eq("id", lookup.ticket.id)
    .eq("status", "issued")
    .select("checked_in_at")
    .maybeSingle<{ checked_in_at: string | null }>();

  if (error || !updated) {
    return {
      state: "invalid",
      message: "invalid token",
      tone: "danger",
      ticketType: lookup.ticket.type,
      customerName: lookup.ticket.customer_name,
      courseTitle: lookup.courseTitle,
      checkedInAt: lookup.ticket.checked_in_at,
    };
  }

  const state = lookup.ticket.type === "trial" ? "trial_checked_in" : "workshop_checked_in";
  return {
    state,
    message: state === "trial_checked_in" ? "trial lesson attendance confirmed" : "workshop ticket checked in",
    tone: "success",
    ticketType: lookup.ticket.type,
    customerName: lookup.ticket.customer_name,
    courseTitle: lookup.courseTitle,
    checkedInAt: updated.checked_in_at,
  };
}

async function processTicketCheckIn(
  token: string,
  teacherId: string,
  context: {
    courseId?: string;
    sessionId?: string;
    eventDate?: string;
  }
): Promise<CheckInResult> {
  if (context.courseId && (context.sessionId || context.eventDate)) {
    try {
      const result = await recordAttendanceForTicketToken({
        qrToken: token,
        courseId: context.courseId,
        sessionId: context.sessionId ?? null,
        eventDate: context.eventDate ?? null,
        checkedInBy: teacherId,
        method: "teacher_scan",
      });

      return {
        state: "attendance_checked_in",
        message: result.alreadyRecorded ? "attendance already recorded" : "attendance checked in",
        tone: result.alreadyRecorded ? "warning" : "success",
        ticketType: "attendance",
        customerName: result.ticket.customer_name,
        courseTitle: null,
        checkedInAt: result.attendance.checked_in_at,
      };
    } catch (error) {
      logCheckInEvent("attendance_invalid", {
        token,
        courseId: context.courseId,
        sessionId: context.sessionId ?? null,
        eventDate: context.eventDate ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        state: "invalid",
        message: "invalid token",
        tone: "danger",
        ticketType: null,
        customerName: null,
        courseTitle: null,
        checkedInAt: null,
      };
    }
  }

  return processLegacyTicketCheckIn(token, teacherId);
}

function resultClasses(tone: CheckInResult["tone"]): string {
  if (tone === "success") return "border-green-200 bg-green-50 text-green-800";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (tone === "danger") return "border-red-200 bg-red-50 text-red-800";
  return "border-border bg-background text-foreground";
}

function getResultHint(result: CheckInResult): string | null {
  if (result.state === "already_used") {
    return result.checkedInAt
      ? `Dieses Ticket wurde bereits am ${formatDateTime(result.checkedInAt)} eingecheckt.`
      : "Dieses Ticket wurde bereits eingecheckt.";
  }

  if (result.state === "cancelled") return "Dieses Ticket wurde storniert und kann nicht mehr verwendet werden.";
  if (result.state === "expired") return "Dieses Ticket ist abgelaufen und kann nicht mehr verwendet werden.";
  if (result.state === "invalid") return "Kein gültiges Ticket für diesen Token gefunden.";
  if (result.state === "attendance_checked_in") {
    return result.checkedInAt
      ? `Anwesenheit für diesen Termin gespeichert am ${formatDateTime(result.checkedInAt)}.`
      : "Anwesenheit für diesen Termin gespeichert.";
  }
  if (result.checkedInAt) return `Check-in gespeichert am ${formatDateTime(result.checkedInAt)}.`;
  return null;
}

export default async function DashboardCheckInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireTeacher();
  const sp = await searchParams;
  const token = getParam(sp, "token");
  const courseId = getParam(sp, "courseId");
  const sessionId = getParam(sp, "sessionId");
  const eventDate = getParam(sp, "eventDate");
  const returnTo = getParam(sp, "returnTo");
  const result = token
    ? await processTicketCheckIn(token, user.id, {
        courseId: courseId || undefined,
        sessionId: sessionId || undefined,
        eventDate: eventDate || undefined,
      })
    : null;
  const resultHint = result ? getResultHint(result) : null;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      {returnTo ? (
        <Link href={returnTo} className="inline-flex text-sm font-semibold">
          Zurück zum Termin-Check-in
        </Link>
      ) : null}

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Ticket-Check-in</h1>
        <p className="text-sm text-muted-foreground">
          Scanne hier den QR-Code per Kamera oder prüfe den Token manuell als Fallback.
        </p>
      </header>

      <CheckInScannerClient
        redirectParams={{
          courseId: courseId || undefined,
          sessionId: sessionId || undefined,
          eventDate: eventDate || undefined,
          returnTo: returnTo || undefined,
        }}
      />

      <section className="rounded-2xl border p-4">
        <h2 className="text-base font-semibold">Manueller Fallback</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Wenn die Kamera auf diesem Gerät nicht verfügbar ist, kannst du den Token hier manuell
          eingeben.
        </p>
        <form action="/dashboard/check-in" method="get" className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            name="token"
            defaultValue={token}
            placeholder="QR-Token eingeben"
            className="min-w-0 flex-1 rounded-xl border px-4 py-3 text-sm"
          />
          {courseId ? <input type="hidden" name="courseId" value={courseId} /> : null}
          {sessionId ? <input type="hidden" name="sessionId" value={sessionId} /> : null}
          {eventDate ? <input type="hidden" name="eventDate" value={eventDate} /> : null}
          {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
          <button type="submit" className="rounded-xl border px-4 py-3 text-sm font-semibold">
            Ticket prüfen
          </button>
        </form>
      </section>

      {result ? (
        <section className={`rounded-2xl border p-5 ${resultClasses(result.tone)}`}>
          <p className="text-lg font-semibold">{result.message}</p>
          {resultHint ? <p className="mt-2 text-sm">{resultHint}</p> : null}
          {result.courseTitle ? (
            <p className="mt-2 text-sm">
              Angebot: <span className="font-medium">{result.courseTitle}</span>
            </p>
          ) : null}
          {result.customerName ? (
            <p className="mt-1 text-sm">
              Teilnehmer*in: <span className="font-medium">{result.customerName}</span>
            </p>
          ) : null}
          {result.ticketType ? (
            <p className="mt-1 text-sm">
              Tickettyp: <span className="font-medium">{result.ticketType}</span>
            </p>
          ) : null}
        </section>
      ) : (
        <section className="rounded-2xl border p-5 text-sm text-muted-foreground">
          Noch kein Ticket geladen.
        </section>
      )}
    </main>
  );
}

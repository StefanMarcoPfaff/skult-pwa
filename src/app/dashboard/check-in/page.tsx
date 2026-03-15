import { redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadTicketByQrToken } from "@/lib/tickets";

type SearchParams = Record<string, string | string[] | undefined>;

type CheckInState =
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

/*
 * MVP verification checklist:
 * 1. Open /dashboard/check-in?token=<qr_token> from a trial or workshop email.
 * 2. Confirm the first load checks the ticket in successfully.
 * 3. Refresh the page and confirm the result is clearly "already used".
 * 4. Confirm invalid, cancelled, and expired tokens return distinct states.
 */

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

async function processTicketCheckIn(token: string, teacherId: string): Promise<CheckInResult> {
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
    logCheckInEvent("invalid", { ticketId: lookup.ticket.id, teacherId });
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
    logCheckInEvent("already used", { ticketId: lookup.ticket.id });
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
    logCheckInEvent("cancelled", { ticketId: lookup.ticket.id });
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
    logCheckInEvent("expired", { ticketId: lookup.ticket.id });
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
    logCheckInEvent("invalid", { ticketId: lookup.ticket.id, reason: "update_failed" });
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
  const message = state === "trial_checked_in" ? "trial lesson attendance confirmed" : "workshop ticket checked in";
  logCheckInEvent("success", { ticketId: lookup.ticket.id, state });

  return {
    state,
    message,
    tone: "success",
    ticketType: lookup.ticket.type,
    customerName: lookup.ticket.customer_name,
    courseTitle: lookup.courseTitle,
    checkedInAt: updated.checked_in_at,
  };
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
  if (result.state === "invalid") return "Kein gueltiges Ticket fuer diesen Token gefunden.";
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
  const result = token ? await processTicketCheckIn(token, user.id) : null;
  const resultHint = result ? getResultHint(result) : null;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Ticket-Check-in</h1>
        <p className="text-sm text-muted-foreground">
          QR-Link oeffnen oder Token manuell einfuegen. Gueltige Tickets werden direkt eingecheckt.
        </p>
      </header>

      <section className="rounded-2xl border p-4">
        <form action="/dashboard/check-in" method="get" className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            name="token"
            defaultValue={token}
            placeholder="QR-Token eingeben"
            className="min-w-0 flex-1 rounded-xl border px-4 py-3 text-sm"
          />
          <button type="submit" className="rounded-xl border px-4 py-3 text-sm font-semibold">
            Ticket pruefen
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

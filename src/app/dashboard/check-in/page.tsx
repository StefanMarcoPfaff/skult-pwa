import { redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadTicketByQrToken } from "@/lib/tickets";

type SearchParams = Record<string, string | string[] | undefined>;

type CheckInResult = {
  message: string;
  tone: "neutral" | "success" | "warning" | "danger";
  ticketType: string | null;
  customerName: string | null;
  courseTitle: string | null;
  status: string | null;
};

function getParam(sp: SearchParams, key: string): string {
  const value = sp[key];
  return Array.isArray(value) ? String(value[0] ?? "").trim() : String(value ?? "").trim();
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
    return {
      message: "invalid token",
      tone: "danger",
      ticketType: null,
      customerName: null,
      courseTitle: null,
      status: null,
    };
  }

  if (lookup.teacherId && lookup.teacherId !== teacherId) {
    return {
      message: "invalid token",
      tone: "danger",
      ticketType: lookup.ticket.type,
      customerName: lookup.ticket.customer_name,
      courseTitle: lookup.courseTitle,
      status: lookup.ticket.status,
    };
  }

  if (lookup.ticket.status === "checked_in") {
    return {
      message: "already used",
      tone: "warning",
      ticketType: lookup.ticket.type,
      customerName: lookup.ticket.customer_name,
      courseTitle: lookup.courseTitle,
      status: lookup.ticket.status,
    };
  }

  if (lookup.ticket.status === "cancelled") {
    return {
      message: "cancelled",
      tone: "warning",
      ticketType: lookup.ticket.type,
      customerName: lookup.ticket.customer_name,
      courseTitle: lookup.courseTitle,
      status: lookup.ticket.status,
    };
  }

  if (lookup.ticket.status === "expired") {
    return {
      message: "invalid token",
      tone: "danger",
      ticketType: lookup.ticket.type,
      customerName: lookup.ticket.customer_name,
      courseTitle: lookup.courseTitle,
      status: lookup.ticket.status,
    };
  }

  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("tickets")
    .update({
      status: "checked_in",
      checked_in_at: now,
      checked_in_by: teacherId,
    })
    .eq("id", lookup.ticket.id)
    .eq("status", "issued");

  if (error) {
    return {
      message: "invalid token",
      tone: "danger",
      ticketType: lookup.ticket.type,
      customerName: lookup.ticket.customer_name,
      courseTitle: lookup.courseTitle,
      status: lookup.ticket.status,
    };
  }

  return {
    message: lookup.ticket.type === "trial" ? "trial lesson attendance confirmed" : "workshop ticket checked in",
    tone: "success",
    ticketType: lookup.ticket.type,
    customerName: lookup.ticket.customer_name,
    courseTitle: lookup.courseTitle,
    status: "checked_in",
  };
}

function resultClasses(tone: CheckInResult["tone"]): string {
  if (tone === "success") return "border-green-200 bg-green-50 text-green-800";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (tone === "danger") return "border-red-200 bg-red-50 text-red-800";
  return "border-border bg-background text-foreground";
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

import Link from "next/link";
import { redirect } from "next/navigation";
import { buildMailtoHref, buildParticipantMailSubject } from "@/lib/mailto";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TrialParticipantLifecycleButtons } from "./ParticipantLifecycleButtons";
import { getParticipantLifecycleDisplay } from "./participant-lifecycle";

type CourseRow = {
  id: string;
  title: string;
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
  trial_ends_at: string | null;
  registration_expires_at: string | null;
  cancelled_at: string | null;
  ticket_status?: string | null;
  ticket_checked_in_at?: string | null;
};

type TicketLookupRow = {
  trial_reservation_id: string | null;
  status: string | null;
  checked_in_at: string | null;
};

type QueryClient =
  | Pick<Awaited<ReturnType<typeof createSupabaseServerClient>>, "from">
  | Pick<ReturnType<typeof createSupabaseAdmin>, "from">;

type ParticipantsPageData = {
  saved: string | null;
  reservations: TrialReservationRow[];
  courseTitleById: Map<string, string>;
};

function formatRequestedAt(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatStatus(status: string | null, ticketStatus: string | null): string {
  const decisionStatus = status ?? "pending";
  if (decisionStatus === "cancelled") return "Storniert";
  if (decisionStatus === "approved") return "Freigegeben";
  if (decisionStatus === "rejected") return "Abgesagt";
  if (ticketStatus === "checked_in") return "Entscheidung offen";
  return "Ausstehend";
}

function needsTeacherDecision(reservation: TrialReservationRow): boolean {
  return (
    !reservation.cancelled_at &&
    (reservation.decision_status ?? "pending") === "pending" &&
    reservation.ticket_status === "checked_in"
  );
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

async function loadParticipantsPageData(
  searchParams: Promise<Record<string, string | string[] | undefined>>
): Promise<ParticipantsPageData> {
  const sp = await searchParams;
  const saved = resolveSavedState(sp);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let dataClient: QueryClient = supabase;
  try {
    dataClient = createSupabaseAdmin();
  } catch {
    dataClient = supabase;
  }

  const { data: ownCourses } = await dataClient
    .from("courses")
    .select("id,title")
    .eq("teacher_id", user.id)
    .returns<CourseRow[]>();

  const courses = ownCourses ?? [];
  const courseIds = courses.map((course) => course.id);
  const courseTitleById = new Map(courses.map((course) => [course.id, course.title]));

  let reservations: TrialReservationRow[] = [];
  if (courseIds.length > 0) {
    const { data } = await dataClient
      .from("trial_reservations")
      .select(
        "id,course_id,first_name,last_name,email,status,decision_status,approved_at,rejected_at,decision_taken_at,trial_ends_at,registration_expires_at,cancelled_at"
      )
      .in("course_id", courseIds)
      .order("trial_starts_at", { ascending: false })
      .returns<TrialReservationRow[]>();

    reservations = data ?? [];

    if (reservations.length > 0) {
      const { data: tickets } = await dataClient
        .from("tickets")
        .select("trial_reservation_id,status,checked_in_at")
        .in(
          "trial_reservation_id",
          reservations.map((reservation) => reservation.id)
        )
        .returns<TicketLookupRow[]>();

      const ticketByReservationId = new Map(
        (tickets ?? [])
          .filter((ticket) => ticket.trial_reservation_id)
          .map((ticket) => [
            ticket.trial_reservation_id as string,
            { status: ticket.status, checkedInAt: ticket.checked_in_at },
          ])
      );

      reservations = reservations.map((reservation) => {
        const ticket = ticketByReservationId.get(reservation.id);
        return {
          ...reservation,
          ticket_status: ticket?.status ?? null,
          ticket_checked_in_at: ticket?.checkedInAt ?? null,
        };
      });

      reservations.sort((left, right) => {
        const leftPriority = needsTeacherDecision(left) ? 0 : 1;
        const rightPriority = needsTeacherDecision(right) ? 0 : 1;
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;
        return String(right.trial_ends_at ?? "").localeCompare(String(left.trial_ends_at ?? ""));
      });
    }
  }

  return { saved, reservations, courseTitleById };
}

function FlashMessages(props: { saved: string | null }) {
  return (
    <>
      {props.saved === "approved" ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Der Probeschueler wurde fuer die Anmeldung freigegeben.
        </p>
      ) : null}
      {props.saved === "rejected" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Der Probeschueler wurde freundlich abgesagt.
        </p>
      ) : null}
      {props.saved === "attendance_required" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Eine Entscheidung ist erst moeglich, nachdem das Probestunden-Ticket eingecheckt wurde.
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
    </>
  );
}

export default async function DashboardParticipantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { saved, reservations, courseTitleById } = await loadParticipantsPageData(searchParams);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Teilnehmer*innen</h1>
        <p className="text-sm text-muted-foreground">
          Hier siehst du Probestunden, Check-ins und offene Entscheidungen fuer deine Kurse.
        </p>
      </header>

      <FlashMessages saved={saved} />

      {reservations.length === 0 ? (
        <section className="rounded-2xl border p-6">
          <p className="text-sm text-muted-foreground">Bisher liegen noch keine Probestunden-Anfragen vor.</p>
        </section>
      ) : (
        <section className="overflow-x-auto rounded-2xl border">
          <table className="min-w-full divide-y">
            <thead className="bg-muted/40">
              <tr className="text-left text-sm">
                <th className="px-4 py-3 font-semibold">Vorname</th>
                <th className="px-4 py-3 font-semibold">Nachname</th>
                <th className="px-4 py-3 font-semibold">E-Mail</th>
                <th className="px-4 py-3 font-semibold">Kurs</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Check-in</th>
                <th className="px-4 py-3 font-semibold">Probestunde beendet</th>
                <th className="px-4 py-3 font-semibold">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {reservations.map((reservation) => {
                const offerTitle = courseTitleById.get(reservation.course_id) ?? "Angebot";
                const mailHref = buildMailtoHref({
                  to: reservation.email ? [reservation.email] : [],
                  subject: buildParticipantMailSubject(offerTitle),
                });
                const lifecycle = getParticipantLifecycleDisplay({
                  reservationCancelledAt: reservation.cancelled_at,
                  reservationDecisionStatus: reservation.decision_status,
                  trialTicketStatus: reservation.ticket_status ?? null,
                  hasCompletedRegistration: false,
                });

                return (
                  <tr
                    key={reservation.id}
                    className={needsTeacherDecision(reservation) ? "bg-amber-50/40" : undefined}
                  >
                    <td className="px-4 py-3">{reservation.first_name ?? "-"}</td>
                    <td className="px-4 py-3">{reservation.last_name ?? "-"}</td>
                    <td className="px-4 py-3">{reservation.email ?? "-"}</td>
                    <td className="px-4 py-3">{offerTitle}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-medium">
                        {formatStatus(reservation.status, reservation.ticket_status ?? null)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {reservation.ticket_status === "checked_in"
                        ? `Eingecheckt am ${formatRequestedAt(reservation.ticket_checked_in_at ?? null)}`
                        : reservation.ticket_status === "issued"
                          ? "Noch nicht eingecheckt"
                          : reservation.ticket_status ?? "-"}
                    </td>
                    <td className="px-4 py-3">{formatRequestedAt(reservation.trial_ends_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {mailHref ? (
                          <a href={mailHref} className="inline-flex rounded-xl border px-3 py-2 text-xs font-semibold">
                            E-Mail
                          </a>
                        ) : (
                          <span className="inline-flex cursor-not-allowed rounded-xl border px-3 py-2 text-xs font-semibold text-muted-foreground opacity-60">
                            E-Mail
                          </span>
                        )}
                        <Link
                          href={`/dashboard/participants/${reservation.id}?source=trial`}
                          className="inline-flex rounded-xl border px-3 py-2 text-xs font-semibold"
                        >
                          Details
                        </Link>
                        {!reservation.cancelled_at && reservation.status !== "cancelled" ? (
                          <TrialParticipantLifecycleButtons
                            reservationId={reservation.id}
                            redirectTo="/dashboard/participants"
                            playClassName={lifecycle.playClassName}
                            pauseClassName={lifecycle.pauseClassName}
                            stopClassName={lifecycle.stopClassName}
                            playDisabled={lifecycle.playDisabled}
                            stopDisabled={lifecycle.stopDisabled}
                            showApprovalAction={needsTeacherDecision(reservation)}
                            showCancellationAction={true}
                          />
                        ) : null}
                        {reservation.cancelled_at || reservation.status === "cancelled" ? (
                          <span className="text-xs text-muted-foreground">Reservierung storniert</span>
                        ) : (reservation.decision_status ?? "pending") === "pending" && reservation.ticket_status !== "checked_in" ? (
                          <span className="text-xs text-muted-foreground">Entscheidung nach Check-in moeglich</span>
                        ) : reservation.decision_status === "approved" && reservation.registration_expires_at ? (
                          <span className="text-xs text-muted-foreground">
                            Freigegeben am {formatRequestedAt(reservation.decision_taken_at ?? reservation.approved_at)}
                          </span>
                        ) : reservation.decision_status === "rejected" ? (
                          <span className="text-xs text-muted-foreground">
                            Abgesagt am {formatRequestedAt(reservation.decision_taken_at ?? reservation.rejected_at)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

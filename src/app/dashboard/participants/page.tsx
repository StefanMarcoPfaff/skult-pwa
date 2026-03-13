import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { approveTrialReservationAction, rejectTrialReservationAction } from "./actions";

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
  created_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  registration_expires_at: string | null;
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

function formatStatus(status: string | null): string {
  if (status === "pending") return "Ausstehend";
  if (status === "approved") return "Freigegeben";
  if (status === "rejected") return "Abgelehnt";
  return status ?? "-";
}

export default async function DashboardParticipantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const approvedParam = Array.isArray(sp.approved) ? sp.approved[0] : sp.approved;
  const rejectedParam = Array.isArray(sp.rejected) ? sp.rejected[0] : sp.rejected;
  const approved = approvedParam === "1";
  const rejected = rejectedParam === "1";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: ownCourses } = await supabase
    .from("courses")
    .select("id,title")
    .eq("teacher_id", user.id)
    .returns<CourseRow[]>();

  const courses = ownCourses ?? [];
  const courseIds = courses.map((course) => course.id);
  const courseTitleById = new Map(courses.map((course) => [course.id, course.title]));

  let reservations: TrialReservationRow[] = [];
  if (courseIds.length > 0) {
    const { data } = await supabase
      .from("trial_reservations")
      .select(
        "id,course_id,first_name,last_name,email,status,created_at,approved_at,rejected_at,registration_expires_at"
      )
      .in("course_id", courseIds)
      .order("created_at", { ascending: false })
      .returns<TrialReservationRow[]>();
    reservations = data ?? [];
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Teilnehmer*innen</h1>
        <p className="text-sm text-muted-foreground">
          Hier siehst du aktuelle Probestunden-Anfragen für deine Kurse.
        </p>
      </header>

      {approved ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Der Probeschüler wurde für die Anmeldung freigegeben.
        </p>
      ) : null}

      {rejected ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Der Probeschüler kann sich nicht für den Kurs anmelden.
        </p>
      ) : null}

      {reservations.length === 0 ? (
        <section className="rounded-2xl border p-6">
          <p className="text-sm text-muted-foreground">
            Bisher liegen noch keine Probestunden-Anfragen vor.
          </p>
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
                <th className="px-4 py-3 font-semibold">Angefragt am</th>
                <th className="px-4 py-3 font-semibold">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {reservations.map((reservation) => (
                <tr key={reservation.id}>
                  <td className="px-4 py-3">{reservation.first_name ?? "-"}</td>
                  <td className="px-4 py-3">{reservation.last_name ?? "-"}</td>
                  <td className="px-4 py-3">{reservation.email ?? "-"}</td>
                  <td className="px-4 py-3">{courseTitleById.get(reservation.course_id) ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-medium">
                      {formatStatus(reservation.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">{formatRequestedAt(reservation.created_at)}</td>
                  <td className="px-4 py-3">
                    {reservation.status === "pending" ? (
                      <div className="flex flex-wrap gap-2">
                        <form action={approveTrialReservationAction}>
                          <input type="hidden" name="reservationId" value={reservation.id} />
                          <button
                            type="submit"
                            className="inline-flex rounded-xl border border-green-300 bg-green-50 px-3 py-2 text-xs font-semibold text-green-800"
                          >
                            Zur Anmeldung freigeben
                          </button>
                        </form>
                        <form action={rejectTrialReservationAction}>
                          <input type="hidden" name="reservationId" value={reservation.id} />
                          <button
                            type="submit"
                            className="inline-flex rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"
                          >
                            Anmeldung ablehnen
                          </button>
                        </form>
                      </div>
                    ) : reservation.status === "approved" && reservation.registration_expires_at ? (
                      <span className="text-xs text-muted-foreground">
                        Reserviert bis {formatRequestedAt(reservation.registration_expires_at)}
                      </span>
                    ) : reservation.status === "rejected" && reservation.rejected_at ? (
                      <span className="text-xs text-muted-foreground">
                        Abgelehnt am {formatRequestedAt(reservation.rejected_at)}
                      </span>
                    ) : reservation.status === "approved" && reservation.approved_at ? (
                      <span className="text-xs text-muted-foreground">
                        Freigegeben am {formatRequestedAt(reservation.approved_at)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

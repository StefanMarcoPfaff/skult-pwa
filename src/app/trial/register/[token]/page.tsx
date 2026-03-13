import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type TrialRegistrationRow = {
  id: string;
  course_id: string;
  first_name: string | null;
  status: string | null;
  registration_expires_at: string | null;
};

type CourseRow = {
  id: string;
  title: string | null;
};

function isExpired(value: string | null): boolean {
  if (!value) return true;
  const expiresAt = new Date(value);
  return Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now();
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

export default async function TrialRegistrationTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createSupabaseAdmin();

  const { data: reservation } = await admin
    .from("trial_reservations")
    .select("id,course_id,first_name,status,registration_expires_at")
    .eq("registration_token", token)
    .maybeSingle<TrialRegistrationRow>();

  if (!reservation || reservation.status !== "approved" || isExpired(reservation.registration_expires_at)) {
    return (
      <main className="mx-auto max-w-2xl space-y-6 p-6">
        <section className="rounded-2xl border p-6">
          <h1 className="text-2xl font-semibold">Link nicht mehr gueltig</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Dieser Anmeldelink ist ungueltig oder bereits abgelaufen.
          </p>
          <Link href="/courses" className="mt-4 inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
            Zu den Kursen
          </Link>
        </section>
      </main>
    );
  }

  const { data: course } = await admin
    .from("courses")
    .select("id,title")
    .eq("id", reservation.course_id)
    .maybeSingle<CourseRow>();

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <section className="rounded-2xl border p-6">
        <h1 className="text-2xl font-semibold">Anmeldung vorbereitet</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Hallo {reservation.first_name ?? ""}, du bist fuer die verbindliche Anmeldung zu{" "}
          <span className="font-medium text-foreground">{course?.title ?? "diesem Kurs"}</span> freigegeben.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Die finale Anmeldung ist noch nicht implementiert. Dein Platz bleibt bis{" "}
          <span className="font-medium text-foreground">
            {formatDateTime(reservation.registration_expires_at)}
          </span>{" "}
          reserviert.
        </p>
        <Link href="/courses" className="mt-4 inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
          Zu den Kursen
        </Link>
      </section>
    </main>
  );
}

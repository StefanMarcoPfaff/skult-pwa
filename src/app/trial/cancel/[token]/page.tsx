import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { confirmTrialCancellationAction } from "./actions";

type TrialReservationRow = {
  id: string;
  course_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  cancelled_at: string | null;
};

type CourseMailRow = {
  id: string;
  title: string | null;
  location: string | null;
};

function formatDateTimeRange(start: string | null, end: string | null): string {
  if (!start) return "-";
  const startsAt = new Date(start);
  const date = startsAt.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const startTime = startsAt.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (!end) return `${date} | ${startTime}`;

  const endsAt = new Date(end);
  const endTime = endsAt.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} | ${startTime}-${endTime}`;
}

export default async function TrialCancelPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string; already?: string; invalid?: string; error?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const admin = createSupabaseAdmin();

  const { data: reservation, error } = await admin
    .from("trial_reservations")
    .select("id,course_id,first_name,last_name,email,trial_starts_at,trial_ends_at,cancelled_at")
    .eq("cancel_token", token)
    .maybeSingle<TrialReservationRow>();

  if (error || !reservation || sp.invalid === "1") {
    return (
      <main className="mx-auto max-w-2xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Stornierung nicht möglich</h1>
        <p className="text-sm text-muted-foreground">
          Dieser Stornierungslink ist ungültig oder die Reservierung wurde nicht gefunden.
        </p>
        <Link href="/courses" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
          Zu den Kursen
        </Link>
      </main>
    );
  }

  const { data: course } = await admin
    .from("courses")
    .select("id,title,location")
    .eq("id", reservation.course_id)
    .maybeSingle<CourseMailRow>();

  if (reservation.cancelled_at || sp.already === "1") {
    return (
      <main className="mx-auto max-w-2xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Reservierung bereits storniert</h1>
        <p className="text-sm text-muted-foreground">
          Diese Probestunden-Reservierung wurde bereits storniert.
        </p>
        <Link href="/courses" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
          Zu den Kursen
        </Link>
      </main>
    );
  }

  if (sp.done === "1") {
    return (
      <main className="mx-auto max-w-2xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Reservierung storniert</h1>
        <p className="text-sm text-muted-foreground">
          Deine Probestunden-Reservierung wurde storniert. Eine Bestätigung wurde per E-Mail versendet.
        </p>
        <Link href="/courses" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
          Zu den Kursen
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <section className="rounded-2xl border p-6">
        <h1 className="text-2xl font-semibold">Bist du sicher, dass du diese Probestunde stornieren möchtest?</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Bitte prüfe die Zusammenfassung. Die Stornierung kann danach nicht automatisch rückgängig gemacht werden.
        </p>

        <div className="mt-5 space-y-2 rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
          <p>
            Kurs: <span className="font-medium text-foreground">{course?.title ?? "Kurs"}</span>
          </p>
          <p>
            Name:{" "}
            <span className="font-medium text-foreground">
              {[reservation.first_name, reservation.last_name].filter(Boolean).join(" ").trim() || "-"}
            </span>
          </p>
          {reservation.email ? (
            <p>
              E-Mail: <span className="font-medium text-foreground">{reservation.email}</span>
            </p>
          ) : null}
          <p>
            Termin:{" "}
            <span className="font-medium text-foreground">
              {formatDateTimeRange(reservation.trial_starts_at, reservation.trial_ends_at)}
            </span>
          </p>
          {course?.location ? (
            <p>
              Ort: <span className="font-medium text-foreground">{course.location}</span>
            </p>
          ) : null}
        </div>

        {sp.error === "1" ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Die Probestunden-Reservierung konnte gerade nicht storniert werden. Bitte versuche es erneut.
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <form action={confirmTrialCancellationAction.bind(null, token)}>
            <button
              type="submit"
              className="inline-flex rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
            >
              Ja, Probestunde stornieren
            </button>
          </form>
          <Link href="/courses" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
            Nein, zurück
          </Link>
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setCoursePublishStateAction } from "./[id]/actions";

type OfferRow = {
  id: string;
  teacher_id: string;
  title: string;
  kind: string | null;
  is_published: boolean | null;
  location: string | null;
  starts_at: string | null;
  weekday: number | null;
  start_time: string | null;
  recurrence_type: string | null;
  created_at: string | null;
};

type SessionRow = {
  course_id: string;
};

const weekdayLabels: Record<number, string> = {
  0: "So",
  1: "Mo",
  2: "Di",
  3: "Mi",
  4: "Do",
  5: "Fr",
  6: "Sa",
};

function formatWorkshopDateTime(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatCourseSchedule(weekday: number | null, startTime: string | null, recurrence: string | null) {
  const weekdayLabel =
    weekday !== null && Number.isInteger(weekday) && weekdayLabels[weekday] ? weekdayLabels[weekday] : null;
  const recurrenceLabel =
    recurrence === "weekly"
      ? "wöchentlich"
      : recurrence === "biweekly"
      ? "14-tägig"
      : recurrence === "monthly"
      ? "monatlich"
      : recurrence;

  const parts = [weekdayLabel, startTime, recurrenceLabel].filter(Boolean);
  return parts.length ? parts.join(" • ") : null;
}

export default async function DashboardCoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const baseSelect =
    "id,teacher_id,title,kind,is_published,location,starts_at,weekday,start_time,recurrence_type,created_at";

  let offersResult = await supabase
    .from("courses")
    .select(baseSelect)
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false })
    .returns<OfferRow[]>();

  if (offersResult.error) {
    offersResult = await supabase
      .from("courses")
      .select(baseSelect)
      .eq("teacher_id", user.id)
      .order("starts_at", { ascending: true, nullsFirst: false })
      .returns<OfferRow[]>();
  }

  const offers = offersResult.data ?? [];
  const offerIds = offers.map((o) => o.id);

  let sessionRows: SessionRow[] = [];
  if (offerIds.length > 0) {
    const { data } = await supabase
      .from("course_sessions")
      .select("course_id")
      .in("course_id", offerIds)
      .returns<SessionRow[]>();
    sessionRows = data ?? [];
  }

  const sessionCountByCourseId = new Map<string, number>();
  for (const row of sessionRows) {
    sessionCountByCourseId.set(row.course_id, (sessionCountByCourseId.get(row.course_id) ?? 0) + 1);
  }

  const totalCount = offers.length;
  const publishedCount = offers.filter((o) => o.is_published).length;
  const draftCount = totalCount - publishedCount;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Meine Angebote</h1>
          <p className="text-sm text-muted-foreground">
            Hier verwaltest du deine Kurse und Workshops.
          </p>
        </div>

        <Link
          href="/dashboard/courses/new"
          className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold"
        >
          Neues Angebot
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border p-4">
          <p className="text-sm text-muted-foreground">Angebote gesamt</p>
          <p className="mt-1 text-2xl font-semibold">{totalCount}</p>
        </div>
        <div className="rounded-2xl border p-4">
          <p className="text-sm text-muted-foreground">Veröffentlicht</p>
          <p className="mt-1 text-2xl font-semibold">{publishedCount}</p>
        </div>
        <div className="rounded-2xl border p-4">
          <p className="text-sm text-muted-foreground">Entwürfe</p>
          <p className="mt-1 text-2xl font-semibold">{draftCount}</p>
        </div>
      </section>

      {offers.length === 0 ? (
        <section className="rounded-2xl border p-6">
          <p className="text-sm text-muted-foreground">Du hast noch keine Angebote angelegt.</p>
          <Link
            href="/dashboard/courses/new"
            className="mt-4 inline-flex rounded-xl border px-4 py-2 text-sm font-semibold"
          >
            Neues Angebot
          </Link>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {offers.map((offer) => {
            const kind = (offer.kind ?? "").toLowerCase();
            const statusLabel = offer.is_published ? "Veröffentlicht" : "Entwurf";

            const workshopHasMultipleSessions = (sessionCountByCourseId.get(offer.id) ?? 0) > 1;
            const workshopTiming = workshopHasMultipleSessions
              ? "Mehrere Termine"
              : formatWorkshopDateTime(offer.starts_at);
            const courseTiming = formatCourseSchedule(offer.weekday, offer.start_time, offer.recurrence_type);

            return (
              <article key={offer.id} className="rounded-2xl border p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{offer.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {kind === "course" ? "Kurs" : kind === "workshop" ? "Workshop" : "-"} • {statusLabel}
                    </p>
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                  {offer.location ? <p>Ort: {offer.location}</p> : null}
                  {kind === "workshop" && workshopTiming ? <p>{workshopTiming}</p> : null}
                  {kind === "course" && courseTiming ? <p>{courseTiming}</p> : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/dashboard/courses/${offer.id}`}
                    className="inline-flex rounded-lg border px-3 py-1.5 text-sm font-semibold"
                  >
                    Ansehen
                  </Link>
                  <Link
                    href={`/dashboard/courses/${offer.id}/edit`}
                    className="inline-flex rounded-lg border px-3 py-1.5 text-sm font-semibold"
                  >
                    Ändern
                  </Link>
                  <form action={setCoursePublishStateAction}>
                    <input type="hidden" name="course_id" value={offer.id} />
                    <input type="hidden" name="mode" value={offer.is_published ? "draft" : "published"} />
                    <input type="hidden" name="redirect_to" value="/dashboard/courses" />
                    <button type="submit" className="rounded-lg border px-3 py-1.5 text-sm font-semibold">
                      {offer.is_published ? "Veröffentlichung zurückziehen" : "Jetzt veröffentlichen"}
                    </button>
                  </form>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

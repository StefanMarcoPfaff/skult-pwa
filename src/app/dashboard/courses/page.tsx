import Link from "next/link";
import { redirect } from "next/navigation";
import {
  formatCourseLifecycleDate,
  getCourseStatusLabel,
  type CourseStatus,
} from "@/lib/course-lifecycle-shared";
import {
  getCourseTerminationModelValue,
  getWorkshopCancellationPolicySummary,
  getWorkshopCancellationPolicyValue,
} from "@/lib/offer-policies";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setCoursePublishStateAction } from "./[id]/actions";
import { CourseCardShareButton } from "./CourseCardShareButton";

type OfferRow = {
  id: string;
  teacher_id: string;
  title: string;
  kind: string | null;
  status: CourseStatus;
  is_published: boolean | null;
  location: string | null;
  starts_at: string | null;
  weekday: number | null;
  start_time: string | null;
  recurrence_type: string | null;
  created_at: string | null;
  cancellation_model: string | null;
  workshop_storno_policy: string | null;
  pause_start_date: string | null;
  pause_end_date: string | null;
  stop_date: string | null;
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
      ? "woechentlich"
      : recurrence === "biweekly"
        ? "14-taegig"
        : recurrence === "monthly"
          ? "monatlich"
          : recurrence;

  const parts = [weekdayLabel, startTime, recurrenceLabel].filter(Boolean);
  return parts.length ? parts.join(" • ") : null;
}

function ActionIcon(props: {
  title: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={props.title}
      aria-label={props.label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background transition ${props.className ?? "text-muted-foreground hover:text-foreground"}`}
    >
      {props.children}
    </span>
  );
}

export default async function DashboardCoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const savedParam = Array.isArray(sp.saved) ? sp.saved[0] : sp.saved;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const baseSelect =
    "id,teacher_id,title,kind,status,is_published,location,starts_at,weekday,start_time,recurrence_type,created_at,cancellation_model,workshop_storno_policy,pause_start_date,pause_end_date,stop_date";

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
  const activeCount = offers.filter((o) => o.status !== "draft").length;
  const draftCount = offers.filter((o) => o.status === "draft").length;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Meine Angebote</h1>
          <p className="text-sm text-muted-foreground">Hier verwaltest du deine Kurse und Workshops.</p>
        </div>

        <Link href="/dashboard/courses/new" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
          Neues Angebot
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border p-4">
          <p className="text-sm text-muted-foreground">Angebote gesamt</p>
          <p className="mt-1 text-2xl font-semibold">{totalCount}</p>
        </div>
        <div className="rounded-2xl border p-4">
          <p className="text-sm text-muted-foreground">Aktiv oder geplant</p>
          <p className="mt-1 text-2xl font-semibold">{activeCount}</p>
        </div>
        <div className="rounded-2xl border p-4">
          <p className="text-sm text-muted-foreground">Entwuerfe</p>
          <p className="mt-1 text-2xl font-semibold">{draftCount}</p>
        </div>
      </section>

      {savedParam === "missing_policy" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Aktivieren nicht moeglich. Bitte hinterlege zuerst die Stornierungs- bzw. Kuendigungsbedingungen.
        </p>
      ) : null}

      {offers.length === 0 ? (
        <section className="rounded-2xl border p-6">
          <p className="text-sm text-muted-foreground">Du hast noch keine Angebote angelegt.</p>
          <Link href="/dashboard/courses/new" className="mt-4 inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
            Neues Angebot
          </Link>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {offers.map((offer) => {
            const kind = (offer.kind ?? "").toLowerCase();
            const statusLabel = getCourseStatusLabel(offer.status);
            const pauseStartLabel = formatCourseLifecycleDate(offer.pause_start_date);
            const pauseEndLabel = formatCourseLifecycleDate(offer.pause_end_date);
            const stopDateLabel = formatCourseLifecycleDate(offer.stop_date);
            const workshopHasMultipleSessions = (sessionCountByCourseId.get(offer.id) ?? 0) > 1;
            const workshopTiming = workshopHasMultipleSessions
              ? "Mehrere Termine"
              : formatWorkshopDateTime(offer.starts_at);
            const courseTiming = formatCourseSchedule(offer.weekday, offer.start_time, offer.recurrence_type);
            const policyLabel =
              kind === "course"
                ? "Abrechnung: monatlich | Kursmodell: fortlaufend"
                : getWorkshopCancellationPolicySummary({
                    cancellation_policy: offer.workshop_storno_policy,
                  });
            const isMissingPolicy =
              (kind === "course" &&
                !getCourseTerminationModelValue({ termination_model: offer.cancellation_model })) ||
              (kind === "workshop" &&
                !getWorkshopCancellationPolicyValue({
                  cancellation_policy: offer.workshop_storno_policy,
                }));
            const publicHref = `/courses/${offer.id}`;
            const detailHref = `/dashboard/courses/${offer.id}`;
            const playIconClass =
              offer.status === "active"
                ? "border-green-200 text-green-700"
                : "text-muted-foreground hover:text-foreground";
            const pauseIconClass =
              offer.status === "paused" || offer.status === "pause_scheduled"
                ? "border-orange-200 text-orange-700"
                : "text-muted-foreground hover:text-foreground";
            const stopIconClass =
              offer.status === "stop_scheduled" || offer.status === "ended"
                ? "border-red-200 text-red-700"
                : "text-muted-foreground hover:text-foreground";

            return (
              <article key={offer.id} className="group relative rounded-2xl border p-5 transition hover:border-foreground/20 hover:shadow-sm">
                <Link href={detailHref} aria-label={`${offer.title} ansehen`} className="absolute inset-0 rounded-2xl" />
                <div className="flex items-start justify-between gap-3">
                  <div className="relative z-10">
                    <h2 className="text-lg font-semibold">{offer.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {kind === "course" ? "Kurs" : kind === "workshop" ? "Workshop" : "-"} • {statusLabel}
                    </p>
                  </div>
                  <div className="relative z-10 flex items-center gap-2">
                    {offer.status === "draft" ? (
                      <form action={setCoursePublishStateAction}>
                        <input type="hidden" name="course_id" value={offer.id} />
                        <input type="hidden" name="mode" value="play" />
                        <input type="hidden" name="redirect_to" value="/dashboard/courses" />
                        <button
                          type="submit"
                          disabled={isMissingPolicy}
                          title="veröffentlichen / starten"
                          aria-label="veröffentlichen / starten"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                            <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l10-6.86a1 1 0 0 0 0-1.72l-10-6.86a1 1 0 0 0-1.5.86Z" />
                          </svg>
                        </button>
                      </form>
                    ) : (
                      <Link href={detailHref} className="inline-flex">
                        <ActionIcon title="veröffentlichen / starten" label="veröffentlichen / starten" className={playIconClass}>
                          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                            <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l10-6.86a1 1 0 0 0 0-1.72l-10-6.86a1 1 0 0 0-1.5.86Z" />
                          </svg>
                        </ActionIcon>
                      </Link>
                    )}
                    <Link href={detailHref} className="inline-flex">
                      <ActionIcon title="pausieren" label="pausieren" className={pauseIconClass}>
                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                          <path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13A1.5 1.5 0 0 1 9.5 20h-1A1.5 1.5 0 0 1 7 18.5v-13Zm6 0A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 13 18.5v-13Z" />
                        </svg>
                      </ActionIcon>
                    </Link>
                    <Link href={detailHref} className="inline-flex">
                      <ActionIcon title="beenden" label="beenden" className={stopIconClass}>
                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                          <path d="M7 7.5A1.5 1.5 0 0 1 8.5 6h7A1.5 1.5 0 0 1 17 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 16.5v-9Z" />
                        </svg>
                      </ActionIcon>
                    </Link>
                    <Link
                      href={`/dashboard/courses/${offer.id}/edit`}
                      className="inline-flex relative z-10"
                      title="bearbeiten"
                      aria-label="bearbeiten"
                    >
                      <ActionIcon title="bearbeiten" label="bearbeiten">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                          <path d="m4 20 4.5-1 9-9a2.12 2.12 0 1 0-3-3l-9 9L4 20Z" />
                          <path d="M13.5 6.5 17.5 10.5" />
                        </svg>
                      </ActionIcon>
                    </Link>
                    <div className="relative z-10">
                      <CourseCardShareButton href={publicHref} />
                    </div>
                  </div>
                </div>

                <div className="relative z-10 mt-3 space-y-1 text-sm text-muted-foreground">
                  {offer.location ? <p>Ort: {offer.location}</p> : null}
                  {kind === "workshop" && workshopTiming ? <p>{workshopTiming}</p> : null}
                  {kind === "course" && courseTiming ? <p>{courseTiming}</p> : null}
                  {kind === "course" && pauseStartLabel ? <p>Pausenstart: {pauseStartLabel}</p> : null}
                  {kind === "course" && pauseEndLabel ? <p>Pause endet: {pauseEndLabel}</p> : null}
                  {kind === "course" && stopDateLabel ? <p>Stopdatum: {stopDateLabel}</p> : null}
                  <p>{kind === "course" ? "Kursmodell" : "Stornierungsbedingungen"}: {policyLabel}</p>
                  {offer.status === "draft" && isMissingPolicy ? (
                    <p className="text-red-700">Vor der Aktivierung muss zuerst eine Regel hinterlegt sein.</p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

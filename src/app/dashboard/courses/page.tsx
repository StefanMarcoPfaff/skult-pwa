import Link from "next/link";
import { redirect } from "next/navigation";
import {
  formatCourseLifecycleDate,
  getCourseStatusLabel,
  resolveDashboardCourseStatus,
  type CourseStatus,
} from "@/lib/course-lifecycle-shared";
import {
  getCourseTerminationModelValue,
  getWorkshopCancellationPolicySummary,
  getWorkshopCancellationPolicyValue,
} from "@/lib/offer-policies";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OfferCard } from "./OfferCard";

type OfferRow = {
  id: string;
  teacher_id: string;
  title: string;
  kind: string | null;
  status: CourseStatus | null;
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
  ends_at?: string | null;
};

type SessionRow = {
  course_id: string;
};

type DashboardOfferView = "all" | "active" | "drafts" | "archive";

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

function getOfferView(value: string | string[] | undefined): DashboardOfferView {
  const selected = Array.isArray(value) ? value[0] : value;
  if (selected === "active" || selected === "drafts" || selected === "archive") return selected;
  return "all";
}

function isArchivedOffer(offer: OfferRow, referenceTime: number): boolean {
  const status = resolveDashboardCourseStatus({
    status: offer.status,
    isPublished: offer.is_published,
    endsAt: offer.ends_at ?? null,
  });

  if (status === "draft") return false;
  if (status === "paused" || status === "stop_scheduled" || status === "ended") {
    return true;
  }

  if ((offer.kind ?? "").toLowerCase() === "workshop" && offer.starts_at) {
    const startsAt = new Date(offer.starts_at).getTime();
    if (Number.isFinite(startsAt) && startsAt < referenceTime) {
      return true;
    }
  }

  return false;
}

function buildTabHref(view: DashboardOfferView) {
  return view === "all" ? "/dashboard/courses" : `/dashboard/courses?view=${view}`;
}

function getReferenceTime() {
  return Date.now();
}

export default async function DashboardCoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const savedParam = Array.isArray(sp.saved) ? sp.saved[0] : sp.saved;
  const selectedView = getOfferView(sp.view);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const baseSelect =
    "id,teacher_id,title,kind,status,is_published,location,starts_at,ends_at,weekday,start_time,recurrence_type,created_at,cancellation_model,workshop_storno_policy,pause_start_date,pause_end_date,stop_date";
  const fallbackSelect =
    "id,teacher_id,title,kind,is_published,location,starts_at,ends_at,weekday,start_time,recurrence_type,created_at,cancellation_model,workshop_storno_policy";

  let offersResult = await supabase
    .from("courses")
    .select(baseSelect)
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false })
    .returns<OfferRow[]>();

  if (offersResult.error) {
    offersResult = await supabase
      .from("courses")
      .select(fallbackSelect)
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false })
      .returns<OfferRow[]>();
  }

  if (offersResult.error) {
    offersResult = await supabase
      .from("courses")
      .select(fallbackSelect)
      .eq("teacher_id", user.id)
      .order("starts_at", { ascending: true, nullsFirst: false })
      .returns<OfferRow[]>();
  }

  const offers = offersResult.data ?? [];
  const offerIds = offers.map((offer) => offer.id);

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

  const referenceTime = getReferenceTime();
  const draftOffers = offers.filter(
    (offer) =>
      resolveDashboardCourseStatus({
        status: offer.status,
        isPublished: offer.is_published,
        endsAt: offer.ends_at ?? null,
      }) === "draft"
  );
  const archivedOffers = offers.filter((offer) => isArchivedOffer(offer, referenceTime));
  const activeOffers = offers.filter(
    (offer) =>
      resolveDashboardCourseStatus({
        status: offer.status,
        isPublished: offer.is_published,
        endsAt: offer.ends_at ?? null,
      }) !== "draft" && !isArchivedOffer(offer, referenceTime)
  );

  const totalCount = offers.length;
  const activeCount = activeOffers.length;
  const draftCount = draftOffers.length;
  const archiveCount = archivedOffers.length;
  const visibleOffers =
    selectedView === "drafts"
      ? draftOffers
      : selectedView === "archive"
        ? archivedOffers
        : selectedView === "active"
          ? activeOffers
          : offers;

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

      <section className="grid gap-3 sm:grid-cols-4">
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
        <div className="rounded-2xl border p-4">
          <p className="text-sm text-muted-foreground">Archiv</p>
          <p className="mt-1 text-2xl font-semibold">{archiveCount}</p>
        </div>
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Angebotsfilter">
        {[
          { id: "all" as const, label: "Alle Angebote", count: totalCount },
          { id: "active" as const, label: "Aktive Angebote", count: activeCount },
          { id: "drafts" as const, label: "Entwuerfe", count: draftCount },
          { id: "archive" as const, label: "Vergangene / gestoppte Angebote", count: archiveCount },
        ].map((tab) => {
          const isSelected = selectedView === tab.id;
          return (
            <Link
              key={tab.id}
              href={buildTabHref(tab.id)}
              aria-current={isSelected ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                isSelected ? "border-foreground bg-foreground text-background" : "hover:border-foreground/30"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  isSelected ? "bg-background/15 text-background" : "bg-muted text-muted-foreground"
                }`}
              >
                {tab.count}
              </span>
            </Link>
          );
        })}
      </nav>

      {savedParam === "missing_policy" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Aktivieren nicht moeglich. Bitte hinterlege zuerst die Stornierungs- bzw. Kuendigungsbedingungen.
        </p>
      ) : null}
      {savedParam === "copy_error" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Das Angebot konnte nicht kopiert werden.
        </p>
      ) : null}

      {offers.length === 0 ? (
        <section className="rounded-2xl border p-6">
          <p className="text-sm text-muted-foreground">Du hast noch keine Angebote angelegt.</p>
          <Link href="/dashboard/courses/new" className="mt-4 inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
            Neues Angebot
          </Link>
        </section>
      ) : visibleOffers.length === 0 ? (
        <section className="rounded-2xl border p-6">
          <p className="text-sm text-muted-foreground">
            {selectedView === "active"
              ? "Aktuell gibt es keine aktiven Angebote."
              : selectedView === "drafts"
                ? "Aktuell gibt es keine Entwuerfe."
                : "Aktuell gibt es keine Angebote im Archiv."}
          </p>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {visibleOffers.map((offer) => {
            const kind = (offer.kind ?? "").toLowerCase();
            const normalizedStatus = resolveDashboardCourseStatus({
              status: offer.status,
              isPublished: offer.is_published,
              endsAt: offer.ends_at ?? null,
            });
            const statusLabel = getCourseStatusLabel(normalizedStatus);
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
              normalizedStatus === "active"
                ? "border-green-200 text-green-700"
                : "text-muted-foreground hover:text-foreground";
            const pauseIconClass =
              normalizedStatus === "paused" || normalizedStatus === "pause_scheduled"
                ? "border-orange-200 text-orange-700"
                : "text-muted-foreground hover:text-foreground";
            const stopIconClass =
              normalizedStatus === "stop_scheduled" || normalizedStatus === "ended"
                ? "border-red-200 text-red-700"
                : "text-muted-foreground hover:text-foreground";

            return (
              <OfferCard
                key={offer.id}
                id={offer.id}
                title={offer.title}
                kindLabel={kind === "course" ? "Kurs" : kind === "workshop" ? "Workshop" : "-"}
                statusLabel={statusLabel}
                location={offer.location}
                workshopTiming={kind === "workshop" ? workshopTiming : null}
                courseTiming={kind === "course" ? courseTiming : null}
                pauseStartLabel={kind === "course" ? pauseStartLabel : null}
                pauseEndLabel={kind === "course" ? pauseEndLabel : null}
                stopDateLabel={kind === "course" ? stopDateLabel : null}
                policyTypeLabel={kind === "course" ? "Kursmodell" : "Stornierungsbedingungen"}
                policyLabel={policyLabel}
                isMissingPolicy={isMissingPolicy}
                isDraft={normalizedStatus === "draft"}
                publicHref={publicHref}
                detailHref={detailHref}
                editHref={`/dashboard/courses/${offer.id}/edit`}
                playIconClass={playIconClass}
                pauseIconClass={pauseIconClass}
                stopIconClass={stopIconClass}
              />
            );
          })}
        </section>
      )}
    </main>
  );
}

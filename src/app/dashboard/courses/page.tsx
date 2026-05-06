import Link from "next/link";
import { redirect } from "next/navigation";
import {
  buildMailtoHref,
  buildOfferMailSubject,
  normalizeEmailRecipients,
  shouldWarnAboutLargeMailingGroup,
} from "@/lib/mailto";
import { formatCourseLifecycleDate, type CourseStatus } from "@/lib/course-lifecycle-shared";
import {
  getCourseTerminationModelValue,
  getWorkshopCancellationPolicySummary,
  getWorkshopCancellationPolicyValue,
} from "@/lib/offer-policies";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OfferCard } from "./OfferCard";
import {
  DISABLED_OFFER_ACTION_ICON_CLASS,
  type DashboardOfferView,
  getDisplayStatus,
} from "./display-status";

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

type TrialReservationEmailRow = {
  course_id: string;
  email: string | null;
};

type WorkshopBookingEmailRow = {
  course_id: string | null;
  customer_email: string | null;
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

function getOfferView(value: string | string[] | undefined): DashboardOfferView {
  const selected = Array.isArray(value) ? value[0] : value;
  if (selected === "active" || selected === "drafts" || selected === "archive") return selected;
  return "all";
}

function buildTabHref(view: DashboardOfferView) {
  return view === "all" ? "/dashboard/courses" : `/dashboard/courses?view=${view}`;
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
  const admin = createSupabaseAdmin();
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
  let trialReservationEmailRows: TrialReservationEmailRow[] = [];
  let workshopBookingEmailRows: WorkshopBookingEmailRow[] = [];
  if (offerIds.length > 0) {
    const [{ data: sessionData }, { data: trialEmailData }, { data: workshopEmailData }] = await Promise.all([
      supabase.from("course_sessions").select("course_id").in("course_id", offerIds).returns<SessionRow[]>(),
      admin
        .from("trial_reservations")
        .select("course_id,email")
        .in("course_id", offerIds)
        .returns<TrialReservationEmailRow[]>(),
      admin
        .from("bookings")
        .select("course_id,customer_email")
        .in("course_id", offerIds)
        .eq("status", "paid")
        .returns<WorkshopBookingEmailRow[]>(),
    ]);
    sessionRows = sessionData ?? [];
    trialReservationEmailRows = trialEmailData ?? [];
    workshopBookingEmailRows = workshopEmailData ?? [];
  }

  const sessionCountByCourseId = new Map<string, number>();
  for (const row of sessionRows) {
    sessionCountByCourseId.set(row.course_id, (sessionCountByCourseId.get(row.course_id) ?? 0) + 1);
  }
  const offerEmailsById = new Map<string, Array<string | null>>();
  for (const row of trialReservationEmailRows) {
    const existing = offerEmailsById.get(row.course_id) ?? [];
    existing.push(row.email ?? null);
    offerEmailsById.set(row.course_id, existing);
  }
  for (const row of workshopBookingEmailRows) {
    if (!row.course_id) continue;
    const existing = offerEmailsById.get(row.course_id) ?? [];
    existing.push(row.customer_email ?? null);
    offerEmailsById.set(row.course_id, existing);
  }

  const offerDisplayStateById = new Map(
    offers.map((offer) => [
      offer.id,
      getDisplayStatus({
        kind: offer.kind,
        status: offer.status,
        isPublished: offer.is_published,
        endsAt: offer.ends_at ?? null,
        startsAt: offer.starts_at,
      }),
    ])
  );

  const draftOffers = offers.filter((offer) => offerDisplayStateById.get(offer.id)?.view === "drafts");
  const archivedOffers = offers.filter((offer) => offerDisplayStateById.get(offer.id)?.view === "archive");
  const activeOffers = offers.filter((offer) => offerDisplayStateById.get(offer.id)?.view === "active");

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
          <p className="text-sm text-muted-foreground">Aktiv / veröffentlicht</p>
          <p className="mt-1 text-2xl font-semibold">{activeCount}</p>
        </div>
        <div className="rounded-2xl border p-4">
          <p className="text-sm text-muted-foreground">Entwürfe / pausiert</p>
          <p className="mt-1 text-2xl font-semibold">{draftCount}</p>
        </div>
        <div className="rounded-2xl border p-4">
          <p className="text-sm text-muted-foreground">Vergangen / gestoppt</p>
          <p className="mt-1 text-2xl font-semibold">{archiveCount}</p>
        </div>
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Angebotsfilter">
        {[
          { id: "all" as const, label: "Alle Angebote", count: totalCount, tone: "neutral" as const },
          {
            id: "active" as const,
            label: "Aktive / veröffentlichte Angebote",
            count: activeCount,
            tone: "green" as const,
          },
          {
            id: "drafts" as const,
            label: "Entwürfe / pausierte Angebote",
            count: draftCount,
            tone: "orange" as const,
          },
          { id: "archive" as const, label: "Vergangene / gestoppte Angebote", count: archiveCount },
        ].map((tab) => {
          const isSelected = selectedView === tab.id;
          const tabClasses =
            tab.id === "active"
              ? isSelected
                ? "border-green-300 bg-green-100 text-green-900"
                : "border-green-200 text-green-800 hover:bg-green-50"
              : tab.id === "drafts"
                ? isSelected
                  ? "border-orange-300 bg-orange-100 text-orange-900"
                  : "border-orange-200 text-orange-800 hover:bg-orange-50"
                : tab.id === "archive"
                  ? isSelected
                    ? "border-red-300 bg-red-100 text-red-900"
                    : "border-red-200 text-red-800 hover:bg-red-50"
                  : isSelected
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 text-slate-800 hover:bg-slate-50";
          return (
            <Link
              key={tab.id}
              href={buildTabHref(tab.id)}
              aria-current={isSelected ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${tabClasses}`}
            >
              {tab.id === "active" ? (
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l10-6.86a1 1 0 0 0 0-1.72l-10-6.86a1 1 0 0 0-1.5.86Z" />
                </svg>
              ) : tab.id === "drafts" ? (
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13A1.5 1.5 0 0 1 9.5 20h-1A1.5 1.5 0 0 1 7 18.5v-13Zm6 0A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 13 18.5v-13Z" />
                </svg>
              ) : tab.id === "archive" ? (
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M7 7.5A1.5 1.5 0 0 1 8.5 6h7A1.5 1.5 0 0 1 17 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 16.5v-9Z" />
                </svg>
              ) : null}
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${isSelected ? "bg-white/70 text-current" : "bg-muted text-muted-foreground"}`}
              >
                {tab.count}
              </span>
            </Link>
          );
        })}
      </nav>

      {savedParam === "missing_policy" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Aktivieren nicht möglich. Bitte hinterlege zuerst die Stornierungs- bzw. Kündigungsbedingungen.
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
                ? "Aktuell gibt es keine Entwürfe oder pausierten Angebote."
                : "Aktuell gibt es keine Angebote im Archiv."}
          </p>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {visibleOffers.map((offer) => {
            const kind = (offer.kind ?? "").toLowerCase();
            const displayState = offerDisplayStateById.get(offer.id);
            if (!displayState) return null;
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
            const recipientEmails = normalizeEmailRecipients(offerEmailsById.get(offer.id) ?? []);
            const mailHref = buildMailtoHref({
              bcc: recipientEmails,
              subject: buildOfferMailSubject(offer.kind, offer.title),
            });
            const showMailWarning = shouldWarnAboutLargeMailingGroup(recipientEmails.length, mailHref);
            return (
              <OfferCard
                key={offer.id}
                id={offer.id}
                title={offer.title}
                kindLabel={kind === "course" ? "Kurs" : kind === "workshop" ? "Workshop" : "-"}
                statusLabel={displayState.currentStatusLabel}
                location={offer.location}
                workshopTiming={kind === "workshop" ? workshopTiming : null}
                courseTiming={kind === "course" ? courseTiming : null}
                pauseStartLabel={kind === "course" ? pauseStartLabel : null}
                pauseEndLabel={kind === "course" ? pauseEndLabel : null}
                stopDateLabel={kind === "course" ? stopDateLabel : null}
                policyTypeLabel={kind === "course" ? "Kursmodell" : "Stornierungsbedingungen"}
                policyLabel={policyLabel}
                showActivationHint={displayState.normalizedStatus === "draft" && isMissingPolicy}
                publicHref={publicHref}
                detailHref={detailHref}
                editHref={`/dashboard/courses/${offer.id}/edit`}
                checkInHref={`/dashboard/courses/${offer.id}/check-in`}
                playIconClass={isMissingPolicy ? DISABLED_OFFER_ACTION_ICON_CLASS : displayState.playClassName}
                pauseIconClass={displayState.pauseClassName}
                stopIconClass={displayState.stopClassName}
                playDisabled={displayState.playDisabled || isMissingPolicy}
                pauseDisabled={displayState.pauseDisabled}
                stopDisabled={displayState.stopDisabled}
                mailHref={mailHref}
                showMailWarning={showMailWarning}
              />
            );
          })}
        </section>
      )}
    </main>
  );
}

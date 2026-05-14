import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getOfferArchiveEligibility } from "@/app/dashboard/archive-rules";
import { buildOfferCalendarPath } from "@/lib/calendar";
import { hasOfferCalendarData } from "@/lib/calendar-resolver";
import { formatMoney } from "@/lib/course-display";
import { formatCourseLifecycleDate, type CourseStatus } from "@/lib/course-lifecycle-shared";
import {
  buildMailtoHref,
  buildOfferMailSubject,
  normalizeEmailRecipients,
  shouldWarnAboutLargeMailingGroup,
} from "@/lib/mailto";
import {
  getCourseTerminationModelValue,
  getWorkshopCancellationPolicySummary,
  getWorkshopCancellationPolicyValue,
} from "@/lib/offer-policies";
import { getOfferKindLabel, getOfferVisibilityLabel, isOneTimeOfferKind } from "@/lib/offer-ui";
import { normalizeOfferVisibility } from "@/lib/public-offer-visibility";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import DashboardFilterPanel from "../_components/DashboardFilterPanel";
import DashboardPageHeader from "../_components/DashboardPageHeader";
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
  visibility: string | null;
  location: string | null;
  starts_at: string | null;
  duration_minutes: number | null;
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
  archived_at: string | null;
  price_cents: number | null;
  currency: string | null;
};

type SessionRow = {
  course_id: string;
};

type TrialReservationRow = {
  course_id: string;
  email: string | null;
  decision_status: string | null;
  cancelled_at: string | null;
  archived_at: string | null;
};

type RegistrationIntentRow = {
  course_id: string;
  status: string | null;
  subscription_status: string | null;
  archived_at: string | null;
};

type WorkshopBookingRow = {
  course_id: string | null;
  customer_email: string | null;
  status: string | null;
  refunded_at: string | null;
  stripe_refund_id: string | null;
  archived_at: string | null;
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
  return parts.length ? parts.join(" · ") : null;
}

function formatOfferPrice(priceCents: number | null, currency: string | null) {
  if (priceCents === null || !Number.isFinite(priceCents)) return null;
  if (priceCents <= 0) return "Kostenlos";
  return formatMoney(priceCents, currency || "EUR");
}

function getOfferView(value: string | string[] | undefined): DashboardOfferView {
  const selected = Array.isArray(value) ? value[0] : value;
  if (selected === "active" || selected === "drafts" || selected === "archive") return selected;
  return "all";
}

function buildTabHref(view: DashboardOfferView) {
  return view === "all" ? "/dashboard/courses" : `/dashboard/courses?view=${view}`;
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l10-6.86a1 1 0 0 0 0-1.72l-10-6.86a1 1 0 0 0-1.5.86Z" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13A1.5 1.5 0 0 1 9.5 20h-1A1.5 1.5 0 0 1 7 18.5v-13Zm6 0A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 13 18.5v-13Z" />
    </svg>
  );
}

function StopGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M7 7.5A1.5 1.5 0 0 1 8.5 6h7A1.5 1.5 0 0 1 17 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 16.5v-9Z" />
    </svg>
  );
}

function FilterTab(props: {
  href: string;
  active: boolean;
  tone: "neutral" | "green" | "orange" | "red";
  icon?: ReactNode;
  label: string;
}) {
  const toneClasses =
    props.tone === "green"
      ? props.active
        ? "border-green-600 bg-green-600 text-white"
        : "border-green-200 bg-green-50 text-green-800 hover:border-green-300"
      : props.tone === "orange"
        ? props.active
          ? "border-orange-500 bg-orange-500 text-white"
          : "border-orange-200 bg-orange-50 text-orange-800 hover:border-orange-300"
        : props.tone === "red"
          ? props.active
            ? "border-red-600 bg-red-600 text-white"
            : "border-red-200 bg-red-50 text-red-800 hover:border-red-300"
          : props.active
            ? "border-slate-900 bg-slate-900 text-white"
            : "border-slate-200 bg-white text-slate-800 hover:border-slate-300";

  return (
    <Link
      href={props.href}
      aria-current={props.active ? "page" : undefined}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${toneClasses}`}
    >
      {props.icon ? <span className="inline-flex h-4 w-4 items-center justify-center">{props.icon}</span> : null}
      <span>{props.label}</span>
    </Link>
  );
}

export default async function DashboardCoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const savedParam = Array.isArray(sp.saved) ? sp.saved[0] : sp.saved;
  const selectedView = getOfferView(sp.view);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdmin();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const baseSelect =
    "id,teacher_id,title,kind,status,is_published,visibility,location,starts_at,ends_at,duration_minutes,weekday,start_time,recurrence_type,created_at,cancellation_model,workshop_storno_policy,pause_start_date,pause_end_date,stop_date,archived_at,price_cents,currency";
  const fallbackSelect =
    "id,teacher_id,title,kind,is_published,visibility,location,starts_at,ends_at,duration_minutes,weekday,start_time,recurrence_type,created_at,cancellation_model,workshop_storno_policy,archived_at,price_cents,currency";

  let offersResult = await admin
    .from("courses")
    .select(baseSelect)
    .eq("teacher_id", user.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .returns<OfferRow[]>();

  if (offersResult.error) {
    offersResult = await admin
      .from("courses")
      .select(fallbackSelect)
      .eq("teacher_id", user.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .returns<OfferRow[]>();
  }

  if (offersResult.error) {
    offersResult = await admin
      .from("courses")
      .select(fallbackSelect)
      .eq("teacher_id", user.id)
      .is("archived_at", null)
      .order("starts_at", { ascending: true, nullsFirst: false })
      .returns<OfferRow[]>();
  }

  const offers = offersResult.data ?? [];
  const offerIds = offers.map((offer) => offer.id);

  let sessionRows: SessionRow[] = [];
  let trialReservationRows: TrialReservationRow[] = [];
  let registrationIntentRows: RegistrationIntentRow[] = [];
  let workshopBookingRows: WorkshopBookingRow[] = [];
  if (offerIds.length > 0) {
    const [{ data: sessionData }, { data: reservationData }, { data: intentData }, { data: bookingData }] =
      await Promise.all([
        supabase.from("course_sessions").select("course_id").in("course_id", offerIds).returns<SessionRow[]>(),
        admin
          .from("trial_reservations")
          .select("course_id,email,decision_status,cancelled_at,archived_at")
          .in("course_id", offerIds)
          .returns<TrialReservationRow[]>(),
        admin
          .from("course_registration_intents")
          .select("course_id,status,subscription_status,archived_at")
          .in("course_id", offerIds)
          .returns<RegistrationIntentRow[]>(),
        admin
          .from("bookings")
          .select("course_id,customer_email,status,refunded_at,stripe_refund_id,archived_at")
          .in("course_id", offerIds)
          .returns<WorkshopBookingRow[]>(),
      ]);
    sessionRows = sessionData ?? [];
    trialReservationRows = reservationData ?? [];
    registrationIntentRows = intentData ?? [];
    workshopBookingRows = bookingData ?? [];
  }

  const sessionCountByCourseId = new Map<string, number>();
  for (const row of sessionRows) {
    sessionCountByCourseId.set(row.course_id, (sessionCountByCourseId.get(row.course_id) ?? 0) + 1);
  }

  const offerEmailsById = new Map<string, Array<string | null>>();
  for (const row of trialReservationRows) {
    if (row.archived_at) continue;
    const existing = offerEmailsById.get(row.course_id) ?? [];
    existing.push(row.email ?? null);
    offerEmailsById.set(row.course_id, existing);
  }
  for (const row of workshopBookingRows) {
    if (!row.course_id || row.archived_at) continue;
    const existing = offerEmailsById.get(row.course_id) ?? [];
    existing.push(row.customer_email ?? null);
    offerEmailsById.set(row.course_id, existing);
  }

  const offerDisplayStateById = new Map(
    offers.map((offer) => [
      offer.id,
      getDisplayStatus({
        kind: offer.kind,
        status: offer.status ?? "draft",
        isPublished: offer.is_published,
        endsAt: offer.ends_at ?? null,
        startsAt: offer.starts_at,
      }),
    ])
  );

  const visibleOffers = offers.filter((offer) => {
    if (selectedView === "all") return true;
    return offerDisplayStateById.get(offer.id)?.view === selectedView;
  });

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <DashboardPageHeader
        title="Meine Angebote"
        description="Hier verwaltest du deine laufenden und einmaligen Angebote."
        actions={
          <Link href="/dashboard/courses/new" className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
            Neues Angebot
          </Link>
        }
      />

      <DashboardFilterPanel>
        <nav className="flex flex-wrap gap-2" aria-label="Angebotsfilter">
        <FilterTab href={buildTabHref("all")} active={selectedView === "all"} tone="neutral" label="Alle Angebote" />
        <FilterTab href={buildTabHref("active")} active={selectedView === "active"} tone="green" icon={<PlayGlyph />} label="Aktive / buchbare Angebote" />
        <FilterTab href={buildTabHref("drafts")} active={selectedView === "drafts"} tone="orange" icon={<PauseGlyph />} label="Entwürfe / pausierte Angebote" />
        <FilterTab href={buildTabHref("archive")} active={selectedView === "archive"} tone="red" icon={<StopGlyph />} label="Vergangene / gestoppte Angebote" />
        </nav>
      </DashboardFilterPanel>

      {savedParam === "missing_policy" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Aktivieren nicht möglich. Bitte hinterlege zuerst die Stornierungs- bzw. Kündigungsbedingungen.
        </p>
      ) : null}
      {savedParam === "offer_archived" ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Das Angebot wurde archiviert.
        </p>
      ) : null}
      {savedParam === "offer_archive_invalid" || savedParam === "offer_archive_error" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Das Angebot konnte nicht archiviert werden.
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
            const workshopTiming = workshopHasMultipleSessions ? "Mehrere Termine" : formatWorkshopDateTime(offer.starts_at);
            const courseTiming = formatCourseSchedule(offer.weekday, offer.start_time, offer.recurrence_type);
            const policyLabel =
              kind === "course"
                ? "Abrechnung: monatlich · Modell: fortlaufend"
                : getWorkshopCancellationPolicySummary({
                    cancellation_policy: offer.workshop_storno_policy,
                  });
            const isMissingPolicy =
              (kind === "course" &&
                !getCourseTerminationModelValue({ termination_model: offer.cancellation_model })) ||
              (isOneTimeOfferKind(kind) &&
                !getWorkshopCancellationPolicyValue({
                  cancellation_policy: offer.workshop_storno_policy,
                }));
            const publicUrl = `${siteUrl}/courses/${offer.id}`;
            const embedUrl = `${siteUrl}/embed/courses/${offer.id}`;
            const visibility = normalizeOfferVisibility(offer.visibility);
            const detailHref = `/dashboard/courses/${offer.id}`;
            const recipientEmails = normalizeEmailRecipients(offerEmailsById.get(offer.id) ?? []);
            const mailHref = buildMailtoHref({
              bcc: recipientEmails,
              subject: buildOfferMailSubject(offer.kind, offer.title),
            });
            const showMailWarning = shouldWarnAboutLargeMailingGroup(recipientEmails.length, mailHref);
            const calendarEnabled = hasOfferCalendarData({
              kind: offer.kind,
              startsAt: offer.starts_at,
              durationMinutes: offer.duration_minutes,
              startTime: offer.start_time,
              recurrenceType: offer.recurrence_type,
              sessionCount: sessionCountByCourseId.get(offer.id) ?? 0,
            });

            const activeTrialCount = trialReservationRows.filter(
              (row) =>
                !row.archived_at &&
                row.course_id === offer.id &&
                !row.cancelled_at &&
                row.decision_status !== "rejected"
            ).length;
            const activeRegistrationCount = registrationIntentRows.filter(
              (row) =>
                !row.archived_at &&
                row.course_id === offer.id &&
                row.status === "checkout_completed" &&
                ["active", "pause_scheduled", "paused", "cancel_scheduled"].includes(row.subscription_status ?? "active")
            ).length;
            const activeBookingCount = workshopBookingRows.filter(
              (row) =>
                !row.archived_at &&
                row.course_id === offer.id &&
                row.status === "paid" &&
                !row.refunded_at &&
                !row.stripe_refund_id
            ).length;
            const archiveEligibility = getOfferArchiveEligibility({
              kind: offer.kind,
              status: offer.status,
              startsAt: offer.starts_at,
              endsAt: offer.ends_at ?? null,
              archivedAt: offer.archived_at,
              activeTrialCount,
              activeRegistrationCount,
              activeBookingCount,
              openPaymentCount: activeBookingCount,
            });

            return (
              <OfferCard
                key={offer.id}
                id={offer.id}
                title={offer.title}
                kindLabel={getOfferKindLabel(offer.kind)}
                statusLabel={displayState.currentStatusLabel}
                priceLabel={formatOfferPrice(offer.price_cents, offer.currency)}
                visibility={visibility}
                visibilityLabel={getOfferVisibilityLabel(offer.visibility)}
                location={offer.location}
                workshopTiming={isOneTimeOfferKind(kind) ? workshopTiming : null}
                courseTiming={kind === "course" ? courseTiming : null}
                pauseStartLabel={kind === "course" ? pauseStartLabel : null}
                pauseEndLabel={kind === "course" ? pauseEndLabel : null}
                stopDateLabel={kind === "course" ? stopDateLabel : null}
                policyTypeLabel={kind === "course" ? "Modell" : "Stornierungsbedingungen"}
                policyLabel={policyLabel}
                showActivationHint={displayState.normalizedStatus === "draft" && isMissingPolicy}
                publicUrl={publicUrl}
                embedUrl={embedUrl}
                publicOfferEnabled={displayState.normalizedStatus === "active"}
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
                calendarHref={calendarEnabled ? buildOfferCalendarPath(offer.id) : null}
                calendarDisabledReason={calendarEnabled ? null : "Kalenderdatei erst mit Termin verfügbar"}
                showMailWarning={showMailWarning}
                archiveAllowed={archiveEligibility.allowed}
                archiveReason={archiveEligibility.reason}
              />
            );
          })}
        </section>
      )}
    </main>
  );
}

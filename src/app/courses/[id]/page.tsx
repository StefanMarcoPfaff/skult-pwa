import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import OfferSummaryCard from "@/components/offer/OfferSummaryCard";
import {
  formatCourseEndDate,
  isCourseClosedForNewRegistrations,
  isCourseEnded,
} from "@/lib/course-ending";
import {
  COURSE_BILLING_SUMMARY,
  COURSE_CANCELLATION_SUMMARY,
  getWorkshopCancellationPolicySummary,
} from "@/lib/offer-policies";
import { formatCoursePriceFromRow } from "@/lib/course-display";
import {
  formatWorkshopPriceLabel,
  shouldShowWorkshopCancellationPolicy,
} from "@/lib/workshop-offer-display";
import { buildOfferViewModel } from "@/lib/offers/offer-view-model";
import {
  buildOfferAvailability,
  loadOccupiedCourseSeats,
  loadOccupiedWorkshopSeats,
} from "@/lib/public-offer-availability";
import { getPublicCourseById } from "@/lib/public-offers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { PayButton } from "./PayButton";
import ReserveTrialButton from "./ReserveTrialButton";
import SoldOutInquiryForm from "./SoldOutInquiryForm";
import { buildTrialSlot, computeUpcomingTrialSlots, type TrialSlot } from "./trial-slots";
import { isOneTimeOfferKind } from "@/lib/offer-ui";

type Row = Record<string, unknown>;
type SessionRow = {
  id: string;
  course_id: string;
  starts_at: string | null;
  ends_at: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatPrice(row: Row): string | null {
  return formatCoursePriceFromRow({
    kind: asString(row.offer_type) ?? asString(row.kind),
    priceType: asString(row.price_type),
    priceCents: asNumber(row.price_cents),
    currency: asString(row.currency) ?? "EUR",
  });
}

const weekdayLabels: Record<number, string> = {
  0: "Sonntag",
  1: "Montag",
  2: "Dienstag",
  3: "Mittwoch",
  4: "Donnerstag",
  5: "Freitag",
  6: "Samstag",
};

function recurrenceLabel(value: string | null): string | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v === "weekly") return "wöchentlich";
  if (v === "biweekly") return "14-tägig";
  if (v === "monthly") return "monatlich";
  return value;
}

function isWorkshopBookable(startsAt: string | null, endsAt: string | null) {
  const reference = endsAt ?? startsAt;
  if (!reference) return true;
  const parsed = new Date(reference).getTime();
  return Number.isFinite(parsed) ? parsed >= Date.now() : true;
}

export default async function CourseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reserved?: string }>;
}) {
  const { id } = await params;
  const { reserved } = await searchParams;
  const publicOffer = await getPublicCourseById(id);
  if (!publicOffer) return notFound();

  const supabase = await createSupabaseAdmin();
  const data = publicOffer.offer;
  const kind = publicOffer.kind;
  const title = asString(data.title) ?? "Ohne Titel";
  const description = asString(data.description) ?? asString(data.subtitle);
  const location = asString(data.location);
  const price = formatPrice(data);
  const isSinglePaymentOffer = isOneTimeOfferKind(kind);

  const weekday = asNumber(data.weekday);
  const startTime = asString(data.start_time);
  const durationMinutes = asNumber(data.duration_minutes);
  const recurrenceRaw = asString(data.recurrence_type);
  const recurrence = recurrenceLabel(recurrenceRaw);
  const cancellationModel = asString(data.termination_model) ?? asString(data.cancellation_model);
  const workshopStornoPolicy =
    asString(data.cancellation_policy) ?? asString(data.workshop_storno_policy);
  const trialMode = (asString(data.trial_mode) ?? "all_sessions").toLowerCase();
  const startsAt = asString(data.starts_at);
  const endsAt = asString(data.ends_at);
  const capacity = asNumber(data.capacity);
  const priceCents = asNumber(data.price_cents);
  const courseEndLabel = formatCourseEndDate(endsAt);
  const courseClosedForNewRegistrations =
    kind === "course" && isCourseClosedForNewRegistrations(endsAt);
  const courseAlreadyEnded = kind === "course" && isCourseEnded(endsAt);

  let trialSlots: TrialSlot[] =
    kind === "course" && trialMode === "all_sessions" && startsAt
      ? computeUpcomingTrialSlots({
          weekday,
          startTime,
          durationMinutes,
          recurrenceType: recurrenceRaw,
          trialMode,
          startsAt,
        })
      : [];

  if (kind === "course" && trialMode === "manual") {
    const admin = createSupabaseAdmin();
    const { data: manualTrialSlots } = await admin
      .from("trial_slots")
      .select("starts_at,ends_at")
      .eq("course_id", id)
      .eq("is_open", true)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true });

    trialSlots = (manualTrialSlots ?? [])
      .map((slot) => buildTrialSlot(String(slot.starts_at ?? ""), String(slot.ends_at ?? "")))
      .filter((slot): slot is TrialSlot => slot !== null);
  }

  if (process.env.NODE_ENV !== "production" && kind === "course") {
    console.log("[courses/[id]] recurrence fields", {
      id: asString(data.id),
      starts_at: startsAt,
      weekday,
      start_time: startTime,
      duration_minutes: durationMinutes,
      recurrence_type: recurrenceRaw,
      trial_mode: trialMode,
    });
    console.log("[courses/[id]] generated occurrences", {
      id: asString(data.id),
      count: trialSlots.length,
    });
  }

  const occupiedSeats =
    kind === "course"
      ? await loadOccupiedCourseSeats(id)
      : isSinglePaymentOffer
        ? await loadOccupiedWorkshopSeats(id)
        : 0;
  const availability = buildOfferAvailability(capacity, occupiedSeats, {
    isBookable:
      kind === "course" ? !courseClosedForNewRegistrations : isWorkshopBookable(startsAt, endsAt),
  });
  const workshopCanBook = isSinglePaymentOffer ? isWorkshopBookable(startsAt, endsAt) : false;

  let sessions: SessionRow[] = [];
  if (isSinglePaymentOffer) {
    const { data: sessionData } = await supabase
      .from("course_sessions")
      .select("id,course_id,starts_at,ends_at")
      .eq("course_id", id)
      .order("starts_at", { ascending: true })
      .returns<SessionRow[]>();
    sessions = sessionData ?? [];
  }

  const { publicCourse, publicProfile, providerLabel, profileHeading, profileDescription, profilePhotoUrl, profileVideoUrl } =
    publicOffer;
  const reservationNotice = publicCourse?.reservation_notice?.trim() || null;

  const shouldShowProfileSection =
    !isSinglePaymentOffer &&
    Boolean(profileHeading || profileDescription || profilePhotoUrl || profileVideoUrl || providerLabel);
  const resolvedWorkshopPolicy =
    publicCourse?.workshop_storno_policy ?? workshopStornoPolicy;
  const workshopPolicyLabel = shouldShowWorkshopCancellationPolicy(priceCents)
    ? getWorkshopCancellationPolicySummary({
        cancellation_policy: resolvedWorkshopPolicy,
      })
    : null;
  const displayedPrice = isSinglePaymentOffer ? formatWorkshopPriceLabel(priceCents, asString(data.currency)) : price;
  const offerViewModel = buildOfferViewModel({
    course: {
      title,
      kind,
      description,
      location,
      location_details: asString(data.location_details),
      price_cents: priceCents,
      currency: asString(data.currency),
      price_type: asString(data.price_type),
      starts_at: startsAt,
      ends_at: endsAt,
      instructor_name: publicCourse?.instructor_name ?? null,
      workshop_storno_policy: resolvedWorkshopPolicy,
      offer_image_url: asString(data.offer_image_url),
    },
    providerProfile: publicProfile,
    sessions,
  });
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <p>
        <Link href="/courses" className="text-sm font-semibold underline underline-offset-4">
          ← Zurück
        </Link>
      </p>

      <OfferSummaryCard viewModel={offerViewModel} showDescription />

      {!isSinglePaymentOffer ? (
      <section className="rounded-2xl border p-4 text-sm text-muted-foreground">
        {kind === "course" ? <p>Abrechnung: {COURSE_BILLING_SUMMARY}</p> : null}
        {kind === "course" ? <p>Kündigung: {COURSE_CANCELLATION_SUMMARY}</p> : null}
        {kind === "course" && weekday !== null && weekdayLabels[weekday] ? (
          <p>Wochentag: {weekdayLabels[weekday]}</p>
        ) : null}
        {kind === "course" && startTime ? <p>Startzeit: {startTime}</p> : null}
        {kind === "course" && recurrence ? <p>Rhythmus: {recurrence}</p> : null}
        {kind === "course" && courseEndLabel ? (
          <p>{courseAlreadyEnded ? "Beendet am" : "Endet am"}: {courseEndLabel}</p>
        ) : null}
        {kind === "course" && cancellationModel ? <p>Der Preis ist als Monatsbeitrag zu verstehen.</p> : null}
      </section>
      ) : null}

      {shouldShowProfileSection ? (
        <section className="rounded-2xl border p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {profilePhotoUrl ? (
              <Image
                src={profilePhotoUrl}
                alt={profileHeading ?? "Anbietende"}
                width={96}
                height={96}
                className="h-24 w-24 rounded-2xl object-cover"
              />
            ) : null}

            <div className="space-y-3">
              {profileHeading ? <h2 className="text-xl font-semibold">{profileHeading}</h2> : null}
              {publicProfile?.provider_type === "studio_provider" && providerLabel && providerLabel !== profileHeading ? (
                <p className="text-sm text-muted-foreground">Organisation / Anbietende: {providerLabel}</p>
              ) : null}
              {profileDescription ? (
                <p className="text-sm leading-7 text-muted-foreground">{profileDescription}</p>
              ) : null}
              {profileVideoUrl ? (
                <p>
                  <a
                    href={profileVideoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold underline underline-offset-4"
                  >
                    Vorstellungsvideo ansehen
                  </a>
                </p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {isSinglePaymentOffer ? (
        <section className="space-y-3">
          <div className="space-y-2 rounded-2xl border p-4">
            <h3 className="text-base font-semibold">
              {availability.isSoldOut || !workshopCanBook ? "Anfragen" : "Jetzt reservieren"}
            </h3>
            {!workshopCanBook ? (
              <p className="text-sm text-muted-foreground">
                Dieses Angebot ist nicht mehr buchbar.
              </p>
            ) : availability.isSoldOut ? (
              <SoldOutInquiryForm
                courseId={id}
                offerLabel="einmaliges Angebot"
              />
            ) : (
              <>
              {reservationNotice ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  <h4 className="font-semibold">Wichtiger Hinweis</h4>
                  <p className="mt-2 whitespace-pre-line leading-6">{reservationNotice}</p>
                </div>
              ) : null}
              <PayButton
                courseId={id}
                priceLabel={displayedPrice}
                stornoPolicyLabel={workshopPolicyLabel}
                showCancellationTerms={offerViewModel.showCancellationTerms}
              />
              </>
            )}
          </div>
        </section>
      ) : (
        <section className="space-y-3 rounded-2xl border p-4">
          <h3 className="text-base font-semibold">
            {availability.isSoldOut ? "Anfragen" : "Kostenlosen Probetermin reservieren"}
          </h3>
          {courseEndLabel ? (
            <p className="text-sm text-muted-foreground">
              {courseAlreadyEnded
                ? `Dieses laufende Angebot wurde am ${courseEndLabel} beendet.`
                : `Dieses laufende Angebot endet am ${courseEndLabel}. Neue Probetermine und neue verbindliche Anmeldungen sind nicht mehr möglich.`}
            </p>
          ) : null}
          {capacity !== null ? (
            <p className={`text-sm font-medium ${availability.badgeClassName}`}>{availability.badgeText}</p>
          ) : null}
          {reserved === "1" ? (
            <p className="text-sm text-green-700">
              Deine Reservierung für den Probetermin war erfolgreich. Wir melden uns in Kürze mit allen weiteren Informationen bei dir.
            </p>
          ) : availability.isSoldOut ? (
            <SoldOutInquiryForm courseId={id} offerLabel="Laufendes Angebot" />
          ) : courseClosedForNewRegistrations ? (
            <p className="text-sm text-muted-foreground">
              Für dieses laufende Angebot sind aktuell keine neuen Probetermine oder Neuanmeldungen mehr möglich.
            </p>
          ) : trialSlots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aktuell sind keine Probetermin-Slots verfügbar.
            </p>
          ) : (
            <ReserveTrialButton courseId={id} trialSlots={trialSlots} />
          )}
        </section>
      )}
    </main>
  );
}

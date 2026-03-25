import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatCourseEndDate,
  isCourseClosedForNewRegistrations,
  isCourseEnded,
} from "@/lib/course-ending";
import { getProviderDisplayName } from "@/lib/provider-profiles";
import {
  COURSE_BILLING_SUMMARY,
  COURSE_CANCELLATION_SUMMARY,
  getWorkshopCancellationPolicySummary,
} from "@/lib/offer-policies";
import { formatCoursePriceFromRow } from "@/lib/course-display";
import {
  buildOfferAvailability,
  loadOccupiedCourseSeats,
  loadOccupiedWorkshopSeats,
} from "@/lib/public-offer-availability";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PayButton } from "./PayButton";
import ReserveTrialButton from "./ReserveTrialButton";
import SoldOutInquiryForm from "./SoldOutInquiryForm";
import { buildTrialSlot, computeUpcomingTrialSlots, type TrialSlot } from "./trial-slots";

type Row = Record<string, unknown>;
type SessionRow = {
  id: string;
  course_id: string;
  starts_at: string | null;
  ends_at: string | null;
};

type PublicCourseRow = {
  teacher_id: string | null;
  instructor_name: string | null;
  workshop_storno_policy: string | null;
};

type PublicProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: "independent_teacher" | "studio_provider" | null;
  organization_name: string | null;
  photo_url: string | null;
  bio: string | null;
  intro_video_url: string | null;
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

function getKind(row: Row): "workshop" | "course" | null {
  const raw = (asString(row.offer_type) ?? asString(row.kind) ?? "").toLowerCase();
  if (raw === "workshop" || raw === "course") return raw;
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

function formatSessionLine(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return "-";
  const start = new Date(startsAt);
  const date = start.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const startTime = start.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endTime = endsAt
    ? new Date(endsAt).toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

  return `${date} | ${startTime}-${endTime}`;
}

function isHttpUrl(value: string | null): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
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
  const supabase = await createSupabaseServerClient();

  let response = await supabase
    .from("courses_lite")
    .select("*")
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle<Row>();

  if (response.error) {
    response = await supabase.from("courses_lite").select("*").eq("id", id).maybeSingle<Row>();
  }

  if (response.error || !response.data) return notFound();

  const data = response.data;
  if (typeof data.is_published === "boolean" && !data.is_published) {
    return notFound();
  }

  const kind = getKind(data) ?? "workshop";
  const title = asString(data.title) ?? "Ohne Titel";
  const description = asString(data.description) ?? asString(data.subtitle);
  const location = asString(data.location);
  const price = formatPrice(data);

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
      : kind === "workshop"
        ? await loadOccupiedWorkshopSeats(id)
        : 0;
  const availability = buildOfferAvailability(capacity, occupiedSeats, {
    isBookable:
      kind === "course" ? !courseClosedForNewRegistrations : isWorkshopBookable(startsAt, endsAt),
  });
  const workshopCanBook = kind === "workshop" ? isWorkshopBookable(startsAt, endsAt) : false;

  let sessions: SessionRow[] = [];
  let publicCourse: PublicCourseRow | null = null;
  let publicProfile: PublicProfileRow | null = null;
  let profileHeading: string | null = null;
  let profileDescription: string | null = null;
  let profilePhotoUrl: string | null = null;
  let profileVideoUrl: string | null = null;
  let providerLabel: string | null = null;
  if (kind === "workshop") {
    const { data: sessionData } = await supabase
      .from("course_sessions")
      .select("id,course_id,starts_at,ends_at")
      .eq("course_id", id)
      .order("starts_at", { ascending: true })
      .returns<SessionRow[]>();
    sessions = sessionData ?? [];
  }

  {
    const admin = createSupabaseAdmin();
    const { data: loadedCourse } = await admin
      .from("courses")
      .select("teacher_id,instructor_name,workshop_storno_policy")
      .eq("id", id)
      .maybeSingle<PublicCourseRow>();

    publicCourse = loadedCourse ?? null;

    if (publicCourse?.teacher_id) {
      const { data: loadedProfile } = await admin
        .from("profiles")
        .select("first_name,last_name,provider_type,organization_name,photo_url,bio,intro_video_url")
        .eq("id", publicCourse.teacher_id)
        .maybeSingle<PublicProfileRow>();

      publicProfile = loadedProfile ?? null;
    }

    providerLabel =
      publicProfile?.provider_type
        ? getProviderDisplayName(publicProfile.provider_type, publicProfile)
        : null;

    if (publicProfile?.provider_type === "studio_provider") {
      profileHeading = publicCourse?.instructor_name ?? providerLabel;
    } else {
      profileHeading =
        [publicProfile?.first_name, publicProfile?.last_name].filter(Boolean).join(" ").trim() ||
        publicCourse?.instructor_name ||
        providerLabel;
    }

    profileDescription = publicProfile?.bio ?? null;
    profilePhotoUrl =
      isHttpUrl(publicProfile?.photo_url ?? null)
        ? (publicProfile?.photo_url ?? null)
        : null;
    profileVideoUrl =
      isHttpUrl(publicProfile?.intro_video_url ?? null)
        ? (publicProfile?.intro_video_url ?? null)
        : null;
  }

  const shouldShowProfileSection = Boolean(
    profileHeading || profileDescription || profilePhotoUrl || profileVideoUrl || providerLabel
  );
  const resolvedWorkshopPolicy =
    publicCourse?.workshop_storno_policy ?? workshopStornoPolicy;
  const workshopPolicyLabel = getWorkshopCancellationPolicySummary({
    cancellation_policy: resolvedWorkshopPolicy,
  });
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <p>
        <Link href="/courses" className="text-sm font-semibold underline underline-offset-4">
          ← Zurück
        </Link>
      </p>

      <header className="space-y-2">
        <h1 className="text-3xl font-black">{title}</h1>
        <p className="text-sm text-muted-foreground">{kind === "workshop" ? "Workshop" : "Kurs"}</p>
      </header>

      <section className="rounded-2xl border p-4 text-sm text-muted-foreground">
        {location ? <p>Ort: {location}</p> : null}
        {price ? <p>Preis: {price}</p> : null}
        {capacity !== null ? (
          <p>
            Freie Plätze:{" "}
            <span className={`rounded-full px-2 py-0.5 text-xs ${availability.badgeClassName}`}>
              {availability.badgeText}
            </span>
          </p>
        ) : null}
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

      {description ? <p className="leading-7">{description}</p> : null}

      {shouldShowProfileSection ? (
        <section className="rounded-2xl border p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {profilePhotoUrl ? (
              <Image
                src={profilePhotoUrl}
                alt={profileHeading ?? "Dozent*in"}
                width={96}
                height={96}
                className="h-24 w-24 rounded-2xl object-cover"
              />
            ) : null}

            <div className="space-y-3">
              {profileHeading ? <h2 className="text-xl font-semibold">{profileHeading}</h2> : null}
              {publicProfile?.provider_type === "studio_provider" && providerLabel && providerLabel !== profileHeading ? (
                <p className="text-sm text-muted-foreground">Anbieter: {providerLabel}</p>
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

      {kind === "workshop" ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Termine</h2>
          <div className="rounded-2xl border p-4 text-sm text-muted-foreground">
            {sessions.length > 0 ? (
              <ul className="space-y-2">
                {sessions.map((session) => (
                  <li key={session.id}>{formatSessionLine(session.starts_at, session.ends_at)}</li>
                ))}
              </ul>
            ) : startsAt ? (
              <p>{formatSessionLine(startsAt, null)}</p>
            ) : (
              <p>Termine folgen in Kürze.</p>
            )}
          </div>

          <div className="space-y-2 rounded-2xl border p-4">
            <h3 className="text-base font-semibold">
              {availability.isSoldOut || !workshopCanBook ? "Anfragen" : "Jetzt buchen"}
            </h3>
            {capacity !== null ? (
              <p className={`text-sm font-medium ${availability.badgeClassName}`}>{availability.badgeText}</p>
            ) : null}
            {!workshopCanBook ? (
              <p className="text-sm text-muted-foreground">
                Dieser Workshop ist nicht mehr buchbar.
              </p>
            ) : availability.isSoldOut ? (
              <SoldOutInquiryForm courseId={id} offerLabel="Workshop" />
            ) : (
              <PayButton
                courseId={id}
                teacherName={profileHeading ?? publicCourse?.instructor_name ?? providerLabel}
                priceLabel={price}
                stornoPolicyLabel={workshopPolicyLabel}
              />
            )}
          </div>
        </section>
      ) : (
        <section className="space-y-3 rounded-2xl border p-4">
          <h3 className="text-base font-semibold">
            {availability.isSoldOut ? "Anfragen" : "Kostenlose Probestunde reservieren"}
          </h3>
          {courseEndLabel ? (
            <p className="text-sm text-muted-foreground">
              {courseAlreadyEnded
                ? `Dieser Kurs wurde am ${courseEndLabel} beendet.`
                : `Dieser Kurs endet am ${courseEndLabel}. Neue Probestunden und neue verbindliche Anmeldungen sind nicht mehr möglich.`}
            </p>
          ) : null}
          {capacity !== null ? (
            <p className={`text-sm font-medium ${availability.badgeClassName}`}>{availability.badgeText}</p>
          ) : null}
          {reserved === "1" ? (
            <p className="text-sm text-green-700">
              Herzlichen Glückwunsch! Du hast dich erfolgreich zur Probestunde angemeldet. Wir melden uns in Kürze mit allen weiteren Informationen bei dir.
            </p>
          ) : availability.isSoldOut ? (
            <SoldOutInquiryForm courseId={id} offerLabel="Kurs" />
          ) : courseClosedForNewRegistrations ? (
            <p className="text-sm text-muted-foreground">
              Für diesen Kurs sind aktuell keine neuen Probestunden oder Neuanmeldungen mehr möglich.
            </p>
          ) : trialSlots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aktuell sind keine Probestunden-Termine verfügbar.
            </p>
          ) : (
            <ReserveTrialButton courseId={id} trialSlots={trialSlots} />
          )}
        </section>
      )}
    </main>
  );
}

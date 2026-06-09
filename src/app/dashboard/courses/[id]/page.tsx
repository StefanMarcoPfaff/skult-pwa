import Link from "next/link";
import { redirect } from "next/navigation";
import FormattedOfferDescription from "@/components/offer/FormattedOfferDescription";
import OneTimeOfferPreview from "@/components/offer/OneTimeOfferPreview";
import { getOfferArchiveEligibility } from "@/app/dashboard/archive-rules";
import {
  formatCourseLifecycleDate,
  getNextPossiblePauseDate,
  type CourseStatus,
} from "@/lib/course-lifecycle-shared";
import {
  COURSE_CANCELLATION_SUMMARY,
  getCourseTerminationModelValue,
  getWorkshopCancellationPolicySummary,
  getWorkshopCancellationPolicyValue,
} from "@/lib/offer-policies";
import { buildOfferCalendarPath } from "@/lib/calendar";
import { hasOfferCalendarData } from "@/lib/calendar-resolver";
import { formatMoney } from "@/lib/course-display";
import { formatBerlinDateTime, formatBerlinDateTimeRange } from "@/lib/formatting/berlin-time";
import {
  buildMailtoHref,
  buildOfferMailSubject,
  buildParticipantMailSubject,
  normalizeEmailRecipients,
  shouldWarnAboutLargeMailingGroup,
} from "@/lib/mailto";
import { getProviderDisplayName, type ProviderType } from "@/lib/provider-profiles";
import { normalizeOfferVisibility } from "@/lib/public-offer-visibility";
import { getPublicCourseById } from "@/lib/public-offers";
import { getSiteUrl } from "@/lib/site-url";
import { getOfferKindLabel, getOfferVisibilityLabel, isOneTimeOfferKind } from "@/lib/offer-ui";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ParticipantOverviewList } from "../../participants/ParticipantOverviewList";
import { loadParticipantOverviewItems } from "../../participants/participant-overview-data";
import { CourseDetailActions } from "./CourseDetailActions";
import { getDisplayStatus } from "../display-status";

type Row = {
  id: string;
  title: string;
  description: string | null;
  internal_note: string | null;
  location: string | null;
  location_details: string | null;
  starts_at: string | null;
  start_time: string | null;
  duration_minutes: number | null;
  recurrence_type: string | null;
  capacity: number | null;
  kind: string | null;
  status: CourseStatus | null;
  is_published: boolean | null;
  visibility: string | null;
  trial_mode: string | null;
  instructor_name: string | null;
  cancellation_model: string | null;
  workshop_storno_policy: string | null;
  teacher_id: string;
  ends_at: string | null;
  pause_start_date: string | null;
  pause_end_date: string | null;
  stop_date: string | null;
  archived_at?: string | null;
  offer_image_url: string | null;
  price_cents: number | null;
  currency: string | null;
};

type SessionRow = {
  id: string;
  course_id: string;
  starts_at: string | null;
  ends_at: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: ProviderType | null;
  organization_name: string | null;
  photo_url: string | null;
  company_logo_url: string | null;
};

type TrialParticipantRow = {
  id: string;
  course_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  decision_status: string | null;
  approved_at: string | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  registration_expires_at: string | null;
  converted_at: string | null;
  converted_registration_intent_id: string | null;
  cancelled_at?: string | null;
  archived_at?: string | null;
};

type TrialTicketRow = {
  trial_reservation_id: string | null;
  status: string | null;
  checked_in_at: string | null;
};

type RegistrationIntentRow = {
  id: string;
  trial_reservation_id: string | null;
  status: string | null;
  subscription_status?: string | null;
  archived_at?: string | null;
};

type WorkshopBookingRow = {
  id: string;
  course_id: string | null;
  status: string | null;
  attendee_key: string | null;
  checked_in_at: string | null;
  created_at: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  refunded_at?: string | null;
  stripe_refund_id?: string | null;
  archived_at?: string | null;
};

type WorkshopTicketRow = {
  booking_id: string | null;
  customer_name: string;
  customer_email: string;
  status: string | null;
  checked_in_at: string | null;
};

type CourseParticipantEntry = {
  id: string;
  name: string;
  email: string | null;
  statusLabel: string;
  checkInLabel: string;
  meta: string | null;
  mailHref: string | null;
};

type WorkshopParticipantEntry = {
  id: string;
  name: string;
  email: string | null;
  statusLabel: string;
  checkInLabel: string;
  meta: string | null;
  mailHref: string | null;
};

function formatDateTime(dt: string | null) {
  return formatBerlinDateTime(dt);
}

function formatTrialMode(value: string | null): string {
  if (value === "manual") return "Nur an ausgewählten Terminen";
  return "An jedem Termin möglich";
}

function formatName(firstName: string | null, lastName: string | null, fallback: string): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || fallback;
}

function resolveCourseParticipantEmail(participant: TrialParticipantRow): string | null {
  return participant.email;
}

function formatDateTimeRange(start: string | null, end: string | null): string | null {
  return formatBerlinDateTimeRange(start, end);
}

function formatOfferPrice(priceCents: number | null, currency: string | null): string {
  if (priceCents === null || !Number.isFinite(priceCents) || priceCents <= 0) return "Kostenlos";
  return formatMoney(priceCents, currency || "EUR");
}

function getDetailStatusPresentation(normalizedStatus: string) {
  if (normalizedStatus === "draft" || normalizedStatus === "paused" || normalizedStatus === "pause_scheduled") {
    return {
      panelClassName: "border-orange-200 bg-orange-50/70",
      badgeClassName: "border-orange-200 bg-orange-50 text-orange-800",
    };
  }

  if (normalizedStatus === "ended" || normalizedStatus === "stop_scheduled") {
    return {
      panelClassName: "border-red-200 bg-red-50/70",
      badgeClassName: "border-red-200 bg-red-50 text-red-700",
    };
  }

  return {
    panelClassName: "border-green-200 bg-green-50/70",
    badgeClassName: "border-green-200 bg-green-50 text-green-700",
  };
}

export default async function DashboardCourseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const savedParam = Array.isArray(sp.saved) ? sp.saved[0] : sp.saved;
  const returnToParam = Array.isArray(sp.returnTo) ? sp.returnTo[0] : sp.returnTo;
  const backHref =
    typeof returnToParam === "string" && returnToParam.startsWith("/dashboard/courses")
      ? returnToParam
      : "/dashboard/courses";

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdmin();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let courseResponse = await admin
    .from("courses")
    .select(
      "id,title,description,internal_note,location,location_details,starts_at,start_time,duration_minutes,recurrence_type,capacity,kind,status,is_published,trial_mode,instructor_name,cancellation_model,workshop_storno_policy,teacher_id,ends_at,pause_start_date,pause_end_date,stop_date"
      + ",archived_at,visibility,offer_image_url,price_cents,currency"
    )
    .eq("id", id)
    .eq("teacher_id", user.id)
    .single<Row>();

  if (courseResponse.error) {
    courseResponse = await admin
      .from("courses")
      .select(
        "id,title,description,internal_note,location,location_details,starts_at,start_time,duration_minutes,recurrence_type,capacity,kind,is_published,trial_mode,instructor_name,cancellation_model,workshop_storno_policy,teacher_id,ends_at,archived_at,visibility,offer_image_url,price_cents,currency"
      )
      .eq("id", id)
      .eq("teacher_id", user.id)
      .single<Row>();
  }

  const { data, error } = courseResponse;

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name,last_name,provider_type,organization_name,photo_url,company_logo_url")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  const { data: sessions } = await supabase
    .from("course_sessions")
    .select("*")
    .eq("course_id", id)
    .order("starts_at", { ascending: true })
    .returns<SessionRow[]>();

  const { data: trialParticipants } =
    data?.kind === "course"
      ? await admin
          .from("trial_reservations")
          .select(
            "id,course_id,first_name,last_name,email,decision_status,approved_at,trial_starts_at,trial_ends_at,registration_expires_at,converted_at,converted_registration_intent_id,cancelled_at,archived_at"
          )
          .eq("course_id", id)
          .is("archived_at", null)
          .order("trial_starts_at", { ascending: false })
          .returns<TrialParticipantRow[]>()
      : { data: [] as TrialParticipantRow[] };

  const trialReservationIds = (trialParticipants ?? []).map((participant) => participant.id);
  const [{ data: trialTickets }, { data: registrationIntents }] =
    data?.kind === "course" && trialReservationIds.length > 0
      ? await Promise.all([
          admin
            .from("tickets")
            .select("trial_reservation_id,status,checked_in_at")
            .in("trial_reservation_id", trialReservationIds)
            .returns<TrialTicketRow[]>(),
          admin
            .from("course_registration_intents")
            .select("id,trial_reservation_id,status,subscription_status,archived_at")
            .in("trial_reservation_id", trialReservationIds)
            .returns<RegistrationIntentRow[]>(),
        ])
      : [{ data: [] as TrialTicketRow[] }, { data: [] as RegistrationIntentRow[] }];

  const { data: workshopBookings } =
    isOneTimeOfferKind(data?.kind)
      ? await admin
          .from("bookings")
          .select("id,course_id,status,attendee_key,checked_in_at,created_at,customer_first_name,customer_last_name,customer_email,customer_phone,refunded_at,stripe_refund_id,archived_at")
          .eq("course_id", id)
          .is("archived_at", null)
          .order("created_at", { ascending: false })
          .returns<WorkshopBookingRow[]>()
      : { data: [] as WorkshopBookingRow[] };

  const workshopBookingIds = (workshopBookings ?? []).map((booking) => booking.id);
  const { data: workshopTickets } =
    isOneTimeOfferKind(data?.kind) && workshopBookingIds.length > 0
      ? await admin
          .from("tickets")
          .select("booking_id,customer_name,customer_email,status,checked_in_at")
          .in("booking_id", workshopBookingIds)
          .returns<WorkshopTicketRow[]>()
      : { data: [] as WorkshopTicketRow[] };

  if (error || !data) {
    return (
      <main style={{ padding: 24 }}>
        <Link href={backHref} style={{ fontWeight: 700 }}>
          Zurück
        </Link>
        <p style={{ marginTop: 16, fontSize: 18, fontWeight: 800 }}>Nicht gefunden</p>
      </main>
    );
  }

  const publicOffer = await getPublicCourseById(id);
  const siteUrl = getSiteUrl();
  const publicUrl = `${siteUrl}/courses/${data.id}`;
  const embedUrl = `${siteUrl}/embed/courses/${data.id}`;

  const providerLabel =
    profile?.provider_type
      ? getProviderDisplayName(profile.provider_type, {
          first_name: profile.first_name,
          last_name: profile.last_name,
          organization_name: profile.organization_name,
        })
      : null;
  const displayState = getDisplayStatus({
    kind: data.kind,
    status: data.status ?? "draft",
    isPublished: data.is_published ?? null,
    endsAt: data.ends_at ?? null,
    startsAt: data.starts_at,
  });
  const normalizedStatus = displayState.normalizedStatus;
  const statusLabel = displayState.currentStatusLabel;
  const isSinglePaymentOffer = isOneTimeOfferKind(data.kind);
  const detailStatusPresentation = getDetailStatusPresentation(normalizedStatus);
  const pauseStartLabel = formatCourseLifecycleDate(data.pause_start_date);
  const pauseEndLabel = formatCourseLifecycleDate(data.pause_end_date);
  const stopDateLabel = formatCourseLifecycleDate(data.stop_date);
  const workshopPolicyLabel = getWorkshopCancellationPolicySummary({
    cancellation_policy: data.workshop_storno_policy,
  });
  const nextPossiblePauseDate = getNextPossiblePauseDate();
  const publishBlockedForMissingPolicy =
    (data.kind === "course" && !getCourseTerminationModelValue({ termination_model: data.cancellation_model })) ||
    (data.kind !== "course" &&
      !getWorkshopCancellationPolicyValue({ cancellation_policy: data.workshop_storno_policy }));

  const ticketByTrialReservationId = new Map(
    (trialTickets ?? [])
      .filter((ticket) => ticket.trial_reservation_id)
      .map((ticket) => [ticket.trial_reservation_id as string, ticket])
  );
  const intentByTrialReservationId = new Map(
    (registrationIntents ?? []).map((intent) => [intent.trial_reservation_id, intent])
  );

  const groupedCourseParticipants =
    data.kind === "course"
      ? {
          firmlyRegistered: (trialParticipants ?? [])
            .filter((participant) => {
              const intent = intentByTrialReservationId.get(participant.id);
              return participant.converted_at || intent?.status === "checkout_completed";
            })
            .map<CourseParticipantEntry>((participant) => {
              const email = resolveCourseParticipantEmail(participant);
              return {
                id: participant.id,
                name: formatName(participant.first_name, participant.last_name, "Teilnehmer*in"),
                email,
                statusLabel: "Verbindlich angemeldet",
                checkInLabel:
                  ticketByTrialReservationId.get(participant.id)?.status === "checked_in"
                    ? `Eingecheckt am ${formatDateTime(
                        ticketByTrialReservationId.get(participant.id)?.checked_in_at ?? null
                      )}`
                    : ticketByTrialReservationId.get(participant.id)?.status === "issued"
                      ? "Noch nicht eingecheckt"
                      : "-",
                meta: participant.converted_at
                  ? `Anmeldung abgeschlossen am ${formatDateTime(participant.converted_at)}`
                  : formatDateTimeRange(participant.trial_starts_at, participant.trial_ends_at),
                mailHref: buildMailtoHref({
                  to: email ? [email] : [],
                  subject: buildParticipantMailSubject(data.title),
                }),
              };
            }),
          attendedApproved: (trialParticipants ?? [])
            .filter((participant) => {
              const ticket = ticketByTrialReservationId.get(participant.id);
              const intent = intentByTrialReservationId.get(participant.id);
              const isConverted = participant.converted_at || intent?.status === "checkout_completed";
              return !isConverted && participant.decision_status === "approved" && ticket?.status === "checked_in";
            })
            .map<CourseParticipantEntry>((participant) => {
              const email = resolveCourseParticipantEmail(participant);
              return {
                id: participant.id,
                name: formatName(participant.first_name, participant.last_name, "Probeteilnahme"),
                email,
                statusLabel: "Freigegeben, noch nicht angemeldet",
                checkInLabel: `Eingecheckt am ${formatDateTime(
                  ticketByTrialReservationId.get(participant.id)?.checked_in_at ?? null
                )}`,
                meta: participant.registration_expires_at
                  ? `Freigegeben bis ${formatDateTime(participant.registration_expires_at)}`
                  : formatDateTimeRange(participant.trial_starts_at, participant.trial_ends_at),
                mailHref: buildMailtoHref({
                  to: email ? [email] : [],
                  subject: buildParticipantMailSubject(data.title),
                }),
              };
            }),
          attendedPending: (trialParticipants ?? [])
            .filter((participant) => {
              const ticket = ticketByTrialReservationId.get(participant.id);
              return participant.decision_status === "pending" && ticket?.status === "checked_in";
            })
            .map<CourseParticipantEntry>((participant) => {
              const email = resolveCourseParticipantEmail(participant);
              return {
                id: participant.id,
                name: formatName(participant.first_name, participant.last_name, "Probeteilnahme"),
                email,
                statusLabel: "Teilgenommen, Entscheidung offen",
                checkInLabel: `Eingecheckt am ${formatDateTime(
                  ticketByTrialReservationId.get(participant.id)?.checked_in_at ?? null
                )}`,
                meta: formatDateTimeRange(participant.trial_starts_at, participant.trial_ends_at),
                mailHref: buildMailtoHref({
                  to: email ? [email] : [],
                  subject: buildParticipantMailSubject(data.title),
                }),
              };
            }),
          notYetAttended: (trialParticipants ?? [])
            .filter((participant) => {
              const ticket = ticketByTrialReservationId.get(participant.id);
              const intent = intentByTrialReservationId.get(participant.id);
              const isConverted = participant.converted_at || intent?.status === "checkout_completed";
              return !isConverted && ticket?.status !== "checked_in";
            })
            .map<CourseParticipantEntry>((participant) => {
              const email = resolveCourseParticipantEmail(participant);
              return {
                id: participant.id,
                name: formatName(participant.first_name, participant.last_name, "Probeteilnahme"),
                email,
                statusLabel: "Noch nicht teilgenommen",
                checkInLabel:
                  ticketByTrialReservationId.get(participant.id)?.status === "issued"
                    ? "Ticket ausgestellt, noch nicht eingecheckt"
                    : "Noch nicht eingecheckt",
                meta: formatDateTimeRange(participant.trial_starts_at, participant.trial_ends_at),
                mailHref: buildMailtoHref({
                  to: email ? [email] : [],
                  subject: buildParticipantMailSubject(data.title),
                }),
              };
            }),
        }
      : null;

  const workshopTicketByBookingId = new Map(
    (workshopTickets ?? [])
      .filter((ticket) => ticket.booking_id)
      .map((ticket) => [ticket.booking_id as string, ticket])
  );
  const workshopParticipants =
    isOneTimeOfferKind(data.kind)
      ? (workshopBookings ?? []).map<WorkshopParticipantEntry>((booking) => {
          const ticket = workshopTicketByBookingId.get(booking.id);
          const email = booking.customer_email ?? ticket?.customer_email ?? null;
          return {
            id: booking.id,
            name: formatName(
              booking.customer_first_name,
              booking.customer_last_name,
              ticket?.customer_name || "Gast"
            ),
            email,
            statusLabel: booking.status === "paid" ? "Gebucht" : booking.status ?? "-",
            checkInLabel:
              ticket?.checked_in_at ?? booking.checked_in_at
                ? `Eingecheckt am ${formatDateTime(ticket?.checked_in_at ?? booking.checked_in_at)}`
                : "Noch nicht eingecheckt",
            meta: booking.created_at ? `Gebucht am ${formatDateTime(booking.created_at)}` : null,
            mailHref: buildMailtoHref({
              to: email ? [email] : [],
              subject: buildParticipantMailSubject(data.title),
            }),
          };
        })
      : [];

  const offerRecipientEmails =
    isOneTimeOfferKind(data.kind)
      ? normalizeEmailRecipients(workshopParticipants.map((entry) => entry.email))
      : normalizeEmailRecipients([
          ...(groupedCourseParticipants?.firmlyRegistered.map((entry) => entry.email) ?? []),
          ...(groupedCourseParticipants?.attendedApproved.map((entry) => entry.email) ?? []),
          ...(groupedCourseParticipants?.attendedPending.map((entry) => entry.email) ?? []),
          ...(groupedCourseParticipants?.notYetAttended.map((entry) => entry.email) ?? []),
        ]);
  const contactMailHref = buildMailtoHref({
    bcc: offerRecipientEmails,
    subject: buildOfferMailSubject(data.kind, data.title),
  });
  const showOfferMailWarning = shouldWarnAboutLargeMailingGroup(offerRecipientEmails.length, contactMailHref);
  const activeWorkshopBookingCount = (workshopBookings ?? []).filter(
    (booking) => !booking.archived_at && booking.status === "paid" && !booking.refunded_at && !booking.stripe_refund_id
  ).length;
  const freeWorkshopSeats =
    data.capacity === null ? null : Math.max(0, data.capacity - activeWorkshopBookingCount);
  const archiveEligibility = getOfferArchiveEligibility({
    kind: data.kind,
    status: data.status,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    archivedAt: data.archived_at ?? null,
    activeTrialCount: (trialParticipants ?? []).filter(
      (participant) => !participant.archived_at && !participant.cancelled_at && participant.decision_status !== "rejected"
    ).length,
    activeRegistrationCount: (registrationIntents ?? []).filter(
      (intent) =>
        !intent.archived_at &&
        intent.status === "checkout_completed" &&
        ["active", "pause_scheduled", "paused", "cancel_scheduled"].includes(intent.subscription_status ?? "active")
    ).length,
    activeBookingCount: activeWorkshopBookingCount,
    openPaymentCount: activeWorkshopBookingCount,
  });
  const calendarEnabled = hasOfferCalendarData({
    kind: data.kind,
    startsAt: data.starts_at,
    durationMinutes: data.duration_minutes,
    startTime: data.start_time,
    recurrenceType: data.recurrence_type ?? null,
    sessionCount: sessions?.length ?? 0,
  });
  const participantOverviewItems = await loadParticipantOverviewItems({
    teacherId: user.id,
    courseIds: [id],
  });

  return (
    <main className="mx-auto max-w-7xl p-6">
      <Link href={backHref} style={{ fontWeight: 700 }}>
        Zurück
      </Link>

      <div className={`mt-4 rounded-[28px] border p-5 ${detailStatusPresentation.panelClassName}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-black text-slate-950">{data.title}</h1>
            <p className="mt-3 text-sm text-muted-foreground">
        Dies ist deine interne Vorschau. Prüfe die Angaben, passe sie bei Bedarf an und aktiviere das Angebot erst danach.
      </p>
          </div>
          <span
            className={`inline-flex w-fit shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${detailStatusPresentation.badgeClassName}`}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      {savedParam === "1" ? (
        <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Angebot wurde aktualisiert.
        </p>
      ) : null}
      {savedParam === "play_started" ? (
        <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Angebot wurde aktiviert.
        </p>
      ) : null}
      {savedParam === "missing_policy" ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Aktivieren nicht möglich. Bitte hinterlege zuerst die Stornierungs- bzw. Kündigungsbedingungen.
        </p>
      ) : null}
      {savedParam === "pause_scheduled" ? (
        <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Pause für das laufende Angebot wurde geplant.
        </p>
      ) : null}
      {savedParam === "stop_scheduled" ? (
        <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Stopp für das laufende Angebot wurde geplant.
        </p>
      ) : null}
      {savedParam === "stop_partial" ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Stopp für das laufende Angebot wurde geplant. Mindestens ein bestehendes Abo konnte noch nicht automatisch synchronisiert werden.
        </p>
      ) : null}
      {savedParam === "workshop_cancelled" ? (
        <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Das einmalige Angebot wurde abgesagt, Rückerstattungen wurden angestoßen.
        </p>
      ) : null}
      {savedParam === "workshop_cancel_partial" ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Das einmalige Angebot wurde deaktiviert, aber mindestens eine Rückerstattung ist fehlgeschlagen.
        </p>
      ) : null}
      {savedParam === "play_invalid" || savedParam === "pause_invalid" || savedParam === "stop_invalid" ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Diese Statusänderung ist für dieses Angebot aktuell nicht zulässig.
        </p>
      ) : null}
      {savedParam === "workshop_cancel_invalid" ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Das einmalige Angebot konnte in diesem Zustand nicht abgesagt werden.
        </p>
      ) : null}
      {savedParam === "play_error" || savedParam === "pause_error" || savedParam === "stop_error" ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Die Statusänderung konnte nicht gespeichert werden.
        </p>
      ) : null}
      {savedParam === "workshop_cancel_error" ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Die Absage des einmaligen Angebots konnte nicht abgeschlossen werden.
        </p>
      ) : null}
      {savedParam === "copy_error" ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Das Angebot konnte nicht dupliziert werden.
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] xl:items-start">
        <div>
      <CourseDetailActions
        courseId={data.id}
        kind={data.kind}
        normalizedStatus={normalizedStatus}
        redirectTo={`/dashboard/courses/${data.id}`}
        nextPossiblePauseDate={nextPossiblePauseDate}
        pauseStartDate={data.pause_start_date}
        pauseEndDate={data.pause_end_date}
        stopDate={data.stop_date}
        publicUrl={publicUrl}
        embedUrl={embedUrl}
        publicOfferEnabled={Boolean(publicOffer)}
        visibility={normalizeOfferVisibility(data.visibility)}
        visibilityLabel={getOfferVisibilityLabel(data.visibility)}
        publishBlockedForMissingPolicy={publishBlockedForMissingPolicy}
        contactMailHref={contactMailHref}
        calendarHref={calendarEnabled ? buildOfferCalendarPath(data.id) : null}
        calendarDisabledReason={calendarEnabled ? null : "Kalenderdatei erst mit Termin verfügbar"}
        archiveAllowed={archiveEligibility.allowed}
        archiveReason={archiveEligibility.reason}
      />

      {normalizedStatus === "draft" && publishBlockedForMissingPolicy ? (
        <p className="mt-3 text-sm text-red-700">
          Dieses Angebot kann erst aktiviert werden, wenn die passende Stornierungs- bzw. Kündigungsregel gesetzt ist.
        </p>
      ) : null}
      {showOfferMailWarning ? (
        <p className="mt-3 text-sm text-amber-700">
          Bei sehr großen Gruppen kann dein E-Mail-Programm die Empfängerliste möglicherweise
          nicht vollständig übernehmen.
        </p>
      ) : null}

      <div className={`mt-4 rounded-2xl border p-4 text-sm text-slate-700 ${detailStatusPresentation.panelClassName}`}>
        <div>Art: {getOfferKindLabel(data.kind)}</div>
        <div>Status: {statusLabel}</div>
        <div>Veröffentlicht: {data.is_published ? "Ja" : "Nein"}</div>
        <div>Sichtbarkeit: {getOfferVisibilityLabel(data.visibility)}</div>
        {data.kind === "course" ? <div>Probestunden-Regel: {formatTrialMode(data.trial_mode)}</div> : null}
        {providerLabel ? <div>Anbieter: {providerLabel}</div> : null}
        {data.instructor_name ? <div>Leitung: {data.instructor_name}</div> : null}
        {data.kind === "course" ? (
          <>
            <div>Abrechnung: monatlich</div>
            <div>Modell: fortlaufend</div>
            <div>Kündigung: {COURSE_CANCELLATION_SUMMARY}</div>
          </>
        ) : null}
        {data.kind === "course" && pauseStartLabel ? <div>Pausenstart: {pauseStartLabel}</div> : null}
        {data.kind === "course" && pauseEndLabel ? <div>Pause endet: {pauseEndLabel}</div> : null}
        {data.kind === "course" && stopDateLabel ? <div>Stopdatum: {stopDateLabel}</div> : null}
        {data.kind !== "course" ? <div>Stornierungsbedingungen: {workshopPolicyLabel}</div> : null}
        {data.location ? <div>Ort: {data.location}</div> : null}
        {data.location_details ? <div>Raum / Zusatzinfo: {data.location_details}</div> : null}
        {data.kind === "course" && data.starts_at ? <div>Start des laufenden Angebots: {formatDateTime(data.starts_at)}</div> : null}
        {data.kind !== "course" && data.starts_at ? <div>Start: {formatDateTime(data.starts_at)}</div> : null}
        {data.capacity !== null ? <div>Max. Teilnehmende: {data.capacity}</div> : null}
        {isSinglePaymentOffer && freeWorkshopSeats !== null ? <div>Freie Plätze: {freeWorkshopSeats}</div> : null}
        {isSinglePaymentOffer ? <div>Reservierungen/Buchungen: {activeWorkshopBookingCount}</div> : null}
        {data.price_cents !== null ? <div>Preis: {formatOfferPrice(data.price_cents, data.currency)}</div> : null}
      </div>

      <FormattedOfferDescription text={data.description} className="mt-4 space-y-4 text-sm leading-7 text-slate-700" />

      {data.internal_note ? (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-lg font-semibold">Interne Notiz</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{data.internal_note}</p>
        </section>
      ) : null}

      {data.kind === "course" ? (
        <section className="mt-6 rounded-2xl border p-5">
          <h2 className="text-lg font-semibold">Status steuern</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Pausen beginnen am letzten Tag eines Monats und enden am ersten Tag eines Monats. Stopps enden am letzten Tag eines Monats.
          </p>
          {(pauseStartLabel || pauseEndLabel || stopDateLabel) && (
            <p className="mt-3 text-sm font-medium text-foreground">
              {pauseStartLabel ? `Geplanter Pausenstart: ${pauseStartLabel}. ` : ""}
              {pauseEndLabel ? `Geplantes Pausenende: ${pauseEndLabel}. ` : ""}
              {stopDateLabel ? `Geplantes Stopdatum: ${stopDateLabel}.` : ""}
            </p>
          )}
        </section>
      ) : null}

      {isSinglePaymentOffer ? (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>Termine</h2>
          <div style={{ marginTop: 8, borderTop: "1px solid #ddd", paddingTop: 12 }}>
            {sessions && sessions.length > 0 ? (
              sessions.map((session) => (
                <div key={session.id} style={{ marginBottom: 8 }}>
                  {session.starts_at ? (
                    <>
                      {formatDateTimeRange(session.starts_at, session.ends_at)}
                    </>
                  ) : (
                    "-"
                  )}
                </div>
              ))
            ) : (
              <div>Keine Termine vorhanden.</div>
            )}
          </div>
        </section>
      ) : null}
        </div>

        {isSinglePaymentOffer ? (
          <aside className="xl:sticky xl:top-6">
            <OneTimeOfferPreview
              title={data.title}
              description={data.description}
              location={data.location}
              locationDetails={data.location_details}
              providerType={profile?.provider_type ?? null}
              providerName={providerLabel}
              instructorName={data.instructor_name}
              providerLogoUrl={profile?.company_logo_url ?? null}
              providerPhotoUrl={profile?.photo_url ?? null}
              offerImageUrl={data.offer_image_url}
              priceCents={data.price_cents}
              currency={data.currency}
              sessions={(sessions ?? []).map((session) => ({
                id: session.id,
                starts_at: session.starts_at,
                ends_at: session.ends_at,
              }))}
              startsAt={data.starts_at}
              endsAt={data.ends_at}
              previewMode={normalizedStatus === "draft"}
            />
          </aside>
        ) : null}
      </div>

      {participantOverviewItems.length > 0 ? (
        <section className="mt-8 space-y-4">
          <div>
            <h2 className="text-2xl font-semibold">Teilnehmende</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Diese Liste nutzt dieselbe Übersicht wie die Hauptseite für Teilnehmende, gefiltert
              auf dieses Angebot.
            </p>
          </div>
          <ParticipantOverviewList items={participantOverviewItems} statusFilter="all" />
        </section>
      ) : null}
    </main>
  );
}

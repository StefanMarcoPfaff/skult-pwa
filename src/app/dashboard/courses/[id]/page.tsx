import Link from "next/link";
import { redirect } from "next/navigation";
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
import {
  buildMailtoHref,
  buildOfferMailSubject,
  buildParticipantMailSubject,
  normalizeEmailRecipients,
  shouldWarnAboutLargeMailingGroup,
} from "@/lib/mailto";
import { getProviderDisplayName, type ProviderType } from "@/lib/provider-profiles";
import { getPublicCourseById } from "@/lib/public-offers";
import { getSiteUrl } from "@/lib/site-url";
import { getOfferVisibilityLabel } from "@/lib/offer-ui";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CourseDetailActions } from "./CourseDetailActions";
import { getDisplayStatus } from "../display-status";

type Row = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  location_details: string | null;
  starts_at: string | null;
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
  trial_reservation_id: string;
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
  if (!dt) return "";
  const d = new Date(dt);
  const date = d.toLocaleDateString("de-DE");
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${date} | ${time}`;
}

function formatTrialMode(value: string | null): string {
  if (value === "manual") return "Nur an ausgewaehlten Terminen";
  return "An jedem Termin möglich";
}

function formatName(firstName: string | null, lastName: string | null, fallback: string): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || fallback;
}

function resolveCourseParticipantEmail(participant: TrialParticipantRow): string | null {
  return participant.email;
}

function formatDateTimeRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return null;

  const date = startDate.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const startTime = startDate.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (!end) return `${date} | ${startTime}`;

  const endDate = new Date(end);
  if (Number.isNaN(endDate.getTime())) return `${date} | ${startTime}`;

  const endTime = endDate.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${date} | ${startTime}-${endTime}`;
}

function renderParticipantGroup(
  title: string,
  description: string,
  entries: CourseParticipantEntry[]
) {
  return (
    <section className="rounded-2xl border p-5" key={title}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="rounded-full border px-3 py-1 text-sm font-semibold">{entries.length}</div>
      </div>

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Aktuell keine Eintraege.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-foreground">{entry.name}</p>
                  {entry.email ? <p>{entry.email}</p> : null}
                  <p>
                    Status: <span className="font-medium text-foreground">{entry.statusLabel}</span>
                  </p>
                  <p>
                    Check-in: <span className="font-medium text-foreground">{entry.checkInLabel}</span>
                  </p>
                  {entry.meta ? <p>{entry.meta}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {entry.mailHref ? (
                    <a
                      href={entry.mailHref}
                      className="inline-flex rounded-xl border px-3 py-2 text-xs font-semibold"
                    >
                      E-Mail
                    </a>
                  ) : (
                    <span className="inline-flex cursor-not-allowed rounded-xl border px-3 py-2 text-xs font-semibold text-muted-foreground opacity-60">
                      E-Mail
                    </span>
                  )}
                  <Link
                    href={`/dashboard/participants/${entry.id}?source=trial`}
                    className="inline-flex rounded-xl border px-3 py-2 text-xs font-semibold"
                  >
                    Details
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function renderWorkshopParticipantGroup(
  title: string,
  description: string,
  entries: WorkshopParticipantEntry[]
) {
  return (
    <section className="rounded-2xl border p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="rounded-full border px-3 py-1 text-sm font-semibold">{entries.length}</div>
      </div>

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Aktuell keine Eintraege.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-foreground">{entry.name}</p>
                  {entry.email ? <p>{entry.email}</p> : null}
                  <p>
                    Status: <span className="font-medium text-foreground">{entry.statusLabel}</span>
                  </p>
                  <p>
                    Check-in: <span className="font-medium text-foreground">{entry.checkInLabel}</span>
                  </p>
                  {entry.meta ? <p>{entry.meta}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {entry.mailHref ? (
                    <a
                      href={entry.mailHref}
                      className="inline-flex rounded-xl border px-3 py-2 text-xs font-semibold"
                    >
                      E-Mail
                    </a>
                  ) : (
                    <span className="inline-flex cursor-not-allowed rounded-xl border px-3 py-2 text-xs font-semibold text-muted-foreground opacity-60">
                      E-Mail
                    </span>
                  )}
                  <Link
                    href={`/dashboard/participants/${entry.id}?source=workshop`}
                    className="inline-flex rounded-xl border px-3 py-2 text-xs font-semibold"
                  >
                    Details
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
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

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdmin();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let courseResponse = await supabase
    .from("courses")
    .select(
      "id,title,description,location,location_details,starts_at,capacity,kind,status,is_published,trial_mode,instructor_name,cancellation_model,workshop_storno_policy,teacher_id,ends_at,pause_start_date,pause_end_date,stop_date"
      + ",archived_at,visibility"
    )
    .eq("id", id)
    .eq("teacher_id", user.id)
    .single<Row>();

  if (courseResponse.error) {
    courseResponse = await supabase
      .from("courses")
      .select(
        "id,title,description,location,location_details,starts_at,capacity,kind,is_published,trial_mode,instructor_name,cancellation_model,workshop_storno_policy,teacher_id,ends_at,archived_at,visibility"
      )
      .eq("id", id)
      .eq("teacher_id", user.id)
      .single<Row>();
  }

  const { data, error } = courseResponse;

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name,last_name,provider_type,organization_name")
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
    data?.kind === "workshop" || data?.kind === "exclusive_offer"
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
    (data?.kind === "workshop" || data?.kind === "exclusive_offer") && workshopBookingIds.length > 0
      ? await admin
          .from("tickets")
          .select("booking_id,customer_name,customer_email,status,checked_in_at")
          .in("booking_id", workshopBookingIds)
          .returns<WorkshopTicketRow[]>()
      : { data: [] as WorkshopTicketRow[] };

  if (error || !data) {
    return (
      <main style={{ padding: 24 }}>
        <Link href="/dashboard/courses" style={{ fontWeight: 700 }}>
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
    profile?.provider_type === "studio_provider"
      ? getProviderDisplayName("studio_provider", {
          first_name: profile.first_name,
          last_name: profile.last_name,
          organization_name: profile.organization_name,
        })
      : null;
  const displayState = getDisplayStatus({
    kind: data.kind,
    status: data.status,
    isPublished: data.is_published ?? null,
    endsAt: data.ends_at ?? null,
    startsAt: data.starts_at,
  });
  const normalizedStatus = displayState.normalizedStatus;
  const statusLabel = displayState.currentStatusLabel;
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
    data.kind === "workshop" || data.kind === "exclusive_offer"
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
    data.kind === "workshop" || data.kind === "exclusive_offer"
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
    activeBookingCount: (workshopBookings ?? []).filter(
      (booking) => !booking.archived_at && booking.status === "paid" && !booking.refunded_at && !booking.stripe_refund_id
    ).length,
    openPaymentCount: (workshopBookings ?? []).filter(
      (booking) => !booking.archived_at && booking.status === "paid" && !booking.refunded_at && !booking.stripe_refund_id
    ).length,
  });

  return (
    <main style={{ padding: 24, maxWidth: 820 }}>
      <Link href="/dashboard/courses" style={{ fontWeight: 700 }}>
        Zurück
      </Link>

      <h1 style={{ marginTop: 16, fontSize: 32, fontWeight: 900 }}>{data.title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Dies ist deine interne Vorschau. Prüfe die Angaben, passe sie bei Bedarf an und aktiviere das Angebot erst danach.
      </p>

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
          Die Statusaenderung konnte nicht gespeichert werden.
        </p>
      ) : null}
      {savedParam === "workshop_cancel_error" ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Die Absage des einmaligen Angebots konnte nicht abgeschlossen werden.
        </p>
      ) : null}

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
        visibilityLabel={getOfferVisibilityLabel(data.visibility)}
        publishBlockedForMissingPolicy={publishBlockedForMissingPolicy}
        contactMailHref={contactMailHref}
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

      <div style={{ marginTop: 10, opacity: 0.8 }}>
        <div>Art: {data.kind ?? "-"}</div>
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
        {data.capacity !== null ? <div>Plaetze: {data.capacity}</div> : null}
      </div>

      {data.description ? <p style={{ marginTop: 16, lineHeight: 1.6 }}>{data.description}</p> : null}

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

      {data.kind === "workshop" || data.kind === "exclusive_offer" ? (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>{data.kind === "exclusive_offer" ? "Termin / Zeitraum" : "Termine"}</h2>
          <div style={{ marginTop: 8, borderTop: "1px solid #ddd", paddingTop: 12 }}>
            {sessions && sessions.length > 0 ? (
              sessions.map((session) => (
                <div key={session.id} style={{ marginBottom: 8 }}>
                  {session.starts_at ? (
                    <>
                      {new Date(session.starts_at).toLocaleDateString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}{" "}
                      |{" "}
                      {new Date(session.starts_at).toLocaleTimeString("de-DE", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      -
                      {session.ends_at
                        ? new Date(session.ends_at).toLocaleTimeString("de-DE", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "-"}
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

      {data.kind === "course" && groupedCourseParticipants ? (
        <section className="mt-8 space-y-4">
          <div>
            <h2 className="text-2xl font-semibold">Teilnehmerübersicht</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Hier siehst du den aktuellen Stand der verbindlichen Anmeldungen und Probeteilnahmen für dieses laufende Angebot.
            </p>
          </div>

          {renderParticipantGroup(
            "Fest angemeldete Teilnehmer",
            "Diese Personen haben die verbindliche Anmeldung zum laufenden Angebot erfolgreich abgeschlossen.",
            groupedCourseParticipants.firmlyRegistered
          )}

          <section className="rounded-2xl border p-5">
            <div>
              <h3 className="text-lg font-semibold">Probeteilnahmen nach Status</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Probeteilnahmen werden nach ihrem aktuellen Fortschritt im Aufnahmeprozess gruppiert.
              </p>
            </div>
            <div className="mt-5 space-y-4">
              {renderParticipantGroup(
                "Noch nicht teilgenommen",
                "Diese Personen sind eingeplant, aber noch nicht eingecheckt.",
                groupedCourseParticipants.notYetAttended
              )}
              {renderParticipantGroup(
                "Teilgenommen, Entscheidung offen",
                "Diese Personen haben bereits teilgenommen und warten noch auf deine Entscheidung.",
                groupedCourseParticipants.attendedPending
              )}
              {renderParticipantGroup(
                "Freigegeben, noch nicht angemeldet",
                "Diese Personen wurden freigegeben, haben die verbindliche Anmeldung aber noch nicht abgeschlossen.",
                groupedCourseParticipants.attendedApproved
              )}
            </div>
          </section>
        </section>
      ) : null}

      {data.kind === "workshop" || data.kind === "exclusive_offer" ? (
        <section className="mt-8 space-y-4">
          <div>
            <h2 className="text-2xl font-semibold">
              {data.kind === "exclusive_offer" ? "Teilnehmende im Exklusiv-Angebot" : "Teilnehmende im einmaligen Angebot"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Alle gebuchten Teilnehmenden dieses Angebots mit aktuellem Status und Check-in-Stand.
            </p>
          </div>
          {renderWorkshopParticipantGroup(
            "Alle gebuchten Teilnehmer",
            "Diese Liste zeigt alle bezahlten Buchungen dieses Angebots.",
            workshopParticipants
          )}
        </section>
      ) : null}
    </main>
  );
}

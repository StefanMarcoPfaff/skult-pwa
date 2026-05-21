import Link from "next/link";
import { redirect } from "next/navigation";
import { MailActionLink } from "@/components/dashboard/MailActionLink";
import { buildBookingCalendarPath } from "@/lib/calendar";
import { hasOfferCalendarData } from "@/lib/calendar-resolver";
import { getCourseParticipantTicketBindingId } from "@/lib/course-participant-bindings";
import { formatCourseLifecycleDate, getNextMonthEndDate } from "@/lib/course-lifecycle-shared";
import { buildMailtoHref, buildParticipantMailSubject } from "@/lib/mailto";
import { getProviderDisplayName } from "@/lib/provider-profiles";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  RegisteredParticipantLifecycleButtons,
  TrialParticipantLifecycleButtons,
  WorkshopParticipantLifecycleButtons,
} from "../ParticipantLifecycleButtons";
import {
  getParticipantLifecycleDisplay,
  getWorkshopParticipantLifecycleDisplay,
} from "../participant-lifecycle";

type SearchParams = {
  source?: string;
  saved?: string;
};

type TrialReservationRow = {
  id: string;
  course_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone?: string | null;
  status: string | null;
  decision_status: string | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  registration_expires_at: string | null;
  converted_at: string | null;
  cancelled_at?: string | null;
};

type CourseRow = {
  id: string;
  title: string | null;
  teacher_id: string | null;
  kind: string | null;
  instructor_name: string | null;
  price_cents: number | null;
  currency: string | null;
  location: string | null;
  location_details: string | null;
  starts_at: string | null;
  start_time: string | null;
  duration_minutes: number | null;
  recurrence_type: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: "independent_teacher" | "studio_provider" | null;
  organization_name: string | null;
};

type RegistrationIntentRow = {
  id: string;
  course_id?: string;
  trial_reservation_id?: string | null;
  status: string | null;
  is_simulation?: boolean | null;
  stripe_subscription_id: string | null;
  subscription_contract_id?: string | null;
  subscription_status: string | null;
  subscription_pause_start_date: string | null;
  subscription_pause_end_date: string | null;
  subscription_cancel_scheduled_at: string | null;
  subscription_stop_date: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  street_and_number: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  completed_at: string | null;
};

type SubscriptionContractRow = {
  id: string;
  status: string | null;
};

type TrialTicketRow = {
  id?: string;
  status: string | null;
  checked_in_at: string | null;
  customer_name: string;
  customer_email: string;
  qr_token?: string | null;
};

type WorkshopBookingRow = {
  id: string;
  course_id: string | null;
  status: string | null;
  checked_in_at: string | null;
  created_at: string | null;
  payment_provider: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
};

type WorkshopTicketRow = {
  status: string | null;
  checked_in_at: string | null;
  customer_name: string;
  customer_email: string;
};

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatPrice(priceCents: number | null, currency: string | null): string | null {
  if (priceCents === null || !Number.isFinite(priceCents)) return null;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
  }).format(priceCents / 100);
}

function participantName(firstName: string | null, lastName: string | null, fallback: string) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || fallback;
}

function formatAddress(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(", ") || "-";
}

function formatParticipantSubscriptionStatus(status: string | null): string {
  if (status === "pause_scheduled") return "Pause geplant";
  if (status === "paused") return "Pausiert";
  if (status === "cancel_scheduled") return "Beendet zum Monatsende";
  if (status === "cancelled") return "Beendet";
  if (status === "active") return "Aktiv";
  if (status === "inactive") return "Inaktiv";
  return status ?? "-";
}

async function requireTeacherId() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  return user.id;
}

function FlashMessages(props: { saved?: string }) {
  return (
    <>
      {props.saved === "approved" ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Die Person wurde für die verbindliche Anmeldung freigegeben.
        </p>
      ) : null}
      {props.saved === "rejected" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Der Teilnehmende wurde freundlich abgelehnt.
        </p>
      ) : null}
      {props.saved === "trial_cancelled" ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Die Probeteilnahme wurde storniert.
        </p>
      ) : null}
      {props.saved === "participant_pause_scheduled" ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Die Teilnahme wurde pausiert bzw. zur Pause vorgemerkt.
        </p>
      ) : null}
      {props.saved === "participant_cancel_scheduled" ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Die Kündigung wurde gespeichert.
        </p>
      ) : null}
      {props.saved === "attendance_required" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Eine Freigabe oder Ablehnung ist erst nach erfolgreichem Check-in der Probeteilnahme möglich.
        </p>
      ) : null}
      {props.saved?.includes("invalid") || props.saved?.includes("error") ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Die Aktion konnte nicht abgeschlossen werden.
        </p>
      ) : null}
    </>
  );
}

export default async function DashboardParticipantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const { source, saved } = await searchParams;
  const teacherId = await requireTeacherId();
  const admin = createSupabaseAdmin();

  if (source === "workshop") {
    const { data: booking } = await admin
      .from("bookings")
      .select(
        "id,course_id,status,checked_in_at,created_at,payment_provider,customer_first_name,customer_last_name,customer_email,customer_phone"
      )
      .eq("id", id)
      .maybeSingle<WorkshopBookingRow>();

    if (!booking?.course_id) {
      redirect("/dashboard/participants");
    }

    const [{ data: course }, { data: ticket }, { data: profile }] = await Promise.all([
      admin
        .from("courses")
        .select("id,title,teacher_id,kind,instructor_name,price_cents,currency,location,location_details,starts_at,start_time,duration_minutes,recurrence_type")
        .eq("id", booking.course_id)
        .maybeSingle<CourseRow>(),
      admin
        .from("tickets")
        .select("status,checked_in_at,customer_name,customer_email")
        .eq("booking_id", booking.id)
        .maybeSingle<WorkshopTicketRow>(),
      admin
        .from("profiles")
        .select("first_name,last_name,provider_type,organization_name")
        .eq("id", teacherId)
        .maybeSingle<ProfileRow>(),
    ]);

    if (!course || course.teacher_id !== teacherId) {
      redirect("/dashboard/participants");
    }

    const providerName =
      profile?.provider_type ? getProviderDisplayName(profile.provider_type, profile) : null;
    const workshopMailHref = buildMailtoHref({
      to: [booking.customer_email ?? ticket?.customer_email ?? null],
      subject: buildParticipantMailSubject(course.title),
    });
    const lifecycle = getWorkshopParticipantLifecycleDisplay(booking.status === "paid");
    const workshopCalendarEnabled = hasOfferCalendarData({
      kind: course.kind,
      startsAt: course.starts_at,
    });

    return (
      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <Link href={`/dashboard/courses/${course.id}`} className="inline-flex text-sm font-semibold">
          Zurück zum Angebot
        </Link>

        <FlashMessages saved={saved} />

        <section className="rounded-2xl border p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">
                {participantName(
                  booking.customer_first_name,
                  booking.customer_last_name,
                  ticket?.customer_name ?? "Teilnehmer*in"
                )}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Teilnehmerdetail für {course.title ?? "einmaliges Angebot"}.
              </p>
              <div className="mt-4">
                <WorkshopParticipantLifecycleButtons
                  playClassName={lifecycle.playClassName}
                  pauseClassName={lifecycle.pauseClassName}
                  stopClassName={lifecycle.stopClassName}
                />
              </div>
            </div>
            <MailActionLink
              href={workshopMailHref}
              label="E-Mail"
              title="Teilnehmer*in per E-Mail kontaktieren"
              disabledHint="Keine E-Mail-Adresse für diese Person vorhanden"
            />
            {workshopCalendarEnabled ? (
              <Link href={buildBookingCalendarPath(booking.id, "workshop")} className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
                Kalender
              </Link>
            ) : (
              <span className="inline-flex cursor-not-allowed rounded-xl border px-4 py-2 text-sm font-semibold text-muted-foreground opacity-60">
                Kalender
              </span>
            )}
          </div>

          <div className="mt-4 grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
            <p>Name: <span className="font-medium text-foreground">{participantName(booking.customer_first_name, booking.customer_last_name, ticket?.customer_name ?? "Teilnehmer*in")}</span></p>
            <p>E-Mail: <span className="font-medium text-foreground">{booking.customer_email ?? ticket?.customer_email ?? "-"}</span></p>
            <p>Telefon: <span className="font-medium text-foreground">{booking.customer_phone ?? "-"}</span></p>
            <p>Status: <span className="font-medium text-foreground">{ticket?.status ?? booking.status ?? "-"}</span></p>
            <p>Gebucht am: <span className="font-medium text-foreground">{formatDateTime(booking.created_at)}</span></p>
            <p>Check-in: <span className="font-medium text-foreground">{formatDateTime(ticket?.checked_in_at ?? booking.checked_in_at)}</span></p>
            {booking.payment_provider ? <p>Zahlungsanbieter: <span className="font-medium text-foreground">{booking.payment_provider}</span></p> : null}
          </div>
        </section>

        <section className="rounded-2xl border p-6">
          <h2 className="text-xl font-semibold">Angebotskontext</h2>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p>Titel: <span className="font-medium text-foreground">{course.title ?? "einmaliges Angebot"}</span></p>
            {providerName ? <p>Anbieter: <span className="font-medium text-foreground">{providerName}</span></p> : null}
            {course.instructor_name ? <p>Leitung: <span className="font-medium text-foreground">{course.instructor_name}</span></p> : null}
            {formatPrice(course.price_cents, course.currency) ? (
              <p>Preis: <span className="font-medium text-foreground">{formatPrice(course.price_cents, course.currency)}</span></p>
            ) : null}
            {course.location ? <p>Ort: <span className="font-medium text-foreground">{course.location}</span></p> : null}
            {course.location_details ? <p>Raum / Zusatzinfo: <span className="font-medium text-foreground">{course.location_details}</span></p> : null}
          </div>
        </section>
      </main>
    );
  }

  if (source === "registered") {
    const { data: intent } = await admin
      .from("course_registration_intents")
      .select(
        "id,course_id,trial_reservation_id,status,is_simulation,stripe_subscription_id,subscription_contract_id,subscription_status,subscription_pause_start_date,subscription_pause_end_date,subscription_cancel_scheduled_at,subscription_stop_date,first_name,last_name,email,phone,street_and_number,postal_code,city,country,notes,completed_at"
      )
      .eq("id", id)
      .maybeSingle<RegistrationIntentRow>();

    if (!intent?.course_id) {
      redirect("/dashboard/participants");
    }

    const [{ data: course }, { data: reservation }, { data: profile }, { data: contract }] = await Promise.all([
      admin
        .from("courses")
        .select("id,title,teacher_id,kind,instructor_name,price_cents,currency,location,location_details,starts_at,start_time,duration_minutes,recurrence_type")
        .eq("id", intent.course_id)
        .maybeSingle<CourseRow>(),
      intent.trial_reservation_id
        ? admin
            .from("trial_reservations")
            .select(
              "id,course_id,first_name,last_name,email,phone,status,decision_status,trial_starts_at,trial_ends_at,registration_expires_at,converted_at,cancelled_at"
            )
            .eq("id", intent.trial_reservation_id)
            .maybeSingle<TrialReservationRow>()
        : Promise.resolve({ data: null as TrialReservationRow | null }),
      admin
        .from("profiles")
        .select("first_name,last_name,provider_type,organization_name")
        .eq("id", teacherId)
        .maybeSingle<ProfileRow>(),
      intent.subscription_contract_id
        ? admin
            .from("subscription_contracts")
            .select("id,status")
            .eq("id", intent.subscription_contract_id)
            .maybeSingle<SubscriptionContractRow>()
        : Promise.resolve({ data: null as SubscriptionContractRow | null }),
    ]);

    if (!course || course.teacher_id !== teacherId) {
      redirect("/dashboard/participants");
    }

    const participantBindingId = getCourseParticipantTicketBindingId(intent, contract?.status ?? null);
    const { data: ticket } = participantBindingId
      ? await admin
          .from("tickets")
          .select("id,status,checked_in_at,customer_name,customer_email,qr_token")
          .eq("subscription_id", participantBindingId)
          .maybeSingle<TrialTicketRow>()
      : { data: null as TrialTicketRow | null };

    const providerName =
      profile?.provider_type ? getProviderDisplayName(profile.provider_type, profile) : null;
    const pauseStartLabel = formatCourseLifecycleDate(intent.subscription_pause_start_date ?? null);
    const pauseEndLabel = formatCourseLifecycleDate(intent.subscription_pause_end_date ?? null);
    const stopDateLabel = formatCourseLifecycleDate(intent.subscription_stop_date ?? null);
    const participantMailHref = buildMailtoHref({
      to: [intent.email ?? reservation?.email ?? null],
      subject: buildParticipantMailSubject(course.title),
    });
    const registeredCalendarEnabled =
      Boolean(intent.trial_reservation_id) &&
      hasOfferCalendarData({
        kind: course.kind,
        startsAt: course.starts_at,
        durationMinutes: course.duration_minutes,
        startTime: course.start_time,
        recurrenceType: course.recurrence_type,
        sessionCount: 1,
      });
    const lifecycle = getParticipantLifecycleDisplay({
      reservationCancelledAt: reservation?.cancelled_at ?? null,
      reservationDecisionStatus: reservation?.decision_status ?? null,
      hasCompletedRegistration: Boolean(participantBindingId),
      subscriptionStatus: intent.subscription_status ?? null,
    });
    const defaultMonthEnd = getNextMonthEndDate();
    const hasInteractiveLifecycle = Boolean(intent.trial_reservation_id) && !intent.is_simulation;

    return (
      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <Link href={`/dashboard/courses/${course.id}`} className="inline-flex text-sm font-semibold">
          ZurÃ¼ck zum Angebot
        </Link>

        <FlashMessages saved={saved} />

        <section className="rounded-2xl border p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">
                {participantName(intent.first_name, intent.last_name, ticket?.customer_name ?? "Teilnehmer*in")}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Teilnehmerdetail fÃ¼r {course.title ?? "laufendes Angebot"}.
              </p>
              <div className="mt-4">
                <RegisteredParticipantLifecycleButtons
                  reservationId={intent.trial_reservation_id ?? ""}
                  redirectTo={`/dashboard/participants/${intent.id}?source=registered`}
                  defaultActiveUntilDate={defaultMonthEnd}
                  defaultPauseEndDate={intent?.subscription_pause_end_date ?? null}
                  defaultStopDate={defaultMonthEnd}
                  playLabel={intent.is_simulation && !intent.trial_reservation_id ? "Simulation aktiv" : undefined}
                  playClassName={lifecycle.playClassName}
                  pauseClassName={lifecycle.pauseClassName}
                  stopClassName={lifecycle.stopClassName}
                  pauseLabel={intent.is_simulation && !intent.trial_reservation_id ? "Pause spaeter" : undefined}
                  stopLabel={intent.is_simulation && !intent.trial_reservation_id ? "Kuendigung spaeter" : undefined}
                  pauseDisabled={lifecycle.pauseDisabled || !hasInteractiveLifecycle}
                  stopDisabled={lifecycle.stopDisabled || !hasInteractiveLifecycle}
                />
              </div>
            </div>
            <MailActionLink
              href={participantMailHref}
              label="E-Mail"
              title="Teilnehmer*in per E-Mail kontaktieren"
              disabledHint="Keine E-Mail-Adresse fÃ¼r diese Person vorhanden"
            />
            {registeredCalendarEnabled ? (
              <Link href={buildBookingCalendarPath(intent.trial_reservation_id as string, "registered")} className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
                Kalender
              </Link>
            ) : (
              <span className="inline-flex cursor-not-allowed rounded-xl border px-4 py-2 text-sm font-semibold text-muted-foreground opacity-60">
                Kalender
              </span>
            )}
          </div>

          <div className="mt-4 grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
            <p>Name: <span className="font-medium text-foreground">{participantName(intent.first_name, intent.last_name, ticket?.customer_name ?? "Teilnehmer*in")}</span></p>
            <p>E-Mail: <span className="font-medium text-foreground">{intent.email ?? reservation?.email ?? ticket?.customer_email ?? "-"}</span></p>
            <p>Telefon: <span className="font-medium text-foreground">{intent.phone ?? reservation?.phone ?? "-"}</span></p>
            <p>Teilnahmestatus: <span className="font-medium text-foreground">{formatParticipantSubscriptionStatus(intent.subscription_status)}</span></p>
            <p>Check-in: <span className="font-medium text-foreground">{formatDateTime(ticket?.checked_in_at ?? null)}</span></p>
            <p>Ticketstatus: <span className="font-medium text-foreground">{ticket?.status ?? "-"}</span></p>
            <p className="sm:col-span-2">Adresse: <span className="font-medium text-foreground">{formatAddress([intent.street_and_number, intent.postal_code, intent.city, intent.country])}</span></p>
            {intent.completed_at ? (
              <p>Checkout abgeschlossen: <span className="font-medium text-foreground">{formatDateTime(intent.completed_at)}</span></p>
            ) : intent.is_simulation ? (
              <p>Aktivierung: <span className="font-medium text-foreground">Interne Kurssimulation ohne echten Checkout</span></p>
            ) : null}
            {intent.subscription_contract_id ? (
              <p>Subscription Contract: <span className="font-medium text-foreground">{intent.subscription_contract_id}</span></p>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border p-6">
          <h2 className="text-xl font-semibold">Angebotskontext</h2>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p>Titel: <span className="font-medium text-foreground">{course.title ?? "laufendes Angebot"}</span></p>
            {providerName ? <p>Anbieter: <span className="font-medium text-foreground">{providerName}</span></p> : null}
            {course.instructor_name ? <p>Leitung: <span className="font-medium text-foreground">{course.instructor_name}</span></p> : null}
            {formatPrice(course.price_cents, course.currency) ? (
              <p>Preis: <span className="font-medium text-foreground">{formatPrice(course.price_cents, course.currency)}</span></p>
            ) : null}
            {course.location ? <p>Ort: <span className="font-medium text-foreground">{course.location}</span></p> : null}
            {course.location_details ? <p>Raum / Zusatzinfo: <span className="font-medium text-foreground">{course.location_details}</span></p> : null}
            {reservation?.trial_starts_at ? (
              <p>Probeteilnahme: <span className="font-medium text-foreground">{`${formatDateTime(reservation.trial_starts_at)} - ${formatDateTime(reservation.trial_ends_at)}`}</span></p>
            ) : intent.is_simulation ? (
              <p>Herkunft: <span className="font-medium text-foreground">Direkte Kurs-Testanmeldung ohne Probeteilnahme</span></p>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border p-6">
          <h2 className="text-xl font-semibold">Teilnahme steuern</h2>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p>
              Teilnahmestatus:{" "}
              <span className="font-medium text-foreground">
                {formatParticipantSubscriptionStatus(intent?.subscription_status ?? null)}
              </span>
            </p>
            {pauseStartLabel ? <p>Pause ab: <span className="font-medium text-foreground">{pauseStartLabel}</span></p> : null}
            {pauseEndLabel ? <p>Wieder aktiv ab: <span className="font-medium text-foreground">{pauseEndLabel}</span></p> : null}
            {stopDateLabel ? <p>Teilnahme endet zum: <span className="font-medium text-foreground">{stopDateLabel}</span></p> : null}
            {intent?.subscription_cancel_scheduled_at ? (
              <p>
                KÃ¼ndigung vorgemerkt am:{" "}
                <span className="font-medium text-foreground">{formatDateTime(intent.subscription_cancel_scheduled_at)}</span>
              </p>
            ) : null}
            {ticket?.qr_token ? (
              <p>
                Ticket:{" "}
                <Link href={`/ticket/qr/${ticket.qr_token}`} className="font-medium underline">
                  QR-Ticket anzeigen
                </Link>
              </p>
            ) : null}
          </div>
          {!hasInteractiveLifecycle ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Direkte Kurssimulationen ohne Probeteilnahme sind jetzt fuer Ticket, Teilnehmeransicht und Check-in sichtbar.
              Die fachliche Pause-/Kuendigungssteuerung folgt in PR 4/5.
            </p>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">
              ZukÃ¼nftige Teilnehmer-Pausen werden in RESER termingenau vorgemerkt. Eine automatische Stripe-Pausierung fÃ¼r einen spÃ¤teren Monat ist mit der aktuellen Architektur noch nicht robust geplant.
            </p>
          )}
        </section>

        <section className="rounded-2xl border p-6">
          <h2 className="text-xl font-semibold">Gespeicherte Anmeldedaten</h2>
          <div className="mt-4 grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
            <p>Vorname: <span className="font-medium text-foreground">{intent.first_name ?? "-"}</span></p>
            <p>Nachname: <span className="font-medium text-foreground">{intent.last_name ?? "-"}</span></p>
            <p>E-Mail: <span className="font-medium text-foreground">{intent.email ?? "-"}</span></p>
            <p>Telefon: <span className="font-medium text-foreground">{intent.phone ?? "-"}</span></p>
            <p className="sm:col-span-2">Adresse: <span className="font-medium text-foreground">{formatAddress([intent.street_and_number, intent.postal_code, intent.city, intent.country])}</span></p>
            <p className="sm:col-span-2">Notizen: <span className="font-medium text-foreground">{intent.notes ?? "-"}</span></p>
            <p>Status: <span className="font-medium text-foreground">{intent.status ?? "-"}</span></p>
            <p>Stripe Subscription: <span className="font-medium text-foreground">{intent.stripe_subscription_id ?? "-"}</span></p>
            <p>Subscription Contract: <span className="font-medium text-foreground">{intent.subscription_contract_id ?? "-"}</span></p>
            <p>Teilnahmestatus: <span className="font-medium text-foreground">{formatParticipantSubscriptionStatus(intent.subscription_status)}</span></p>
            <p>Checkout abgeschlossen: <span className="font-medium text-foreground">{formatDateTime(intent.completed_at)}</span></p>
          </div>
        </section>
      </main>
    );
  }

  const { data: reservation } = await admin
    .from("trial_reservations")
    .select(
      "id,course_id,first_name,last_name,email,status,decision_status,trial_starts_at,trial_ends_at,registration_expires_at,converted_at,cancelled_at"
    )
    .eq("id", id)
    .maybeSingle<TrialReservationRow>();

  if (!reservation) {
    redirect("/dashboard/participants");
  }

  const [{ data: course }, { data: intent }, { data: ticket }, { data: profile }] = await Promise.all([
    admin
      .from("courses")
      .select("id,title,teacher_id,kind,instructor_name,price_cents,currency,location,location_details,starts_at,start_time,duration_minutes,recurrence_type")
      .eq("id", reservation.course_id)
      .maybeSingle<CourseRow>(),
    admin
      .from("course_registration_intents")
      .select(
        "id,course_id,trial_reservation_id,status,is_simulation,stripe_subscription_id,subscription_contract_id,subscription_status,subscription_pause_start_date,subscription_pause_end_date,subscription_cancel_scheduled_at,subscription_stop_date,first_name,last_name,email,phone,street_and_number,postal_code,city,country,notes,completed_at"
      )
      .eq("trial_reservation_id", reservation.id)
      .maybeSingle<RegistrationIntentRow>(),
    admin
      .from("tickets")
      .select("status,checked_in_at,customer_name,customer_email")
      .eq("trial_reservation_id", reservation.id)
      .maybeSingle<TrialTicketRow>(),
    admin
      .from("profiles")
      .select("first_name,last_name,provider_type,organization_name")
      .eq("id", teacherId)
      .maybeSingle<ProfileRow>(),
  ]);

  if (!course || course.teacher_id !== teacherId) {
    redirect("/dashboard/participants");
  }

  const providerName =
    profile?.provider_type ? getProviderDisplayName(profile.provider_type, profile) : null;
  const { data: subscriptionContract } =
    intent?.subscription_contract_id
      ? await admin
          .from("subscription_contracts")
          .select("id,status")
          .eq("id", intent.subscription_contract_id)
          .maybeSingle<SubscriptionContractRow>()
      : { data: null as SubscriptionContractRow | null };
  const registeredBindingId = intent
    ? getCourseParticipantTicketBindingId(intent, subscriptionContract?.status ?? null)
    : null;
  const hasRegisteredParticipation = Boolean(registeredBindingId);
  const pauseStartLabel = formatCourseLifecycleDate(intent?.subscription_pause_start_date ?? null);
  const pauseEndLabel = formatCourseLifecycleDate(intent?.subscription_pause_end_date ?? null);
  const stopDateLabel = formatCourseLifecycleDate(intent?.subscription_stop_date ?? null);
  const participantMailHref = buildMailtoHref({
    to: [intent?.email ?? reservation.email ?? null],
    subject: buildParticipantMailSubject(course.title),
  });
  const trialCalendarEnabled = Boolean(reservation.trial_starts_at);
  const registeredCalendarEnabled = hasOfferCalendarData({
    kind: course.kind,
    startsAt: course.starts_at,
    durationMinutes: course.duration_minutes,
    startTime: course.start_time,
    recurrenceType: course.recurrence_type,
    sessionCount: 1,
  });
  const lifecycle = getParticipantLifecycleDisplay({
    reservationCancelledAt: reservation.cancelled_at ?? null,
    reservationDecisionStatus: reservation.decision_status,
    trialTicketStatus: ticket?.status ?? null,
    hasCompletedRegistration: hasRegisteredParticipation,
    subscriptionStatus: intent?.subscription_status ?? null,
  });
  const defaultMonthEnd = getNextMonthEndDate();

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <Link href={`/dashboard/courses/${course.id}`} className="inline-flex text-sm font-semibold">
        Zurück zum Angebot
      </Link>

      <FlashMessages saved={saved} />

      <section className="rounded-2xl border p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">
              {participantName(intent?.first_name ?? reservation.first_name, intent?.last_name ?? reservation.last_name, "Teilnehmer*in")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">Teilnehmerdetail für {course.title ?? "laufendes Angebot"}.</p>
            <div className="mt-4">
              {hasRegisteredParticipation ? (
                <RegisteredParticipantLifecycleButtons
                  reservationId={reservation.id}
                  redirectTo={`/dashboard/participants/${reservation.id}?source=trial`}
                  defaultActiveUntilDate={defaultMonthEnd}
                  defaultPauseEndDate={intent?.subscription_pause_end_date ?? null}
                  defaultStopDate={defaultMonthEnd}
                  playClassName={lifecycle.playClassName}
                  pauseClassName={lifecycle.pauseClassName}
                  stopClassName={lifecycle.stopClassName}
                  pauseDisabled={lifecycle.pauseDisabled}
                  stopDisabled={lifecycle.stopDisabled}
                />
              ) : (
                <TrialParticipantLifecycleButtons
                  reservationId={reservation.id}
                  redirectTo={`/dashboard/participants/${reservation.id}?source=trial`}
                  playClassName={lifecycle.playClassName}
                  pauseClassName={lifecycle.pauseClassName}
                  stopClassName={lifecycle.stopClassName}
                  playDisabled={lifecycle.playDisabled}
                  stopDisabled={lifecycle.stopDisabled}
                  showApprovalAction={lifecycle.playMode === "trial_checked_in"}
                  showCancellationAction={lifecycle.playMode === "trial_checked_in" || lifecycle.playMode === "trial_reserved"}
                />
              )}
            </div>
          </div>
          <MailActionLink
            href={participantMailHref}
            label="E-Mail"
            title="Teilnehmer*in per E-Mail kontaktieren"
            disabledHint="Keine E-Mail-Adresse für diese Person vorhanden"
          />
          {hasRegisteredParticipation ? (
            registeredCalendarEnabled ? (
              <Link href={buildBookingCalendarPath(reservation.id, "registered")} className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
                Kalender
              </Link>
            ) : (
              <span className="inline-flex cursor-not-allowed rounded-xl border px-4 py-2 text-sm font-semibold text-muted-foreground opacity-60">
                Kalender
              </span>
            )
          ) : trialCalendarEnabled ? (
            <Link href={buildBookingCalendarPath(reservation.id, "trial")} className="inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
              Kalender
            </Link>
          ) : (
            <span className="inline-flex cursor-not-allowed rounded-xl border px-4 py-2 text-sm font-semibold text-muted-foreground opacity-60">
              Kalender
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
          <p>Name: <span className="font-medium text-foreground">{participantName(intent?.first_name ?? reservation.first_name, intent?.last_name ?? reservation.last_name, "Teilnehmer*in")}</span></p>
          <p>E-Mail: <span className="font-medium text-foreground">{intent?.email ?? reservation.email ?? "-"}</span></p>
          <p>Telefon: <span className="font-medium text-foreground">{intent?.phone ?? reservation.phone ?? "-"}</span></p>
          <p>Probestatus: <span className="font-medium text-foreground">{reservation.decision_status ?? reservation.status ?? "-"}</span></p>
          <p>Check-in: <span className="font-medium text-foreground">{formatDateTime(ticket?.checked_in_at ?? null)}</span></p>
          <p>Ticketstatus: <span className="font-medium text-foreground">{ticket?.status ?? "-"}</span></p>
          <p className="sm:col-span-2">Adresse: <span className="font-medium text-foreground">{formatAddress([intent?.street_and_number, intent?.postal_code, intent?.city, intent?.country])}</span></p>
          {reservation.registration_expires_at ? (
            <p>Registrierungsfrist: <span className="font-medium text-foreground">{formatDateTime(reservation.registration_expires_at)}</span></p>
          ) : null}
          {reservation.converted_at ? (
            <p>Verbindlich angemeldet am: <span className="font-medium text-foreground">{formatDateTime(reservation.converted_at)}</span></p>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border p-6">
        <h2 className="text-xl font-semibold">Angebotskontext</h2>
        <div className="mt-4 space-y-2 text-sm text-muted-foreground">
          <p>Titel: <span className="font-medium text-foreground">{course.title ?? "laufendes Angebot"}</span></p>
          {providerName ? <p>Anbieter: <span className="font-medium text-foreground">{providerName}</span></p> : null}
          {course.instructor_name ? <p>Leitung: <span className="font-medium text-foreground">{course.instructor_name}</span></p> : null}
          {formatPrice(course.price_cents, course.currency) ? (
            <p>Preis: <span className="font-medium text-foreground">{formatPrice(course.price_cents, course.currency)}</span></p>
          ) : null}
          {course.location ? <p>Ort: <span className="font-medium text-foreground">{course.location}</span></p> : null}
          {course.location_details ? <p>Raum / Zusatzinfo: <span className="font-medium text-foreground">{course.location_details}</span></p> : null}
          <p>Probeteilnahme: <span className="font-medium text-foreground">{`${formatDateTime(reservation.trial_starts_at)} - ${formatDateTime(reservation.trial_ends_at)}`}</span></p>
        </div>
      </section>

      {hasRegisteredParticipation ? (
        <section className="rounded-2xl border p-6">
          <h2 className="text-xl font-semibold">Teilnahme steuern</h2>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p>
              Teilnahmestatus:{" "}
              <span className="font-medium text-foreground">
                {formatParticipantSubscriptionStatus(intent?.subscription_status ?? null)}
              </span>
            </p>
            {pauseStartLabel ? <p>Pause ab: <span className="font-medium text-foreground">{pauseStartLabel}</span></p> : null}
            {pauseEndLabel ? <p>Wieder aktiv ab: <span className="font-medium text-foreground">{pauseEndLabel}</span></p> : null}
            {stopDateLabel ? <p>Teilnahme endet zum: <span className="font-medium text-foreground">{stopDateLabel}</span></p> : null}
            {intent?.subscription_cancel_scheduled_at ? (
              <p>
                Kündigung vorgemerkt am:{" "}
                <span className="font-medium text-foreground">{formatDateTime(intent?.subscription_cancel_scheduled_at ?? null)}</span>
              </p>
            ) : null}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Zukünftige Teilnehmer-Pausen werden in RESER termingenau vorgemerkt. Eine automatische Stripe-Pausierung für einen späteren Monat ist mit der aktuellen Architektur noch nicht robust geplant.
          </p>
        </section>
      ) : null}

      <section className="rounded-2xl border p-6">
        <h2 className="text-xl font-semibold">Gespeicherte Anmeldedaten</h2>
        {intent ? (
          <div className="mt-4 grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
            <p>Vorname: <span className="font-medium text-foreground">{intent.first_name ?? "-"}</span></p>
            <p>Nachname: <span className="font-medium text-foreground">{intent.last_name ?? "-"}</span></p>
            <p>E-Mail: <span className="font-medium text-foreground">{intent.email ?? "-"}</span></p>
            <p>Telefon: <span className="font-medium text-foreground">{intent.phone ?? "-"}</span></p>
            <p className="sm:col-span-2">Adresse: <span className="font-medium text-foreground">{formatAddress([intent.street_and_number, intent.postal_code, intent.city, intent.country])}</span></p>
            <p className="sm:col-span-2">Notizen: <span className="font-medium text-foreground">{intent.notes ?? "-"}</span></p>
            <p>Status: <span className="font-medium text-foreground">{intent.status ?? "-"}</span></p>
            <p>Stripe Subscription: <span className="font-medium text-foreground">{intent.stripe_subscription_id ?? "-"}</span></p>
            <p>Subscription Contract: <span className="font-medium text-foreground">{intent.subscription_contract_id ?? "-"}</span></p>
            <p>Teilnahmestatus: <span className="font-medium text-foreground">{formatParticipantSubscriptionStatus(intent.subscription_status)}</span></p>
            <p>Checkout abgeschlossen: <span className="font-medium text-foreground">{formatDateTime(intent.completed_at)}</span></p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Fuer diese Person liegt noch keine verbindliche Registrierung im System vor.
          </p>
        )}
      </section>
    </main>
  );
}

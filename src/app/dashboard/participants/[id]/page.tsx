import Link from "next/link";
import { redirect } from "next/navigation";
import { formatCourseLifecycleDate } from "@/lib/course-lifecycle";
import { getProviderDisplayName } from "@/lib/provider-profiles";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getDefaultParticipantPauseStartDate,
  pauseParticipantSubscriptionAction,
  stopParticipantSubscriptionAction,
} from "./actions";
import { ParticipantPauseModal, ParticipantStopModal } from "./ParticipantSubscriptionModal";

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
  approved_at: string | null;
  rejected_at: string | null;
  registration_expires_at: string | null;
  converted_at: string | null;
};

type CourseRow = {
  id: string;
  title: string | null;
  teacher_id: string | null;
  kind: string | null;
  instructor_name: string | null;
  price_cents: number | null;
  currency: string | null;
  cancellation_model: string | null;
  location: string | null;
  location_details: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: "independent_teacher" | "studio_provider" | null;
  organization_name: string | null;
};

type RegistrationIntentRow = {
  id: string;
  status: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  subscription_pause_start_date: string | null;
  subscription_pause_end_date: string | null;
  subscription_cancel_scheduled_at: string | null;
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

type TrialTicketRow = {
  status: string | null;
  checked_in_at: string | null;
  customer_name: string;
  customer_email: string;
};

type WorkshopBookingRow = {
  id: string;
  course_id: string | null;
  attendee_key: string | null;
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
  if (status === "paused") return "Pausiert";
  if (status === "cancel_scheduled") return "Beendet zum Periodenende";
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
      .select("id,course_id,attendee_key,status,checked_in_at,created_at,payment_provider,customer_first_name,customer_last_name,customer_email,customer_phone")
      .eq("id", id)
      .maybeSingle<WorkshopBookingRow>();

    if (!booking?.course_id) {
      redirect("/dashboard/participants");
    }

    const [{ data: course }, { data: ticket }, { data: profile }] = await Promise.all([
      admin
        .from("courses")
        .select(
          "id,title,teacher_id,kind,instructor_name,price_cents,currency,cancellation_model,location,location_details"
        )
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

    return (
      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <Link href={`/dashboard/courses/${course.id}`} className="inline-flex text-sm font-semibold">
          Zurück zum Angebot
        </Link>

      {saved === "participant_paused" ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Die Teilnahme wurde pausiert.
        </p>
      ) : null}
      {saved === "participant_cancel_scheduled" ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Die Teilnahme wurde zum Periodenende beendet.
        </p>
      ) : null}
      {saved === "participant_pause_invalid" || saved === "participant_stop_invalid" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Die Teilnahme konnte in diesem Zustand nicht geaendert werden.
        </p>
      ) : null}
      {saved === "participant_pause_error" || saved === "participant_stop_error" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Die Stripe-Aenderung fuer diese Teilnahme ist fehlgeschlagen.
        </p>
      ) : null}

        <section className="rounded-2xl border p-6">
          <h1 className="text-2xl font-semibold">
            {participantName(
              booking.customer_first_name,
              booking.customer_last_name,
              ticket?.customer_name ?? "Workshop-Teilnehmer*in"
            )}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Workshop-Teilnehmerdetail für {course.title ?? "Workshop"}.
          </p>
          <div className="mt-4 grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
            <p>Name: <span className="font-medium text-foreground">{participantName(booking.customer_first_name, booking.customer_last_name, ticket?.customer_name ?? "Workshop-Teilnehmer*in")}</span></p>
            <p>E-Mail: <span className="font-medium text-foreground">{booking.customer_email ?? ticket?.customer_email ?? "-"}</span></p>
            <p>Telefon: <span className="font-medium text-foreground">{booking.customer_phone ?? "-"}</span></p>
            <p>Status: <span className="font-medium text-foreground">{ticket?.status ?? booking.status ?? "-"}</span></p>
            <p>Gebucht am: <span className="font-medium text-foreground">{formatDateTime(booking.created_at)}</span></p>
            <p>Check-in: <span className="font-medium text-foreground">{formatDateTime(ticket?.checked_in_at ?? booking.checked_in_at)}</span></p>
            <p className="sm:col-span-2">Adresse: <span className="font-medium text-foreground">-</span></p>
            {booking.payment_provider ? <p>Zahlungsanbieter: <span className="font-medium text-foreground">{booking.payment_provider}</span></p> : null}
          </div>
        </section>

        <section className="rounded-2xl border p-6">
          <h2 className="text-xl font-semibold">Workshop-Kontext</h2>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p>Titel: <span className="font-medium text-foreground">{course.title ?? "Workshop"}</span></p>
            {providerName ? <p>Anbieter: <span className="font-medium text-foreground">{providerName}</span></p> : null}
            {course.instructor_name ? <p>Dozent: <span className="font-medium text-foreground">{course.instructor_name}</span></p> : null}
            {formatPrice(course.price_cents, course.currency) ? (
              <p>Preis: <span className="font-medium text-foreground">{formatPrice(course.price_cents, course.currency)}</span></p>
            ) : null}
            {course.location ? <p>Ort: <span className="font-medium text-foreground">{course.location}</span></p> : null}
            {course.location_details ? <p>Raum / Zusatzinfo: <span className="font-medium text-foreground">{course.location_details}</span></p> : null}
          </div>
        </section>

        <section className="rounded-2xl border p-6">
          <h2 className="text-xl font-semibold">Interne Vermerke</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Notizen folgen später
            </div>
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Chat-Funktion folgt später
            </div>
          </div>
        </section>
      </main>
    );
  }

  const { data: reservation } = await admin
    .from("trial_reservations")
    .select(
      "id,course_id,first_name,last_name,email,status,decision_status,trial_starts_at,trial_ends_at,approved_at,rejected_at,registration_expires_at,converted_at"
    )
    .eq("id", id)
    .maybeSingle<TrialReservationRow>();

  if (!reservation) {
    redirect("/dashboard/participants");
  }

  const [{ data: course }, { data: intent }, { data: ticket }, { data: profile }] = await Promise.all([
    admin
      .from("courses")
      .select(
        "id,title,teacher_id,kind,instructor_name,price_cents,currency,cancellation_model,location,location_details"
      )
      .eq("id", reservation.course_id)
      .maybeSingle<CourseRow>(),
    admin
      .from("course_registration_intents")
      .select(
        "id,status,stripe_subscription_id,subscription_status,subscription_pause_start_date,subscription_pause_end_date,subscription_cancel_scheduled_at,first_name,last_name,email,phone,street_and_number,postal_code,city,country,notes,completed_at"
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
  const defaultPauseStartDate = getDefaultParticipantPauseStartDate();
  const pauseStartLabel = formatCourseLifecycleDate(intent?.subscription_pause_start_date ?? null);
  const pauseEndLabel = formatCourseLifecycleDate(intent?.subscription_pause_end_date ?? null);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
        <Link href={`/dashboard/courses/${course.id}`} className="inline-flex text-sm font-semibold">
        Zurück zum Angebot
        </Link>

      <section className="rounded-2xl border p-6">
        <h1 className="text-2xl font-semibold">
          {participantName(
            intent?.first_name ?? reservation.first_name,
            intent?.last_name ?? reservation.last_name,
            "Teilnehmer*in"
          )}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Teilnehmerdetail für {course.title ?? "Kurs"}.
        </p>
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
        <h2 className="text-xl font-semibold">Kurs-Kontext</h2>
        <div className="mt-4 space-y-2 text-sm text-muted-foreground">
          <p>Titel: <span className="font-medium text-foreground">{course.title ?? "Kurs"}</span></p>
          {providerName ? <p>Anbieter: <span className="font-medium text-foreground">{providerName}</span></p> : null}
          {course.instructor_name ? <p>Dozent: <span className="font-medium text-foreground">{course.instructor_name}</span></p> : null}
          {formatPrice(course.price_cents, course.currency) ? (
            <p>Preis: <span className="font-medium text-foreground">{formatPrice(course.price_cents, course.currency)}</span></p>
          ) : null}
          <p>Abrechnung: <span className="font-medium text-foreground">monatlich</span></p>
          <p>Kursmodell: <span className="font-medium text-foreground">fortlaufend</span></p>
          {course.location ? <p>Ort: <span className="font-medium text-foreground">{course.location}</span></p> : null}
          {course.location_details ? <p>Raum / Zusatzinfo: <span className="font-medium text-foreground">{course.location_details}</span></p> : null}
          <p>Probestunde: <span className="font-medium text-foreground">{`${formatDateTime(reservation.trial_starts_at)} - ${formatDateTime(reservation.trial_ends_at)}`}</span></p>
        </div>
      </section>

      {intent?.stripe_subscription_id ? (
        <section className="rounded-2xl border p-6">
          <h2 className="text-xl font-semibold">Teilnahme steuern</h2>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p>
              Subscriptionstatus:{" "}
              <span className="font-medium text-foreground">
                {formatParticipantSubscriptionStatus(intent.subscription_status)}
              </span>
            </p>
            {pauseStartLabel ? (
              <p>
                Pause seit: <span className="font-medium text-foreground">{pauseStartLabel}</span>
              </p>
            ) : null}
            {pauseEndLabel ? (
              <p>
                Pause bis: <span className="font-medium text-foreground">{pauseEndLabel}</span>
              </p>
            ) : null}
            {intent.subscription_cancel_scheduled_at ? (
              <p>
                Beendigung vorgemerkt am:{" "}
                <span className="font-medium text-foreground">{formatDateTime(intent.subscription_cancel_scheduled_at)}</span>
              </p>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {(intent.subscription_status ?? "active") !== "cancel_scheduled" ? (
              <ParticipantPauseModal
                reservationId={reservation.id}
                redirectTo={`/dashboard/participants/${reservation.id}?source=trial`}
                action={pauseParticipantSubscriptionAction}
                defaultPauseStartDate={defaultPauseStartDate}
                defaultPauseEndDate={intent.subscription_pause_end_date}
                minimumPauseEndDate={defaultPauseStartDate}
              />
            ) : null}
            {(intent.subscription_status ?? "active") !== "cancel_scheduled" ? (
              <ParticipantStopModal
                reservationId={reservation.id}
                redirectTo={`/dashboard/participants/${reservation.id}?source=trial`}
                action={stopParticipantSubscriptionAction}
              />
            ) : null}
          </div>
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
            <p>Teilnahmestatus: <span className="font-medium text-foreground">{formatParticipantSubscriptionStatus(intent.subscription_status)}</span></p>
            <p>Checkout abgeschlossen: <span className="font-medium text-foreground">{formatDateTime(intent.completed_at)}</span></p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Für diese Person liegt noch keine verbindliche Registrierung im System vor.
          </p>
        )}
      </section>

      <section className="rounded-2xl border p-6">
        <h2 className="text-xl font-semibold">Interne Vermerke</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Notizen folgen später
          </div>
          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Chat-Funktion folgt später
          </div>
        </div>
      </section>
    </main>
  );
}

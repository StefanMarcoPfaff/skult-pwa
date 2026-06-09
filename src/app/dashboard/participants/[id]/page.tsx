import Link from "next/link";
import type { ReactNode } from "react";
import { ConfirmIconAction } from "@/app/dashboard/courses/ConfirmIconAction";
import { OfferActionIcon, OfferActionItem } from "@/app/dashboard/courses/OfferActionIcon";
import { redirect } from "next/navigation";
import { MailActionLink } from "@/components/dashboard/MailActionLink";
import OfferSummaryCard from "@/components/offer/OfferSummaryCard";
import { getCourseParticipantTicketBindingId } from "@/lib/course-participant-bindings";
import { formatCourseLifecycleDate, getNextMonthEndDate } from "@/lib/course-lifecycle-shared";
import { buildMailtoHref, buildParticipantMailSubject } from "@/lib/mailto";
import { buildOfferViewModel } from "@/lib/offers/offer-view-model";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { archiveParticipantAction } from "../actions";
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
  description?: string | null;
  instructor_name: string | null;
  price_cents: number | null;
  currency: string | null;
  price_type?: string | null;
  location: string | null;
  location_details: string | null;
  starts_at: string | null;
  ends_at?: string | null;
  start_time: string | null;
  duration_minutes: number | null;
  recurrence_type: string | null;
  workshop_storno_policy?: string | null;
  cancellation_model?: string | null;
  offer_image_url?: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: "independent_teacher" | "studio_provider" | null;
  organization_name: string | null;
  photo_url?: string | null;
  company_logo_url?: string | null;
  email?: string | null;
};

type SessionRow = {
  starts_at: string | null;
  ends_at: string | null;
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
  payment_status: string | null;
  checked_in_at: string | null;
  created_at: string | null;
  payment_provider: string | null;
  refunded_at: string | null;
  stripe_refund_id: string | null;
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

function getRegisteredLifecycleLabels(status: string | null) {
  return {
    playLabel:
      status === "paused" || status === "pause_scheduled"
        ? "Angemeldet"
        : status === "cancelled" || status === "inactive"
          ? "Gekündigt"
          : "Verbindlich angemeldet",
    pauseLabel:
      status === "paused" ? "Pausiert" : status === "pause_scheduled" ? "Pausierung geplant" : "Pausieren",
    stopLabel:
      status === "cancel_scheduled"
        ? "Kündigung geplant"
        : status === "cancelled" || status === "inactive"
          ? "Gekündigt"
          : "Kündigen",
  };
}

function ArchiveGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M4 7h16" />
      <path d="M6 7h12v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7Z" />
      <path d="M9 7V5h6v2" />
    </svg>
  );
}

function EditGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="m4 20 4.5-1 9-9a2.12 2.12 0 1 0-3-3l-9 9L4 20Z" />
      <path d="M13.5 6.5 17.5 10.5" />
    </svg>
  );
}

function CheckInGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M4 7h16" />
      <path d="M7 4v6" />
      <path d="M17 4v6" />
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  );
}

function ActionGroup(props: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 rounded-2xl border border-white/70 bg-white/70 p-3 backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{props.title}</p>
      <div className="flex flex-wrap gap-4">{props.children}</div>
    </div>
  );
}

function ParticipantDetailActions(props: {
  lifecycle: ReactNode;
  mailHref: string | null;
  checkInHref: string;
  archiveParticipantId: string;
  archiveSource: "trial" | "registered" | "workshop";
  redirectTo: string;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <ActionGroup title="Teilnahmestatus & Verwaltung">
          {props.lifecycle}
          <OfferActionItem label="Notizen">
            <Link href={props.redirectTo} className="inline-flex">
              <OfferActionIcon title="Notizen" label="Notizen">
                <EditGlyph />
              </OfferActionIcon>
            </Link>
          </OfferActionItem>
          <OfferActionItem label="Bearbeiten">
            <Link href={props.redirectTo} className="inline-flex">
              <OfferActionIcon title="Bearbeiten" label="Bearbeiten">
                <EditGlyph />
              </OfferActionIcon>
            </Link>
          </OfferActionItem>
          <OfferActionItem label="Archivieren">
            <ConfirmIconAction
              action={archiveParticipantAction}
              fields={{
                participant_id: props.archiveParticipantId,
                source: props.archiveSource,
                redirect_to: "/dashboard/participants",
              }}
              title="Teilnahme archivieren?"
              text="Die Teilnahme bleibt historisch erhalten und wird nur aus den aktiven Übersichten entfernt."
              cancelLabel="Nein, abbrechen"
              confirmLabel="Ja, archivieren"
              triggerLabel="archivieren"
              trigger={
                <OfferActionIcon title="Archivieren" label="Archivieren">
                  <ArchiveGlyph />
                </OfferActionIcon>
              }
            />
          </OfferActionItem>
        </ActionGroup>

        <ActionGroup title="Nutzung & Kommunikation">
          <MailActionLink
            href={props.mailHref}
            label="E-Mail"
            title="Teilnehmer*in per E-Mail kontaktieren"
            disabledHint="Keine E-Mail-Adresse für diese Person vorhanden"
          />
          <OfferActionItem label="Check-in">
            <Link href={props.checkInHref} className="inline-flex">
              <OfferActionIcon title="Check-in starten" label="Check-in starten">
                <CheckInGlyph />
              </OfferActionIcon>
            </Link>
          </OfferActionItem>
        </ActionGroup>
      </div>
    </section>
  );
}

function buildParticipantOfferViewModel(course: CourseRow, profile: ProfileRow | null, sessions: SessionRow[]) {
  return buildOfferViewModel({
    course,
    providerProfile: profile,
    sessions,
  });
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
      {props.saved === "workshop_participant_cancelled_free" ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Die kostenlose Reservierung wurde storniert. Es wurde keine Rückzahlung ausgelöst.
        </p>
      ) : null}
      {props.saved === "workshop_participant_refunded" ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Die Teilnahme wurde storniert und die Rückerstattung wurde ausgelöst.
        </p>
      ) : null}
      {props.saved === "workshop_participant_refund_pending" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Die Teilnahme wurde storniert. Die Rückerstattung muss noch geprüft oder nachbearbeitet werden.
        </p>
      ) : null}
      {props.saved === "workshop_participant_already_cancelled" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Diese Teilnahme ist bereits storniert.
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
        "id,course_id,status,payment_status,checked_in_at,created_at,payment_provider,refunded_at,stripe_refund_id,customer_first_name,customer_last_name,customer_email,customer_phone"
      )
      .eq("id", id)
      .maybeSingle<WorkshopBookingRow>();

    if (!booking?.course_id) {
      redirect("/dashboard/participants");
    }

    const [{ data: course }, { data: ticket }, { data: profile }] = await Promise.all([
      admin
        .from("courses")
        .select("id,title,teacher_id,kind,description,instructor_name,price_cents,currency,price_type,location,location_details,starts_at,ends_at,start_time,duration_minutes,recurrence_type,workshop_storno_policy,cancellation_model,offer_image_url")
        .eq("id", booking.course_id)
        .maybeSingle<CourseRow>(),
      admin
        .from("tickets")
        .select("status,checked_in_at,customer_name,customer_email")
        .eq("booking_id", booking.id)
        .maybeSingle<WorkshopTicketRow>(),
      admin
        .from("profiles")
        .select("first_name,last_name,provider_type,organization_name,photo_url,company_logo_url,email")
        .eq("id", teacherId)
        .maybeSingle<ProfileRow>(),
    ]);

    if (!course || course.teacher_id !== teacherId) {
      redirect("/dashboard/participants");
    }

    const { data: sessions } = await admin
      .from("course_sessions")
      .select("starts_at,ends_at")
      .eq("course_id", course.id)
      .order("starts_at", { ascending: true })
      .returns<SessionRow[]>();
    const offerViewModel = buildParticipantOfferViewModel(course, profile, sessions ?? []);
    const workshopMailHref = buildMailtoHref({
      to: [booking.customer_email ?? ticket?.customer_email ?? null],
      subject: buildParticipantMailSubject(course.title),
    });
    const checkedInAt = ticket?.checked_in_at ?? booking.checked_in_at ?? null;
    const lifecycle = getWorkshopParticipantLifecycleDisplay({
      bookingStatus: booking.status,
      checkedInAt,
      refundedAt: booking.refunded_at,
      stripeRefundId: booking.stripe_refund_id,
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

            </div>
          </div>

          <div className="mt-4 grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
            <p>Name: <span className="font-medium text-foreground">{participantName(booking.customer_first_name, booking.customer_last_name, ticket?.customer_name ?? "Teilnehmer*in")}</span></p>
            <p>E-Mail: <span className="font-medium text-foreground">{booking.customer_email ?? ticket?.customer_email ?? "-"}</span></p>
            <p>Telefon: <span className="font-medium text-foreground">{booking.customer_phone ?? "-"}</span></p>
            <p>Status: <span className="font-medium text-foreground">{ticket?.status ?? booking.status ?? "-"}</span></p>
            <p>Gebucht am: <span className="font-medium text-foreground">{formatDateTime(booking.created_at)}</span></p>
            <p>Check-in: <span className="font-medium text-foreground">{formatDateTime(checkedInAt)}</span></p>
            {booking.payment_provider ? <p>Zahlungsanbieter: <span className="font-medium text-foreground">{booking.payment_provider}</span></p> : null}
          </div>
        </section>

        <ParticipantDetailActions
          lifecycle={
            <WorkshopParticipantLifecycleButtons
              bookingId={booking.id}
              redirectTo={`/dashboard/participants/${booking.id}?source=workshop`}
              paymentStatus={booking.payment_status}
              playMode={lifecycle.playMode}
              stopDisabled={booking.status !== "paid" || Boolean(booking.refunded_at) || Boolean(booking.stripe_refund_id)}
              playClassName={lifecycle.playClassName}
              pauseClassName={lifecycle.pauseClassName}
              stopClassName={lifecycle.stopClassName}
            />
          }
          mailHref={workshopMailHref}
          checkInHref={`/dashboard/courses/${course.id}/check-in`}
          archiveParticipantId={booking.id}
          archiveSource="workshop"
          redirectTo={`/dashboard/participants/${booking.id}?source=workshop`}
        />

        <OfferSummaryCard viewModel={offerViewModel} compact />
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
        .select("id,title,teacher_id,kind,description,instructor_name,price_cents,currency,price_type,location,location_details,starts_at,ends_at,start_time,duration_minutes,recurrence_type,workshop_storno_policy,cancellation_model,offer_image_url")
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
        .select("first_name,last_name,provider_type,organization_name,photo_url,company_logo_url,email")
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

    const { data: sessions } = await admin
      .from("course_sessions")
      .select("starts_at,ends_at")
      .eq("course_id", course.id)
      .order("starts_at", { ascending: true })
      .returns<SessionRow[]>();
    const offerViewModel = buildParticipantOfferViewModel(course, profile, sessions ?? []);
    const pauseStartLabel = formatCourseLifecycleDate(intent.subscription_pause_start_date ?? null);
    const pauseEndLabel = formatCourseLifecycleDate(intent.subscription_pause_end_date ?? null);
    const stopDateLabel = formatCourseLifecycleDate(intent.subscription_stop_date ?? null);
    const participantMailHref = buildMailtoHref({
      to: [intent.email ?? reservation?.email ?? null],
      subject: buildParticipantMailSubject(course.title),
    });
    const lifecycle = getParticipantLifecycleDisplay({
      reservationCancelledAt: reservation?.cancelled_at ?? null,
      reservationDecisionStatus: reservation?.decision_status ?? null,
      hasCompletedRegistration: Boolean(participantBindingId),
      subscriptionStatus: intent.subscription_status ?? null,
    });
    const lifecycleLabels = getRegisteredLifecycleLabels(intent.subscription_status ?? null);
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

            </div>
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

        <ParticipantDetailActions
          lifecycle={
            <RegisteredParticipantLifecycleButtons
              reservationId={intent.trial_reservation_id ?? ""}
              redirectTo={`/dashboard/participants/${intent.id}?source=registered`}
              defaultActiveUntilDate={defaultMonthEnd}
              defaultPauseEndDate={intent?.subscription_pause_end_date ?? null}
              defaultStopDate={defaultMonthEnd}
              playLabel={intent.is_simulation && !intent.trial_reservation_id ? "Simulation aktiv" : lifecycleLabels.playLabel}
              playClassName={lifecycle.playClassName}
              pauseClassName={lifecycle.pauseClassName}
              stopClassName={lifecycle.stopClassName}
              pauseLabel={intent.is_simulation && !intent.trial_reservation_id ? "Pause spaeter" : lifecycleLabels.pauseLabel}
              stopLabel={intent.is_simulation && !intent.trial_reservation_id ? "Kuendigung spaeter" : lifecycleLabels.stopLabel}
              pauseDisabled={lifecycle.pauseDisabled || !hasInteractiveLifecycle}
              stopDisabled={lifecycle.stopDisabled || !hasInteractiveLifecycle}
            />
          }
          mailHref={participantMailHref}
          checkInHref={`/dashboard/courses/${course.id}/check-in`}
          archiveParticipantId={intent.trial_reservation_id ?? intent.id}
          archiveSource="registered"
          redirectTo={`/dashboard/participants/${intent.id}?source=registered`}
        />

        <OfferSummaryCard viewModel={offerViewModel} compact />
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
      .select("id,title,teacher_id,kind,description,instructor_name,price_cents,currency,price_type,location,location_details,starts_at,ends_at,start_time,duration_minutes,recurrence_type,workshop_storno_policy,cancellation_model,offer_image_url")
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
      .select("first_name,last_name,provider_type,organization_name,photo_url,company_logo_url,email")
      .eq("id", teacherId)
      .maybeSingle<ProfileRow>(),
  ]);

  if (!course || course.teacher_id !== teacherId) {
    redirect("/dashboard/participants");
  }

  const { data: sessions } = await admin
    .from("course_sessions")
    .select("starts_at,ends_at")
    .eq("course_id", course.id)
    .order("starts_at", { ascending: true })
    .returns<SessionRow[]>();
  const offerViewModel = buildParticipantOfferViewModel(course, profile, sessions ?? []);
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
  const lifecycle = getParticipantLifecycleDisplay({
    reservationCancelledAt: reservation.cancelled_at ?? null,
    reservationDecisionStatus: reservation.decision_status,
    trialTicketStatus: ticket?.status ?? null,
    hasCompletedRegistration: hasRegisteredParticipation,
    subscriptionStatus: intent?.subscription_status ?? null,
  });
  const lifecycleLabels = getRegisteredLifecycleLabels(intent?.subscription_status ?? null);
  const defaultMonthEnd = getNextMonthEndDate();

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <Link href={`/dashboard/courses/${course.id}`} className="inline-flex text-sm font-semibold">
        Zurück zum Angebot
      </Link>

      <FlashMessages saved={saved} />

      <section className="rounded-2xl border p-6">
        <div>
          <h1 className="text-2xl font-semibold">
            {participantName(intent?.first_name ?? reservation.first_name, intent?.last_name ?? reservation.last_name, "Teilnehmer*in")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Teilnehmerdetail fuer {course.title ?? "laufendes Angebot"}.</p>
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

      <ParticipantDetailActions
        lifecycle={
          hasRegisteredParticipation ? (
            <RegisteredParticipantLifecycleButtons
              reservationId={reservation.id}
              redirectTo={`/dashboard/participants/${reservation.id}?source=trial`}
              defaultActiveUntilDate={defaultMonthEnd}
              defaultPauseEndDate={intent?.subscription_pause_end_date ?? null}
              defaultStopDate={defaultMonthEnd}
              playLabel={lifecycleLabels.playLabel}
              playClassName={lifecycle.playClassName}
              pauseClassName={lifecycle.pauseClassName}
              stopClassName={lifecycle.stopClassName}
              pauseLabel={lifecycleLabels.pauseLabel}
              stopLabel={lifecycleLabels.stopLabel}
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
          )
        }
        mailHref={participantMailHref}
        checkInHref={`/dashboard/courses/${course.id}/check-in`}
        archiveParticipantId={reservation.id}
        archiveSource={hasRegisteredParticipation ? "registered" : "trial"}
        redirectTo={`/dashboard/participants/${reservation.id}?source=trial`}
      />

      <OfferSummaryCard viewModel={offerViewModel} compact />
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

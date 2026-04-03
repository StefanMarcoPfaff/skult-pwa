import Link from "next/link";
import { formatCourseEndDate, isCourseClosedForNewRegistrations } from "@/lib/course-ending";
import { formatRecurringCoursePrice } from "@/lib/course-display";
import { getProviderDisplayName } from "@/lib/provider-profiles";
import { loadTicketBySubscriptionId } from "@/lib/tickets";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import RegistrationForm from "./RegistrationForm";

type TrialRegistrationRow = {
  id: string;
  course_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status: string | null;
  registration_expires_at: string | null;
};

type RegistrationIntentRow = {
  id: string;
  trial_reservation_id: string;
  course_id: string;
  status: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  street_and_number: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  stripe_subscription_id: string | null;
};

type CourseRow = {
  id: string;
  title: string | null;
  teacher_id: string | null;
  instructor_name: string | null;
  price_cents: number | null;
  currency: string | null;
  cancellation_model: string | null;
  location: string | null;
  location_details: string | null;
  ends_at: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: "independent_teacher" | "studio_provider" | null;
  organization_name: string | null;
};

function isExpired(value: string | null): boolean {
  if (!value) return true;
  const expiresAt = new Date(value);
  return Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now();
}

export default async function TrialRegistrationTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; edit?: string }>;
}) {
  const { token } = await params;
  const { error, edit } = await searchParams;
  const admin = createSupabaseAdmin();

  const { data: intentByToken } = await admin
    .from("course_registration_intents")
    .select(
      "id,trial_reservation_id,course_id,status,first_name,last_name,email,phone,street_and_number,postal_code,city,country,notes,stripe_subscription_id"
    )
    .eq("registration_token", token)
    .maybeSingle<RegistrationIntentRow>();

  const { data: reservation } = await admin
    .from("trial_reservations")
    .select("id,course_id,first_name,last_name,email,status,registration_expires_at")
    .eq("registration_token", token)
    .maybeSingle<TrialRegistrationRow>();

  const isCompletedRegistration = intentByToken?.status === "checkout_completed";
  const activeReservation =
    reservation && reservation.status === "approved" && !isExpired(reservation.registration_expires_at)
      ? reservation
      : null;
  const fallbackCourseId = intentByToken?.course_id ?? activeReservation?.course_id ?? null;

  if (!fallbackCourseId || (!isCompletedRegistration && !activeReservation)) {
    return (
      <main className="mx-auto max-w-2xl space-y-6 p-6">
        <section className="rounded-2xl border p-6">
          <h1 className="text-2xl font-semibold">Link nicht mehr gueltig</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Dieser Anmeldelink ist ungueltig oder bereits abgelaufen.
          </p>
          <Link href="/courses" className="mt-4 inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
            Zu den Kursen
          </Link>
        </section>
      </main>
    );
  }

  const { data: course } = await admin
    .from("courses")
    .select("id,title,teacher_id,instructor_name,price_cents,currency,cancellation_model,location,location_details,ends_at")
    .eq("id", fallbackCourseId)
    .maybeSingle<CourseRow>();

  const { data: profile } =
    course?.teacher_id
      ? await admin
          .from("profiles")
          .select("first_name,last_name,provider_type,organization_name")
          .eq("id", course.teacher_id)
          .maybeSingle<ProfileRow>()
      : { data: null };

  const providerName =
    profile?.provider_type ? getProviderDisplayName(profile.provider_type, profile) : null;

  const ticket =
    isCompletedRegistration && intentByToken?.stripe_subscription_id
      ? await loadTicketBySubscriptionId(intentByToken.stripe_subscription_id)
      : null;

  const checkoutError =
    error === "course_unavailable"
      ? "Dieser Kurs ist aktuell nicht fuer die Online-Anmeldung verfuegbar."
      : error === "course_ending"
        ? `Dieser Kurs endet am ${formatCourseEndDate(course?.ends_at ?? null) ?? "dem geplanten Termin"} und nimmt keine neuen verbindlichen Anmeldungen mehr an.`
        : error === "provider_payment_missing"
          ? "Der Anbieter hat noch keine vollstaendigen Zahlungsdaten hinterlegt."
          : error === "provider_payment_incomplete"
            ? "Das verknuepfte Stripe-Konto ist noch nicht vollstaendig eingerichtet."
            : error
              ? error
              : null;
  const isEditMode = isCompletedRegistration && edit === "1";
  const registrationClosed =
    !isCompletedRegistration && isCourseClosedForNewRegistrations(course?.ends_at ?? null);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <RegistrationForm
        token={token}
        course={{
          title: course?.title ?? "Kurs",
          providerName,
          providerType: profile?.provider_type ?? null,
          instructorName: course?.instructor_name ?? null,
          priceLabel: formatRecurringCoursePrice(course?.price_cents ?? null, course?.currency ?? null),
          location: course?.location ?? null,
          locationDetails: course?.location_details ?? null,
        }}
        prefill={{
          first_name: intentByToken?.first_name ?? activeReservation?.first_name ?? "",
          last_name: intentByToken?.last_name ?? activeReservation?.last_name ?? "",
          email: intentByToken?.email ?? activeReservation?.email ?? "",
          phone: intentByToken?.phone ?? "",
          street_and_number: intentByToken?.street_and_number ?? "",
          postal_code: intentByToken?.postal_code ?? "",
          city: intentByToken?.city ?? "",
          country: intentByToken?.country ?? "Deutschland",
          notes: intentByToken?.notes ?? "",
        }}
        initialError={checkoutError}
        completedRegistration={isCompletedRegistration}
        editMode={isEditMode}
        registrationClosed={registrationClosed}
        ticketQrToken={ticket?.qr_token ?? null}
      />
    </main>
  );
}

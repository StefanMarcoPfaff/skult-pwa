import Link from "next/link";
import { getCancellationModelLabel, getProviderDisplayName } from "@/lib/provider-profiles";
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

export default async function TrialRegistrationTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const admin = createSupabaseAdmin();

  const { data: reservation } = await admin
    .from("trial_reservations")
    .select("id,course_id,first_name,last_name,email,status,registration_expires_at")
    .eq("registration_token", token)
    .maybeSingle<TrialRegistrationRow>();

  if (!reservation || reservation.status !== "approved" || isExpired(reservation.registration_expires_at)) {
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
    .select("id,title,teacher_id,instructor_name,price_cents,currency,cancellation_model,location,location_details")
    .eq("id", reservation.course_id)
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
    profile?.provider_type
      ? getProviderDisplayName(profile.provider_type, profile)
      : null;

  const checkoutError =
    error === "course_unavailable"
      ? "Dieser Kurs ist aktuell nicht fuer die Online-Anmeldung verfuegbar."
      : error === "provider_payment_missing"
        ? "Der Anbieter hat noch keine vollstaendigen Zahlungsdaten hinterlegt."
        : error === "provider_payment_incomplete"
          ? "Das verknuepfte Stripe-Konto ist noch nicht vollstaendig eingerichtet."
          : null;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <section className="rounded-2xl border p-6">
        <p className="text-sm text-muted-foreground">
          Dein Platz ist bis <span className="font-medium text-foreground">{formatDateTime(reservation.registration_expires_at)}</span> fuer dich reserviert.
        </p>
      </section>

      <RegistrationForm
        token={token}
        course={{
          title: course?.title ?? "Kurs",
          providerName,
          instructorName: course?.instructor_name ?? null,
          priceLabel: formatPrice(course?.price_cents ?? null, course?.currency ?? null),
          cancellationLabel: getCancellationModelLabel(course?.cancellation_model),
          location: course?.location ?? null,
          locationDetails: course?.location_details ?? null,
        }}
        prefill={{
          first_name: reservation.first_name ?? "",
          last_name: reservation.last_name ?? "",
          email: reservation.email ?? "",
        }}
        initialError={checkoutError}
      />
    </main>
  );
}

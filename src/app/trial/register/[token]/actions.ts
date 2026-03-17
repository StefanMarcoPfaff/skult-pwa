"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type RegistrationActionState = {
  error?: string;
};

type ReservationRow = {
  id: string;
  course_id: string;
  status: string | null;
  registration_token: string | null;
  registration_expires_at: string | null;
};

function isExpired(value: string | null): boolean {
  if (!value) return true;
  const expiresAt = new Date(value);
  return Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now();
}

function requiredText(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

async function loadApprovedReservation(token: string) {
  const admin = createSupabaseAdmin();
  const { data: reservation, error } = await admin
    .from("trial_reservations")
    .select("id,course_id,status,registration_token,registration_expires_at")
    .eq("registration_token", token)
    .maybeSingle<ReservationRow>();

  if (error || !reservation) {
    return { admin, reservation: null };
  }

  if (reservation.status !== "approved" || isExpired(reservation.registration_expires_at)) {
    return { admin, reservation: null };
  }

  return { admin, reservation };
}

export async function submitTrialRegistrationAction(
  _prevState: RegistrationActionState,
  formData: FormData
): Promise<RegistrationActionState> {
  const token = requiredText(formData, "token");
  if (!token) {
    return { error: "Anmeldelink fehlt." };
  }

  const { admin, reservation } = await loadApprovedReservation(token);
  if (!reservation) {
    return { error: "Dieser Anmeldelink ist ungueltig oder abgelaufen." };
  }

  const first_name = requiredText(formData, "first_name");
  const last_name = requiredText(formData, "last_name");
  const email = requiredText(formData, "email");
  const phone = requiredText(formData, "phone");
  const street_and_number = requiredText(formData, "street_and_number");
  const postal_code = requiredText(formData, "postal_code");
  const city = requiredText(formData, "city");
  const country = requiredText(formData, "country");
  const notes = requiredText(formData, "notes") || null;

  if (
    !first_name ||
    !last_name ||
    !email ||
    !phone ||
    !street_and_number ||
    !postal_code ||
    !city ||
    !country
  ) {
    return { error: "Bitte fuelle alle Pflichtfelder aus." };
  }

  const bindingConfirmed = formData.get("binding_registration_confirmed") === "on";
  const agbAccepted = formData.get("agb_accepted") === "on";
  const privacyAccepted = formData.get("privacy_accepted") === "on";
  const cancellationTermsAccepted = formData.get("cancellation_terms_accepted") === "on";

  if (!bindingConfirmed || !agbAccepted || !privacyAccepted || !cancellationTermsAccepted) {
    return { error: "Bitte bestaetige alle erforderlichen Zustimmungspunkte." };
  }

  const now = new Date().toISOString();

  const { data: intent, error } = await admin
    .from("course_registration_intents")
    .upsert(
      {
        trial_reservation_id: reservation.id,
        course_id: reservation.course_id,
        registration_token: token,
        first_name,
        last_name,
        email,
        phone,
        street_and_number,
        postal_code,
        city,
        country,
        notes,
        binding_registration_confirmed_at: now,
        agb_accepted_at: now,
        privacy_accepted_at: now,
        cancellation_terms_accepted_at: now,
        status: "pending_checkout",
      },
      { onConflict: "trial_reservation_id" }
    )
    .select("id")
    .single<{ id: string }>();

  if (error || !intent) {
    return { error: error?.message || "Anmeldung konnte nicht gespeichert werden." };
  }

  redirect(`/api/stripe/course-registration/checkout?intentId=${intent.id}&token=${token}`);
}

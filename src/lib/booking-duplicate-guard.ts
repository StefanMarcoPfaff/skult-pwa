import type { createSupabaseAdmin } from "@/lib/supabase/admin";

export const ACTIVE_BOOKING_DUPLICATE_MESSAGE =
  "Für diese E-Mail-Adresse besteht bereits eine Anmeldung für dieses Angebot.\n\nFalls Du keine Bestätigung erhalten hast, prüfe bitte Deinen Spam-/Junk-Ordner oder kontaktiere die Anbietenden.";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

type SupabaseLikeError = {
  code?: string;
  message?: string;
};

type WorkshopBookingDuplicateRow = {
  id: string;
  customer_email: string | null;
  status: string | null;
  payment_status: string | null;
  refunded_at: string | null;
  archived_at: string | null;
};

type TrialReservationDuplicateRow = {
  id: string;
  email: string | null;
  status: string | null;
  decision_status: string | null;
  cancelled_at: string | null;
  converted_at: string | null;
  archived_at: string | null;
};

type CourseRegistrationDuplicateRow = {
  id: string;
  email: string | null;
  status: string | null;
  subscription_status: string | null;
  archived_at: string | null;
};

export function normalizeBookingEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isActiveBookingDuplicateError(error: unknown): boolean {
  const supabaseError = (error ?? {}) as SupabaseLikeError;
  return (
    supabaseError.code === "23505" ||
    /bereits eine aktive anmeldung|duplicate active booking|duplicate key|unique/i.test(
      String(supabaseError.message ?? "")
    )
  );
}

function isActiveWorkshopBooking(row: WorkshopBookingDuplicateRow): boolean {
  if (row.archived_at || row.refunded_at) return false;

  const status = (row.status ?? "").toLowerCase();
  const paymentStatus = (row.payment_status ?? "").toLowerCase();

  if (status === "cancelled" || status === "refunded") return false;
  if (paymentStatus === "cancelled" || paymentStatus === "refunded") return false;

  return true;
}

function isActiveTrialReservation(row: TrialReservationDuplicateRow): boolean {
  if (row.archived_at || row.cancelled_at || row.converted_at) return false;

  const status = (row.status ?? "").toLowerCase();
  const decisionStatus = (row.decision_status ?? "").toLowerCase();

  if (status === "cancelled" || status === "rejected") return false;
  if (decisionStatus === "rejected") return false;

  return true;
}

function isActiveCourseRegistration(row: CourseRegistrationDuplicateRow): boolean {
  if (row.archived_at) return false;

  const status = (row.status ?? "").toLowerCase();
  const subscriptionStatus = (row.subscription_status ?? "").toLowerCase();

  if (status === "checkout_cancelled") return false;
  if (
    status === "checkout_completed" &&
    (subscriptionStatus === "inactive" ||
      subscriptionStatus === "cancelled" ||
      subscriptionStatus === "ended")
  ) {
    return false;
  }

  return true;
}

export async function hasActiveWorkshopBookingForEmail(input: {
  admin: SupabaseAdmin;
  courseId: string;
  email: string;
  excludeBookingId?: string | null;
}): Promise<boolean> {
  const email = normalizeBookingEmail(input.email);
  if (!email) return false;

  let query = input.admin
    .from("bookings")
    .select("id,customer_email,status,payment_status,refunded_at,archived_at")
    .eq("course_id", input.courseId);

  if (input.excludeBookingId) {
    query = query.neq("id", input.excludeBookingId);
  }

  const { data, error } = await query.returns<WorkshopBookingDuplicateRow[]>();
  if (error) throw error;

  return (data ?? []).some(
    (row) => normalizeBookingEmail(row.customer_email ?? "") === email && isActiveWorkshopBooking(row)
  );
}

export async function hasActiveTrialReservationForEmail(input: {
  admin: SupabaseAdmin;
  courseId: string;
  email: string;
  excludeReservationId?: string | null;
}): Promise<boolean> {
  const email = normalizeBookingEmail(input.email);
  if (!email) return false;

  let query = input.admin
    .from("trial_reservations")
    .select("id,email,status,decision_status,cancelled_at,converted_at,archived_at")
    .eq("course_id", input.courseId);

  if (input.excludeReservationId) {
    query = query.neq("id", input.excludeReservationId);
  }

  const { data, error } = await query.returns<TrialReservationDuplicateRow[]>();
  if (error) throw error;

  return (data ?? []).some(
    (row) => normalizeBookingEmail(row.email ?? "") === email && isActiveTrialReservation(row)
  );
}

export async function hasActiveCourseRegistrationForEmail(input: {
  admin: SupabaseAdmin;
  courseId: string;
  email: string;
  excludeIntentId?: string | null;
}): Promise<boolean> {
  const email = normalizeBookingEmail(input.email);
  if (!email) return false;

  let query = input.admin
    .from("course_registration_intents")
    .select("id,email,status,subscription_status,archived_at")
    .eq("course_id", input.courseId);

  if (input.excludeIntentId) {
    query = query.neq("id", input.excludeIntentId);
  }

  const { data, error } = await query.returns<CourseRegistrationDuplicateRow[]>();
  if (error) throw error;

  return (data ?? []).some(
    (row) => normalizeBookingEmail(row.email ?? "") === email && isActiveCourseRegistration(row)
  );
}

export async function hasActiveCourseParticipationForEmail(input: {
  admin: SupabaseAdmin;
  courseId: string;
  email: string;
  excludeReservationId?: string | null;
  excludeIntentId?: string | null;
}): Promise<boolean> {
  const [hasReservation, hasRegistration] = await Promise.all([
    hasActiveTrialReservationForEmail({
      admin: input.admin,
      courseId: input.courseId,
      email: input.email,
      excludeReservationId: input.excludeReservationId,
    }),
    hasActiveCourseRegistrationForEmail({
      admin: input.admin,
      courseId: input.courseId,
      email: input.email,
      excludeIntentId: input.excludeIntentId,
    }),
  ]);

  return hasReservation || hasRegistration;
}

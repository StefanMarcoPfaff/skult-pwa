"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  sendTeacherTrialReservationNotificationEmail,
  sendTrialReservationConfirmationEmail,
  type TrialReservationEmailData,
} from "@/lib/trial-reservation-emails";
import { computeUpcomingTrialSlots } from "./trial-slots";

export type TrialReservationState = {
  error?: string;
};

type CourseLiteTrialRow = {
  id: string;
  kind: string | null;
  weekday: number | null;
  start_time: string | null;
  duration_minutes: number | null;
  recurrence_type: string | null;
  trial_mode: string | null;
  starts_at: string | null;
};

type CourseMailRow = {
  id: string;
  title: string | null;
  location: string | null;
  teacher_id: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
};

type TrialReservationInsertRow = {
  id: string;
};

type SupabaseLikeError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function requiredText(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeIsoDateTime(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function isDuplicateReservationError(error: unknown): boolean {
  const supabaseError = error as SupabaseLikeError | null;
  if (!supabaseError) return false;
  if (supabaseError.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(String(supabaseError.message ?? ""));
}

function logReservationError(context: string, error: unknown) {
  if (process.env.NODE_ENV === "production") return;
  const supabaseError = (error ?? {}) as SupabaseLikeError;
  console.error("[trial reservation]", {
    context,
    message: supabaseError.message,
    code: supabaseError.code,
    details: supabaseError.details,
    hint: supabaseError.hint,
  });
}

function formatReservationError(error: unknown): string {
  const supabaseError = (error ?? {}) as SupabaseLikeError;
  const base = "Reservierung fehlgeschlagen. Bitte versuche es erneut.";
  if (process.env.NODE_ENV === "production") return base;

  const extras = [
    supabaseError.message ? `message=${supabaseError.message}` : null,
    supabaseError.code ? `code=${supabaseError.code}` : null,
    supabaseError.details ? `details=${supabaseError.details}` : null,
    supabaseError.hint ? `hint=${supabaseError.hint}` : null,
  ].filter(Boolean);

  return extras.length > 0 ? `${base} (${extras.join(" | ")})` : base;
}

function generateCancelToken(): string {
  return randomBytes(24).toString("hex");
}

async function loadMailContext(admin: ReturnType<typeof createSupabaseAdmin>, courseId: string) {
  const { data: course, error: courseError } = await admin
    .from("courses")
    .select("id,title,location,teacher_id")
    .eq("id", courseId)
    .maybeSingle<CourseMailRow>();

  if (courseError || !course) {
    logReservationError("load-mail-course", courseError);
    return null;
  }

  let teacherName: string | null = null;
  let teacherEmail: string | null = null;

  if (course.teacher_id) {
    const [{ data: profile }, authResult] = await Promise.all([
      admin
        .from("profiles")
        .select("first_name,last_name")
        .eq("id", course.teacher_id)
        .maybeSingle<ProfileRow>(),
      admin.auth.admin.getUserById(course.teacher_id),
    ]);

    const nameParts = [profile?.first_name, profile?.last_name].filter(Boolean);
    teacherName = nameParts.length > 0 ? nameParts.join(" ") : null;
    teacherEmail = authResult.data.user?.email ?? null;
  }

  return {
    courseTitle: course.title ?? "Kurs",
    location: course.location,
    teacherName,
    teacherEmail,
  };
}

async function triggerReservationEmails(
  admin: ReturnType<typeof createSupabaseAdmin>,
  input: TrialReservationEmailData
) {
  let confirmationSent = false;
  let teacherNotificationSent = false;

  try {
    await sendTrialReservationConfirmationEmail(input);
    confirmationSent = true;
  } catch (error) {
    logReservationError("send-customer-confirmation", error);
  }

  try {
    const result = await sendTeacherTrialReservationNotificationEmail(input);
    teacherNotificationSent = result !== null;
  } catch (error) {
    logReservationError("send-teacher-notification", error);
  }

  if (!confirmationSent && !teacherNotificationSent) return;

  const update: {
    confirmation_sent_at?: string;
    teacher_notification_sent_at?: string;
  } = {};

  if (confirmationSent) update.confirmation_sent_at = new Date().toISOString();
  if (teacherNotificationSent) update.teacher_notification_sent_at = new Date().toISOString();

  const { error } = await admin.from("trial_reservations").update(update).eq("id", input.reservationId);
  if (error) {
    logReservationError("update-email-timestamps", error);
  }
}

export async function reserveTrialAction(
  courseId: string,
  _prevState: TrialReservationState,
  formData: FormData
): Promise<TrialReservationState> {
  const firstName = requiredText(formData.get("first_name"));
  const lastName = requiredText(formData.get("last_name"));
  const email = requiredText(formData.get("email")).toLowerCase();
  const selectedTrialStartRaw = requiredText(formData.get("trial_starts_at"));
  const selectedTrialStart = normalizeIsoDateTime(selectedTrialStartRaw);

  if (!firstName) return { error: "Bitte gib deinen Vornamen ein." };
  if (!lastName) return { error: "Bitte gib deinen Nachnamen ein." };
  if (!email || !isValidEmail(email)) return { error: "Bitte gib eine gültige E-Mail-Adresse ein." };
  if (!selectedTrialStart) return { error: "Bitte wähle einen gültigen Probestunden-Termin aus." };

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdmin();

  const { data: course, error: courseError } = await supabase
    .from("courses_lite")
    .select("id,kind,weekday,start_time,duration_minutes,recurrence_type,trial_mode,starts_at")
    .eq("id", courseId)
    .eq("is_published", true)
    .maybeSingle<CourseLiteTrialRow>();

  if (courseError || !course || course.kind !== "course") {
    logReservationError("load-course", courseError);
    return { error: "Kurs nicht gefunden." };
  }

  if ((course.trial_mode ?? "all_sessions") !== "all_sessions") {
    return { error: "Probestunden-Termine werden in Kürze verfügbar sein." };
  }

  const availableSlots = computeUpcomingTrialSlots({
    weekday: course.weekday,
    startTime: course.start_time,
    durationMinutes: course.duration_minutes,
    recurrenceType: course.recurrence_type,
    trialMode: course.trial_mode,
    startsAt: course.starts_at,
  });

  if (availableSlots.length === 0) {
    return { error: "Aktuell sind keine Probestunden-Termine verfügbar." };
  }

  const selectedSlot = availableSlots.find((slot) => slot.startsAt === selectedTrialStart);
  if (!selectedSlot) {
    return { error: "Bitte wähle einen gültigen Probestunden-Termin aus." };
  }

  const { data: existing, error: existingError } = await admin
    .from("trial_reservations")
    .select("id")
    .eq("course_id", courseId)
    .eq("email", email)
    .is("cancelled_at", null)
    .maybeSingle();

  if (existingError) {
    logReservationError("check-duplicate", existingError);
    return { error: formatReservationError(existingError) };
  }

  if (existing) {
    return {
      error:
        "Für diesen Kurs liegt bereits eine Probestunden-Anfrage mit dieser E-Mail-Adresse vor.",
    };
  }

  const cancelToken = generateCancelToken();
  const { data: inserted, error: insertError } = await admin
    .from("trial_reservations")
    .insert({
      course_id: courseId,
      first_name: firstName,
      last_name: lastName,
      email,
      status: "pending",
      user_id: null,
      trial_starts_at: selectedSlot.startsAt,
      trial_ends_at: selectedSlot.endsAt,
      cancel_token: cancelToken,
    })
    .select("id")
    .single<TrialReservationInsertRow>();

  if (insertError) {
    logReservationError("insert-reservation", insertError);
    if (isDuplicateReservationError(insertError)) {
      return {
        error:
          "Für diesen Kurs liegt bereits eine Probestunden-Anfrage mit dieser E-Mail-Adresse vor.",
      };
    }
    return { error: formatReservationError(insertError) };
  }

  const mailContext = await loadMailContext(admin, courseId);
  if (mailContext) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const cancelUrl = `${siteUrl}/trial/cancel/${cancelToken}`;
    await triggerReservationEmails(admin, {
      reservationId: inserted.id,
      courseTitle: mailContext.courseTitle,
      teacherName: mailContext.teacherName,
      teacherEmail: mailContext.teacherEmail,
      customerName: `${firstName} ${lastName}`.trim(),
      customerEmail: email,
      location: mailContext.location,
      trialStartsAt: selectedSlot.startsAt,
      trialEndsAt: selectedSlot.endsAt,
      cancelUrl,
    });
  }

  redirect(`/courses/${courseId}?reserved=1`);
}

import { getProviderDisplayName } from "@/lib/provider-profiles";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  sendCustomerTrialReservationCancellationEmail,
  sendTeacherTrialReservationCancellationEmail,
} from "@/lib/trial-reservation-emails";

type TrialReservationRow = {
  id: string;
  course_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  cancelled_at: string | null;
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
  provider_type: "independent_teacher" | "studio_provider" | null;
  organization_name: string | null;
  photo_url: string | null;
};

function logCancellationError(context: string, error: unknown) {
  if (process.env.NODE_ENV === "production") return;
  const supabaseError = (error ?? {}) as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  };
  console.error("[trial cancellation]", {
    context,
    message: supabaseError.message,
    code: supabaseError.code,
    details: supabaseError.details,
    hint: supabaseError.hint,
  });
}

function logCancellationInfo(message: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.log("[trial cancellation]", message, payload);
}

async function loadMailContext(admin: ReturnType<typeof createSupabaseAdmin>, courseId: string) {
  const { data: course, error: courseError } = await admin
    .from("courses")
    .select("id,title,location,teacher_id")
    .eq("id", courseId)
    .maybeSingle<CourseMailRow>();

  if (courseError || !course) {
    logCancellationError("load-mail-course", courseError);
    return null;
  }

  let teacherName: string | null = null;
  let teacherEmail: string | null = null;
  let providerType: "independent_teacher" | "studio_provider" | null = null;
  let providerName: string | null = null;
  let senderDisplayName: string | null = null;
  let senderImageUrl: string | null = null;

  if (course.teacher_id) {
    const [{ data: profile }, authResult] = await Promise.all([
      admin
        .from("profiles")
        .select("first_name,last_name,provider_type,organization_name,photo_url")
        .eq("id", course.teacher_id)
        .maybeSingle<ProfileRow>(),
      admin.auth.admin.getUserById(course.teacher_id),
    ]);

    const nameParts = [profile?.first_name, profile?.last_name].filter(Boolean);
    teacherName = nameParts.length > 0 ? nameParts.join(" ") : null;
    teacherEmail = authResult.data.user?.email ?? null;
    providerType = profile?.provider_type ?? null;
    providerName =
      profile?.provider_type ? getProviderDisplayName(profile.provider_type, profile) : null;
    senderDisplayName = providerType === "studio_provider" ? providerName : teacherName;
    senderImageUrl = profile?.photo_url ?? null;
  }

  return {
    courseTitle: course.title ?? "Kurs",
    location: course.location,
    teacherName,
    teacherEmail,
    providerType,
    providerName,
    senderDisplayName,
    senderImageUrl,
  };
}

export async function cancelTrialReservationById(input: {
  reservationId: string;
  actorLabel: "teacher_dashboard" | "public_cancel";
}) {
  const admin = createSupabaseAdmin();
  const { data: reservation } = await admin
    .from("trial_reservations")
    .select("id,course_id,first_name,last_name,email,trial_starts_at,trial_ends_at,cancelled_at")
    .eq("id", input.reservationId)
    .maybeSingle<TrialReservationRow>();

  if (!reservation) {
    return { ok: false as const, reason: "not_found" as const };
  }

  if (reservation.cancelled_at) {
    return { ok: false as const, reason: "already_cancelled" as const };
  }

  const cancelledAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from("trial_reservations")
    .update({
      cancelled_at: cancelledAt,
      status: "cancelled",
      decision_status: "rejected",
      decision_taken_at: cancelledAt,
      rejected_at: cancelledAt,
      approved_at: null,
      registration_token: null,
      registration_expires_at: null,
      approval_email_sent_at: null,
    })
    .eq("id", reservation.id)
    .is("cancelled_at", null);

  if (updateError) {
    logCancellationError("cancel-reservation", updateError);
    return { ok: false as const, reason: "update_failed" as const };
  }

  const { error: ticketUpdateError } = await admin
    .from("tickets")
    .update({ status: "cancelled" })
    .eq("trial_reservation_id", reservation.id)
    .in("status", ["issued", "checked_in"]);

  if (ticketUpdateError) {
    logCancellationError("cancel-trial-ticket", ticketUpdateError);
  }

  const mailContext = await loadMailContext(admin, reservation.course_id);
  if (mailContext && reservation.email && reservation.trial_starts_at && reservation.trial_ends_at) {
    const mailData = {
      reservationId: reservation.id,
      courseTitle: mailContext.courseTitle,
      providerType: mailContext.providerType,
      providerName: mailContext.providerName,
      teacherName: mailContext.teacherName,
      teacherEmail: mailContext.teacherEmail,
      senderDisplayName: mailContext.senderDisplayName,
      senderImageUrl: mailContext.senderImageUrl,
      customerName: [reservation.first_name, reservation.last_name].filter(Boolean).join(" ").trim(),
      customerEmail: reservation.email,
      location: mailContext.location,
      trialStartsAt: reservation.trial_starts_at,
      trialEndsAt: reservation.trial_ends_at,
      cancelUrl: "",
    };

    try {
      logCancellationInfo("teacher cancellation email attempt", {
        reservationId: reservation.id,
        recipient: mailContext.teacherEmail,
        actor: input.actorLabel,
      });
      await sendTeacherTrialReservationCancellationEmail(mailData);
    } catch (error) {
      logCancellationError("send-teacher-cancellation", error);
    }

    try {
      logCancellationInfo("customer cancellation email attempt", {
        reservationId: reservation.id,
        recipient: reservation.email,
        actor: input.actorLabel,
      });
      await sendCustomerTrialReservationCancellationEmail(mailData);
    } catch (error) {
      logCancellationError("send-customer-cancellation", error);
    }
  }

  return { ok: true as const, reservationId: reservation.id, courseId: reservation.course_id };
}

"use server";

import { redirect } from "next/navigation";
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
};

type SupabaseLikeError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function logCancellationError(context: string, error: unknown) {
  if (process.env.NODE_ENV === "production") return;
  const supabaseError = (error ?? {}) as SupabaseLikeError;
  console.error("[trial cancellation]", {
    context,
    message: supabaseError.message,
    code: supabaseError.code,
    details: supabaseError.details,
    hint: supabaseError.hint,
  });
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

export async function confirmTrialCancellationAction(token: string) {
  const admin = createSupabaseAdmin();

  const { data: reservation } = await admin
    .from("trial_reservations")
    .select("id,course_id,first_name,last_name,email,trial_starts_at,trial_ends_at,cancelled_at")
    .eq("cancel_token", token)
    .maybeSingle<TrialReservationRow>();

  if (!reservation) {
    redirect(`/trial/cancel/${token}?invalid=1`);
  }

  if (reservation.cancelled_at) {
    redirect(`/trial/cancel/${token}?already=1`);
  }

  const cancelledAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from("trial_reservations")
    .update({
      cancelled_at: cancelledAt,
      status: "cancelled",
    })
    .eq("id", reservation.id)
    .is("cancelled_at", null);

  if (updateError) {
    logCancellationError("cancel-reservation", updateError);
    redirect(`/trial/cancel/${token}?error=1`);
  }

  const { error: ticketUpdateError } = await admin
    .from("tickets")
    .update({ status: "cancelled" })
    .eq("trial_reservation_id", reservation.id)
    .eq("status", "issued");

  if (ticketUpdateError) {
    logCancellationError("cancel-trial-ticket", ticketUpdateError);
  }

  const mailContext = await loadMailContext(admin, reservation.course_id);
  if (mailContext && reservation.email && reservation.trial_starts_at && reservation.trial_ends_at) {
    const mailData = {
      reservationId: reservation.id,
      courseTitle: mailContext.courseTitle,
      teacherName: mailContext.teacherName,
      teacherEmail: mailContext.teacherEmail,
      customerName: [reservation.first_name, reservation.last_name].filter(Boolean).join(" ").trim(),
      customerEmail: reservation.email,
      location: mailContext.location,
      trialStartsAt: reservation.trial_starts_at,
      trialEndsAt: reservation.trial_ends_at,
      cancelUrl: "",
    };

    try {
      await sendTeacherTrialReservationCancellationEmail(mailData);
    } catch (error) {
      logCancellationError("send-teacher-cancellation", error);
    }

    try {
      await sendCustomerTrialReservationCancellationEmail(mailData);
    } catch (error) {
      logCancellationError("send-customer-cancellation", error);
    }
  }

  redirect(`/trial/cancel/${token}?done=1`);
}

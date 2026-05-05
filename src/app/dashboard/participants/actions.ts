"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import {
  getFirstDayOfNextMonthDate,
  isFirstDayOfMonthDate,
  isLastDayOfMonthDate,
  toCourseLifecycleDate,
} from "@/lib/course-lifecycle-shared";
import { getProviderDisplayName } from "@/lib/provider-profiles";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cancelTrialReservationById } from "@/lib/trial-reservation-cancellation";
import {
  sendTrialRegistrationApprovedEmail,
  sendTrialRegistrationRejectedEmail,
} from "@/lib/trial-reservation-emails";

type ReservationMailRow = {
  id: string;
  course_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status: string | null;
  decision_status: string | null;
  trial_ends_at: string | null;
  cancelled_at: string | null;
};

type CourseMailRow = {
  id: string;
  title: string | null;
  teacher_id: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: "independent_teacher" | "studio_provider" | null;
  organization_name: string | null;
  photo_url: string | null;
};

type SupabaseLikeError = {
  name?: string;
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  stack?: string;
};

function logDecisionError(context: string, error: unknown) {
  if (process.env.NODE_ENV === "production") return;
  const fallback =
    typeof error === "object" && error !== null ? (error as Record<string, unknown>) : undefined;
  const supabaseError = (error ?? {}) as SupabaseLikeError;
  console.error("[trial decision]", {
    context,
    name:
      supabaseError.name ??
      (error instanceof Error ? error.name : undefined) ??
      (typeof fallback?.name === "string" ? fallback.name : undefined),
    message:
      supabaseError.message ??
      (error instanceof Error ? error.message : undefined) ??
      (typeof fallback?.message === "string" ? fallback.message : undefined),
    code: supabaseError.code ?? (typeof fallback?.code === "string" ? fallback.code : undefined),
    details:
      supabaseError.details ?? (typeof fallback?.details === "string" ? fallback.details : undefined),
    hint: supabaseError.hint ?? (typeof fallback?.hint === "string" ? fallback.hint : undefined),
    stack:
      supabaseError.stack ??
      (error instanceof Error ? error.stack : undefined) ??
      (typeof fallback?.stack === "string" ? fallback.stack : undefined),
    raw: fallback,
  });
}

function logDecisionInfo(message: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.log("[trial decision]", message, payload);
}

function generateRegistrationToken(): string {
  return randomBytes(24).toString("hex");
}

function withSavedParam(targetPath: string, value: string) {
  return `${targetPath}${targetPath.includes("?") ? "&" : "?"}saved=${value}`;
}

async function requireTeacher() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

async function loadReservationContext(admin: ReturnType<typeof createSupabaseAdmin>, reservationId: string) {
  const { data: reservation, error: reservationError } = await admin
    .from("trial_reservations")
    .select("id,course_id,first_name,last_name,email,status,decision_status,trial_ends_at,cancelled_at")
    .eq("id", reservationId)
    .maybeSingle<ReservationMailRow>();

  if (reservationError || !reservation) {
    logDecisionError("load-reservation", reservationError);
    return null;
  }

  const { data: course, error: courseError } = await admin
    .from("courses")
    .select("id,title,teacher_id")
    .eq("id", reservation.course_id)
    .maybeSingle<CourseMailRow>();

  if (courseError || !course) {
    logDecisionError("load-course", courseError);
    return null;
  }

  const { data: profile } = course.teacher_id
    ? await admin
        .from("profiles")
        .select("first_name,last_name,provider_type,organization_name,photo_url")
        .eq("id", course.teacher_id)
        .maybeSingle<ProfileRow>()
    : { data: null };

  const teacherName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || null;
  const providerName =
    profile?.provider_type ? getProviderDisplayName(profile.provider_type, profile) : null;

  return {
    reservation,
    course,
    senderDisplayName: profile?.provider_type === "studio_provider" ? providerName : teacherName,
    senderImageUrl: profile?.photo_url ?? null,
  };
}

async function hasCheckedInTrialTicket(
  admin: ReturnType<typeof createSupabaseAdmin>,
  reservationId: string
): Promise<boolean> {
  const { data } = await admin
    .from("tickets")
    .select("id,status")
    .eq("trial_reservation_id", reservationId)
    .maybeSingle<{ id: string; status: string | null }>();

  return data?.status === "checked_in";
}

async function assertTeacherOwnsReservation(teacherId: string, reservationId: string) {
  const admin = createSupabaseAdmin();
  const context = await loadReservationContext(admin, reservationId);
  if (!context) {
    return { ok: false, admin, context: null };
  }

  if (context.course.teacher_id !== teacherId) {
    return { ok: false, admin, context: null };
  }

  return { ok: true, admin, context };
}

function getCustomerName(reservation: ReservationMailRow): string {
  return [reservation.first_name, reservation.last_name].filter(Boolean).join(" ").trim() || "dein Kind";
}

function canTakeDecision(reservation: ReservationMailRow): boolean {
  return !reservation.cancelled_at && (reservation.decision_status ?? "pending") === "pending";
}

export async function approveTrialReservationAction(formData: FormData) {
  const reservationId = String(formData.get("reservationId") ?? "").trim();
  const redirectTo = String(formData.get("redirect_to") ?? "").trim() || "/dashboard/participants";
  if (!reservationId) {
    redirect(redirectTo);
  }

  const user = await requireTeacher();
  const { ok, admin, context } = await assertTeacherOwnsReservation(user.id, reservationId);

  if (!ok || !context || !canTakeDecision(context.reservation)) {
    redirect(
      context?.reservation?.cancelled_at
        ? withSavedParam(redirectTo, "cancelled")
        : redirectTo
    );
  }

  const checkedIn = await hasCheckedInTrialTicket(admin, reservationId);
  if (!checkedIn) {
    redirect(withSavedParam(redirectTo, "attendance_required"));
  }

  const registrationToken = generateRegistrationToken();
  const approvedAt = new Date().toISOString();
  const registrationExpiresAt = new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString();

  logDecisionInfo("approval token generated", {
    reservationId,
    customerEmail: context.reservation.email,
    registrationToken,
    registrationExpiresAt,
  });

  const { error } = await admin
    .from("trial_reservations")
    .update({
      status: "approved",
      decision_status: "approved",
      decision_taken_at: approvedAt,
      decided_by: user.id,
      approved_at: approvedAt,
      rejected_at: null,
      registration_token: registrationToken,
      registration_expires_at: registrationExpiresAt,
      registration_reminder_24h_sent_at: null,
      registration_reminder_48h_sent_at: null,
      registration_reminder_72h_sent_at: null,
      registration_expired_email_sent_at: null,
      teacher_decision_reminder_sent_at: null,
      rejection_email_sent_at: null,
    })
    .eq("id", reservationId)
    .eq("decision_status", "pending");

  if (error) {
    logDecisionError("approve-reservation", error);
    redirect(redirectTo);
  }

  if (context.reservation.email) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const registrationUrl = `${siteUrl}/trial/register/${registrationToken}`;

    try {
      logDecisionInfo("approval email attempt", {
        reservationId: context.reservation.id,
        recipient: context.reservation.email,
        registrationUrl,
      });

      const result = await sendTrialRegistrationApprovedEmail({
        reservationId: context.reservation.id,
        courseTitle: context.course.title ?? "Kurs",
        senderDisplayName: context.senderDisplayName,
        senderImageUrl: context.senderImageUrl,
        customerName: getCustomerName(context.reservation),
        customerEmail: context.reservation.email,
        registrationUrl,
        registrationExpiresAt,
      });

      if (result?.error) {
        throw result.error;
      }

      logDecisionInfo("approval email sent", {
        reservationId: context.reservation.id,
        recipient: context.reservation.email,
        messageId: result?.data?.id ?? null,
      });

      await admin
        .from("trial_reservations")
        .update({ approval_email_sent_at: new Date().toISOString() })
        .eq("id", reservationId)
        .eq("decision_status", "approved");
    } catch (sendError) {
      logDecisionInfo("approval email failed", {
        reservationId: context.reservation.id,
        recipient: context.reservation.email,
        registrationUrl,
      });
      logDecisionError("send-approval-email", sendError);
    }
  } else {
    logDecisionInfo("approval email skipped", {
      reservationId: context.reservation.id,
      reason: "missing customer email",
    });
  }

  redirect(withSavedParam(redirectTo, "approved"));
}

export async function rejectTrialReservationAction(formData: FormData) {
  const reservationId = String(formData.get("reservationId") ?? "").trim();
  const redirectTo = String(formData.get("redirect_to") ?? "").trim() || "/dashboard/participants";
  if (!reservationId) {
    redirect(redirectTo);
  }

  const user = await requireTeacher();
  const { ok, admin, context } = await assertTeacherOwnsReservation(user.id, reservationId);

  if (!ok || !context || !canTakeDecision(context.reservation)) {
    redirect(
      context?.reservation?.cancelled_at
        ? withSavedParam(redirectTo, "cancelled")
        : redirectTo
    );
  }

  const checkedIn = await hasCheckedInTrialTicket(admin, reservationId);
  if (!checkedIn) {
    redirect(withSavedParam(redirectTo, "attendance_required"));
  }

  const rejectedAt = new Date().toISOString();
  const { error } = await admin
    .from("trial_reservations")
    .update({
      status: "rejected",
      decision_status: "rejected",
      decision_taken_at: rejectedAt,
      decided_by: user.id,
      approved_at: null,
      rejected_at: rejectedAt,
      registration_token: null,
      registration_expires_at: null,
      approval_email_sent_at: null,
    })
    .eq("id", reservationId)
    .eq("decision_status", "pending");

  if (error) {
    logDecisionError("reject-reservation", error);
    redirect(redirectTo);
  }

  if (context.reservation.email) {
    try {
      await sendTrialRegistrationRejectedEmail({
        reservationId: context.reservation.id,
        courseTitle: context.course.title ?? "Kurs",
        senderDisplayName: context.senderDisplayName,
        senderImageUrl: context.senderImageUrl,
        customerName: getCustomerName(context.reservation),
        customerEmail: context.reservation.email,
      });

      await admin
        .from("trial_reservations")
        .update({ rejection_email_sent_at: new Date().toISOString() })
        .eq("id", reservationId)
        .eq("decision_status", "rejected");
    } catch (sendError) {
      logDecisionError("send-rejection-email", sendError);
    }
  }

  redirect(withSavedParam(redirectTo, "rejected"));
}

export async function cancelTrialReservationAction(formData: FormData) {
  const reservationId = String(formData.get("reservationId") ?? "").trim();
  const redirectTo = String(formData.get("redirect_to") ?? "").trim() || "/dashboard/participants";

  if (!reservationId) {
    redirect(withSavedParam(redirectTo, "trial_cancel_invalid"));
  }

  const user = await requireTeacher();
  const { ok, context } = await assertTeacherOwnsReservation(user.id, reservationId);

  if (!ok || !context) {
    redirect(withSavedParam(redirectTo, "trial_cancel_invalid"));
  }

  const result = await cancelTrialReservationById({
    reservationId,
    actorLabel: "teacher_dashboard",
  });

  if (!result.ok) {
    redirect(
      withSavedParam(
        redirectTo,
        result.reason === "already_cancelled" ? "cancelled" : "trial_cancel_error"
      )
    );
  }

  redirect(withSavedParam(redirectTo, "trial_cancelled"));
}

"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
};

type CourseMailRow = {
  id: string;
  title: string | null;
  teacher_id: string | null;
};

type SupabaseLikeError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function logDecisionError(context: string, error: unknown) {
  if (process.env.NODE_ENV === "production") return;
  const supabaseError = (error ?? {}) as SupabaseLikeError;
  console.error("[trial decision]", {
    context,
    message: supabaseError.message,
    code: supabaseError.code,
    details: supabaseError.details,
    hint: supabaseError.hint,
  });
}

function generateRegistrationToken(): string {
  return randomBytes(24).toString("hex");
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
    .select("id,course_id,first_name,last_name,email,status")
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

  return { reservation, course };
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

export async function approveTrialReservationAction(formData: FormData) {
  const reservationId = String(formData.get("reservationId") ?? "").trim();
  if (!reservationId) {
    redirect("/dashboard/participants");
  }

  const user = await requireTeacher();
  const { ok, admin, context } = await assertTeacherOwnsReservation(user.id, reservationId);

  if (!ok || !context || context.reservation.status !== "pending") {
    redirect("/dashboard/participants");
  }

  const registrationToken = generateRegistrationToken();
  const approvedAt = new Date().toISOString();
  const registrationExpiresAt = new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString();

  const { error } = await admin
    .from("trial_reservations")
    .update({
      status: "approved",
      approved_at: approvedAt,
      rejected_at: null,
      registration_token: registrationToken,
      registration_expires_at: registrationExpiresAt,
    })
    .eq("id", reservationId);

  if (error) {
    logDecisionError("approve-reservation", error);
    redirect("/dashboard/participants");
  }

  if (context.reservation.email) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const registrationUrl = `${siteUrl}/trial/register/${registrationToken}`;

    try {
      await sendTrialRegistrationApprovedEmail({
        reservationId: context.reservation.id,
        courseTitle: context.course.title ?? "Kurs",
        customerName: getCustomerName(context.reservation),
        customerEmail: context.reservation.email,
        registrationUrl,
        registrationExpiresAt,
      });
    } catch (sendError) {
      logDecisionError("send-approval-email", sendError);
    }
  }

  redirect("/dashboard/participants?approved=1");
}

export async function rejectTrialReservationAction(formData: FormData) {
  const reservationId = String(formData.get("reservationId") ?? "").trim();
  if (!reservationId) {
    redirect("/dashboard/participants");
  }

  const user = await requireTeacher();
  const { ok, admin, context } = await assertTeacherOwnsReservation(user.id, reservationId);

  if (!ok || !context || context.reservation.status !== "pending") {
    redirect("/dashboard/participants");
  }

  const rejectedAt = new Date().toISOString();
  const { error } = await admin
    .from("trial_reservations")
    .update({
      status: "rejected",
      approved_at: null,
      rejected_at: rejectedAt,
      registration_token: null,
      registration_expires_at: null,
    })
    .eq("id", reservationId);

  if (error) {
    logDecisionError("reject-reservation", error);
    redirect("/dashboard/participants");
  }

  if (context.reservation.email) {
    try {
      await sendTrialRegistrationRejectedEmail({
        reservationId: context.reservation.id,
        courseTitle: context.course.title ?? "Kurs",
        customerName: getCustomerName(context.reservation),
        customerEmail: context.reservation.email,
      });
    } catch (sendError) {
      logDecisionError("send-rejection-email", sendError);
    }
  }

  redirect("/dashboard/participants?rejected=1");
}

"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type Stripe from "stripe";
import { getParticipantArchiveEligibility } from "@/app/dashboard/archive-rules";
import { formatMoney } from "@/lib/course-display";
import { mirrorStripeRefundToLedger } from "@/lib/payments/ledger";
import { paymentService } from "@/lib/payments/payment-service";
import { getProviderDisplayName } from "@/lib/provider-profiles";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cancelTrialReservationById } from "@/lib/trial-reservation-cancellation";
import {
  sendTrialRegistrationApprovedEmail,
  sendTrialRegistrationRejectedEmail,
} from "@/lib/trial-reservation-emails";
import { sendWorkshopCancellationEmail } from "@/lib/workshop-booking-emails";

type ReservationMailRow = {
  id: string;
  course_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  is_simulation?: boolean | null;
  status: string | null;
  decision_status: string | null;
  trial_ends_at: string | null;
  cancelled_at: string | null;
  archived_at?: string | null;
};

type CourseMailRow = {
  id: string;
  title: string | null;
  teacher_id: string | null;
  kind?: string | null;
  instructor_name?: string | null;
  location?: string | null;
  location_details?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  price_cents?: number | null;
  currency?: string | null;
  offer_image_url?: string | null;
};

type WorkshopParticipantBookingRow = {
  id: string;
  course_id: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  is_simulation?: boolean | null;
  status: string | null;
  payment_status: string | null;
  stripe_session_id: string | null;
  refunded_at: string | null;
  stripe_refund_id: string | null;
  archived_at: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: "independent_teacher" | "studio_provider" | null;
  organization_name: string | null;
  photo_url: string | null;
  company_logo_url?: string | null;
  email?: string | null;
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
    .select("id,course_id,first_name,last_name,email,is_simulation,status,decision_status,trial_ends_at,cancelled_at,archived_at")
    .eq("id", reservationId)
    .maybeSingle<ReservationMailRow>();

  if (reservationError || !reservation) {
    logDecisionError("load-reservation", reservationError);
    return null;
  }

  const { data: course, error: courseError } = await admin
    .from("courses")
    .select("id,title,teacher_id,kind,instructor_name,location,location_details,starts_at,ends_at,price_cents,currency,offer_image_url")
    .eq("id", reservation.course_id)
    .maybeSingle<CourseMailRow>();

  if (courseError || !course) {
    logDecisionError("load-course", courseError);
    return null;
  }

  const { data: profile } = course.teacher_id
    ? await admin
        .from("profiles")
        .select("first_name,last_name,provider_type,organization_name,photo_url,company_logo_url,email")
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

function getBookingCustomerName(booking: WorkshopParticipantBookingRow): string {
  return [booking.customer_first_name, booking.customer_last_name].filter(Boolean).join(" ").trim() || "Teilnehmende";
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

  if (context.reservation.email && !context.reservation.is_simulation) {
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

  if (context.reservation.email && !context.reservation.is_simulation) {
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

export async function cancelWorkshopParticipantBookingAction(formData: FormData) {
  const bookingId = String(formData.get("booking_id") ?? "").trim();
  const redirectTo = String(formData.get("redirect_to") ?? "").trim() || "/dashboard/participants";

  if (!bookingId) {
    redirect(withSavedParam(redirectTo, "workshop_participant_cancel_invalid"));
  }

  const user = await requireTeacher();
  const admin = createSupabaseAdmin();

  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id,course_id,customer_first_name,customer_last_name,customer_email,is_simulation,status,payment_status,stripe_session_id,refunded_at,stripe_refund_id,archived_at"
    )
    .eq("id", bookingId)
    .maybeSingle<WorkshopParticipantBookingRow>();

  if (!booking?.course_id || booking.archived_at) {
    redirect(withSavedParam(redirectTo, "workshop_participant_cancel_invalid"));
  }

  const { data: course } = await admin
    .from("courses")
    .select("id,title,teacher_id,kind,instructor_name,location,location_details,starts_at,ends_at,price_cents,currency,offer_image_url")
    .eq("id", booking.course_id)
    .maybeSingle<CourseMailRow>();

  if (
    !course ||
    course.teacher_id !== user.id ||
    (course.kind !== "workshop" && course.kind !== "exclusive_offer")
  ) {
    redirect(withSavedParam(redirectTo, "workshop_participant_cancel_invalid"));
  }

  if (
    booking.status === "cancelled" ||
    booking.status === "refunded" ||
    booking.payment_status === "cancelled" ||
    booking.payment_status === "refunded" ||
    booking.refunded_at ||
    booking.stripe_refund_id
  ) {
    redirect(withSavedParam(redirectTo, "workshop_participant_already_cancelled"));
  }

  const now = new Date().toISOString();
  const isFreeBooking = booking.payment_status === "free";
  const recipientEmail = booking.customer_email?.trim();
  let savedStatus = "workshop_participant_cancelled";
  let refunded = false;
  let refundAmountLabel: string | null = null;

  const { data: profile } = course.teacher_id
    ? await admin
        .from("profiles")
        .select("first_name,last_name,provider_type,organization_name,photo_url,company_logo_url,email")
        .eq("id", course.teacher_id)
        .maybeSingle<ProfileRow>()
    : { data: null };
  const teacherName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || null;
  const providerName = profile?.provider_type ? getProviderDisplayName(profile.provider_type, profile) : null;

  if (isFreeBooking || !booking.stripe_session_id) {
    const { error: bookingUpdateError } = await admin
      .from("bookings")
      .update({
        status: "cancelled",
        payment_status: isFreeBooking ? "cancelled" : "refund_pending",
      })
      .eq("id", booking.id)
      .eq("course_id", course.id);

    if (bookingUpdateError) {
      redirect(withSavedParam(redirectTo, "workshop_participant_cancel_error"));
    }

    savedStatus = isFreeBooking
      ? "workshop_participant_cancelled_free"
      : "workshop_participant_refund_pending";
  } else {
    try {
      const refund = await paymentService.refundPayment({
        provider: "stripe",
        referenceType: "checkout_session",
        referenceId: booking.stripe_session_id,
      });

      if (refund.raw) {
        try {
          await mirrorStripeRefundToLedger({
            bookingId: booking.id,
            checkoutSessionId: booking.stripe_session_id,
            refund: refund.raw as Stripe.Refund,
          });
        } catch {
          // The Stripe refund is the source of truth; keep the booking refunded even if ledger mirroring needs repair.
        }
      }

      const { error: bookingUpdateError } = await admin
        .from("bookings")
        .update({
          status: "refunded",
          payment_status: "refunded",
          refunded_at: now,
          stripe_refund_id: refund.refundId,
          refund_amount_cents: refund.amountCents,
        })
        .eq("id", booking.id)
        .eq("course_id", course.id);

      if (bookingUpdateError) {
        redirect(withSavedParam(redirectTo, "workshop_participant_cancel_error"));
      }

      savedStatus = "workshop_participant_refunded";
      refunded = true;
      refundAmountLabel =
        typeof refund.amountCents === "number" ? formatMoney(refund.amountCents, course.currency ?? "EUR") : null;
    } catch {
      const { error: pendingUpdateError } = await admin
        .from("bookings")
        .update({
          status: "cancelled",
          payment_status: "refund_pending",
        })
        .eq("id", booking.id)
        .eq("course_id", course.id);

      if (pendingUpdateError) {
        redirect(withSavedParam(redirectTo, "workshop_participant_cancel_error"));
      }

      savedStatus = "workshop_participant_refund_pending";
    }
  }

  await admin.from("tickets").update({ status: "cancelled" }).eq("booking_id", booking.id);

  if (recipientEmail && !booking.is_simulation) {
    try {
      await sendWorkshopCancellationEmail({
        customerEmail: recipientEmail,
        customerName: getBookingCustomerName(booking),
        workshopTitle: course.title,
        providerType: profile?.provider_type ?? null,
        providerName,
        teacherName: course.instructor_name ?? teacherName,
        teacherEmail: profile?.email ?? null,
        senderImageUrl: profile?.photo_url ?? null,
        providerLogoUrl: profile?.company_logo_url ?? null,
        offerImageUrl: course.offer_image_url ?? null,
        location: course.location ?? null,
        locationDetails: course.location_details ?? null,
        startsAt: course.starts_at ?? null,
        endsAt: course.ends_at ?? null,
        priceLabel: typeof course.price_cents === "number" ? formatMoney(course.price_cents, course.currency ?? "EUR") : null,
        paymentStatus: booking.payment_status === "free" ? "free" : "paid",
        refundAmountLabel,
        refunded,
      });
    } catch {
      // The cancellation itself must not be rolled back because of a notification failure.
    }
  }

  revalidatePath("/dashboard/participants");
  revalidatePath(`/dashboard/participants/${booking.id}`);
  revalidatePath(`/dashboard/courses/${course.id}`);
  redirect(withSavedParam(redirectTo, savedStatus));
}

export async function archiveParticipantAction(formData: FormData) {
  const participantId = String(formData.get("participant_id") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();
  const redirectTo = String(formData.get("redirect_to") ?? "").trim() || "/dashboard/participants";

  if (!participantId || (source !== "trial" && source !== "registered" && source !== "workshop")) {
    redirect(withSavedParam(redirectTo, "participant_archive_invalid"));
  }

  const user = await requireTeacher();
  const admin = createSupabaseAdmin();
  const archivedAt = new Date().toISOString();

  if (source === "workshop") {
    const { data: booking } = await admin
      .from("bookings")
      .select("id,course_id,status,checked_in_at,refunded_at,stripe_refund_id,archived_at")
      .eq("id", participantId)
      .maybeSingle<{
        id: string;
        course_id: string | null;
        status: string | null;
        checked_in_at: string | null;
        refunded_at: string | null;
        stripe_refund_id: string | null;
        archived_at: string | null;
      }>();

    if (!booking?.course_id) {
      redirect(withSavedParam(redirectTo, "participant_archive_invalid"));
    }

    const { data: course } = await admin
      .from("courses")
      .select("teacher_id")
      .eq("id", booking.course_id)
      .maybeSingle<{ teacher_id: string | null }>();

    const eligibility = getParticipantArchiveEligibility({
      source: "workshop",
      archivedAt: booking.archived_at,
      bookingStatus: booking.status,
      checkedInAt: booking.checked_in_at,
      refundedAt: booking.refunded_at,
      stripeRefundId: booking.stripe_refund_id,
    });

    if (!course || course.teacher_id !== user.id || !eligibility.allowed) {
      redirect(withSavedParam(redirectTo, "participant_archive_invalid"));
    }

    const { error } = await admin.from("bookings").update({ archived_at: archivedAt }).eq("id", booking.id);
    if (error) {
      redirect(withSavedParam(redirectTo, "participant_archive_error"));
    }

    revalidatePath("/dashboard/participants");
    redirect(withSavedParam("/dashboard/participants", "participant_archived"));
  }

  const { ok, context } = await assertTeacherOwnsReservation(user.id, participantId);
  if (!ok || !context) {
    redirect(withSavedParam(redirectTo, "participant_archive_invalid"));
  }

  if (source === "trial") {
    const checkedIn = await hasCheckedInTrialTicket(admin, participantId);
    const { data: completedIntent } = await admin
      .from("course_registration_intents")
      .select("id,status")
      .eq("trial_reservation_id", participantId)
      .eq("status", "checkout_completed")
      .maybeSingle<{ id: string; status: string | null }>();

    const eligibility = getParticipantArchiveEligibility({
      source: "trial",
      archivedAt: context.reservation.archived_at ?? null,
      decisionStatus: context.reservation.decision_status,
      cancelledAt: context.reservation.cancelled_at,
      checkedInAt: checkedIn ? new Date().toISOString() : null,
      hasCompletedRegistration: Boolean(completedIntent),
    });

    if (!eligibility.allowed) {
      redirect(withSavedParam(redirectTo, "participant_archive_invalid"));
    }

    const { error } = await admin.from("trial_reservations").update({ archived_at: archivedAt }).eq("id", participantId);
    if (error) {
      redirect(withSavedParam(redirectTo, "participant_archive_error"));
    }

    revalidatePath("/dashboard/participants");
    redirect(withSavedParam("/dashboard/participants", "participant_archived"));
  }

  const { data: subscription } = await admin
    .from("course_registration_intents")
    .select("id,status,subscription_status,stripe_subscription_id,completed_at,archived_at")
    .eq("trial_reservation_id", participantId)
    .maybeSingle<{
      id: string;
      status: string | null;
      subscription_status: string | null;
      stripe_subscription_id: string | null;
      completed_at: string | null;
      archived_at: string | null;
    }>();

  const eligibility = getParticipantArchiveEligibility({
    source: "registered",
    archivedAt: subscription?.archived_at ?? null,
    subscriptionStatus: subscription?.subscription_status ?? null,
    stripeSubscriptionId: subscription?.stripe_subscription_id ?? null,
    completedAt: subscription?.completed_at ?? null,
  });

  if (!subscription || subscription.status !== "checkout_completed" || !eligibility.allowed) {
    redirect(withSavedParam(redirectTo, "participant_archive_invalid"));
  }

  const { error: reservationError } = await admin
    .from("trial_reservations")
    .update({ archived_at: archivedAt })
    .eq("id", participantId);
  const { error: intentError } = await admin
    .from("course_registration_intents")
    .update({ archived_at: archivedAt })
    .eq("id", subscription.id);

  if (reservationError || intentError) {
    redirect(withSavedParam(redirectTo, "participant_archive_error"));
  }

  revalidatePath("/dashboard/participants");
  redirect(withSavedParam("/dashboard/participants", "participant_archived"));
}

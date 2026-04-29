"use server";

import { redirect } from "next/navigation";
import { sendCoursePauseNotificationEmail, sendCourseStopNotificationEmail } from "@/lib/course-lifecycle-emails";
import { getStripe } from "@/lib/stripe";
import {
  CourseStatus,
  formatCourseLifecycleDate,
  getFirstDayOfNextMonthDate,
  getNextPossiblePauseDate,
  isFirstDayOfMonthDate,
  isLastDayOfMonthDate,
  toCourseLifecycleDate,
} from "@/lib/course-lifecycle";
import { getCourseTerminationModelValue, getWorkshopCancellationPolicyValue } from "@/lib/offer-policies";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendWorkshopCancellationEmail } from "@/lib/workshop-booking-emails";

type CourseOwnerRow = {
  id: string;
  title: string | null;
  kind: string | null;
  teacher_id: string;
  status: CourseStatus;
  is_published: boolean | null;
  pause_start_date: string | null;
  pause_end_date: string | null;
  stop_date: string | null;
  cancellation_model: string | null;
  workshop_storno_policy: string | null;
};

type RegistrationIntentSubscriptionRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  stripe_subscription_id: string | null;
};

type TrialRecipientRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  converted_at: string | null;
  cancelled_at: string | null;
};

type WorkshopBookingRefundRow = {
  id: string;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  status: string | null;
  stripe_session_id: string | null;
  refunded_at: string | null;
  stripe_refund_id: string | null;
};

type PublishMode = "play";

function withSavedParam(targetPath: string, value: string) {
  return `${targetPath}${targetPath.includes("?") ? "&" : "?"}saved=${value}`;
}

function toStopDateEndUnix(stopDate: string): number {
  return Math.floor(new Date(`${stopDate}T23:59:59.999+01:00`).getTime() / 1000);
}

function formatRecipientName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "Kursteilnehmer*in";
}

async function requireOwnedCourse(courseId: string) {
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdmin();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: course } = await admin
    .from("courses")
    .select(
      "id,title,kind,teacher_id,status,is_published,pause_start_date,pause_end_date,stop_date,cancellation_model,workshop_storno_policy"
    )
    .eq("id", courseId)
    .eq("teacher_id", user.id)
    .maybeSingle<CourseOwnerRow>();

  return { admin, user, course };
}

export async function setCoursePublishStateAction(formData: FormData) {
  const courseId = String(formData.get("course_id") || "").trim();
  const mode = String(formData.get("mode") || "").trim() as PublishMode;
  const redirectTo = String(formData.get("redirect_to") || "").trim();
  const targetPath = redirectTo || `/dashboard/courses/${courseId}`;

  if (!courseId || mode !== "play") {
    redirect("/dashboard");
  }

  const { admin, user, course } = await requireOwnedCourse(courseId);

  if (!course || course.status !== "draft") {
    redirect(withSavedParam(targetPath, "play_invalid"));
  }

  const missingWorkshopPolicy =
    course.kind === "workshop" &&
    !getWorkshopCancellationPolicyValue({ cancellation_policy: course.workshop_storno_policy });
  const missingCoursePolicy =
    course.kind === "course" &&
    !getCourseTerminationModelValue({ termination_model: course.cancellation_model });

  if (missingWorkshopPolicy || missingCoursePolicy) {
    redirect(withSavedParam(targetPath, "missing_policy"));
  }

  const { error } = await admin
    .from("courses")
    .update({
      status: "active",
      is_published: true,
      pause_start_date: null,
      pause_end_date: null,
      stop_date: null,
    })
    .eq("id", courseId)
    .eq("teacher_id", user.id);

  if (error) {
    redirect(withSavedParam(targetPath, "play_error"));
  }

  redirect(withSavedParam(targetPath, "play_started"));
}

export async function scheduleCoursePauseAction(formData: FormData) {
  const courseId = String(formData.get("course_id") || "").trim();
  const pauseStartDate = toCourseLifecycleDate(String(formData.get("pause_start_date") || "").trim());
  const pauseEndDate = toCourseLifecycleDate(String(formData.get("pause_end_date") || "").trim());
  const redirectTo = String(formData.get("redirect_to") || "").trim();
  const targetPath = redirectTo || `/dashboard/courses/${courseId}`;

  if (!courseId || !pauseStartDate || !pauseEndDate) {
    redirect(withSavedParam(targetPath, "pause_invalid"));
  }

  const nextPossiblePauseDate = getNextPossiblePauseDate();
  const defaultResumeDate = getFirstDayOfNextMonthDate(pauseStartDate);

  if (
    !isLastDayOfMonthDate(pauseStartDate) ||
    !isFirstDayOfMonthDate(pauseEndDate) ||
    pauseEndDate <= pauseStartDate ||
    pauseStartDate < nextPossiblePauseDate ||
    (defaultResumeDate !== null && pauseEndDate < defaultResumeDate)
  ) {
    redirect(withSavedParam(targetPath, "pause_invalid"));
  }

  const { admin, user, course } = await requireOwnedCourse(courseId);

  if (!course || course.kind !== "course") {
    redirect(withSavedParam(targetPath, "pause_invalid"));
  }

  if (course.status !== "active" && course.status !== "pause_scheduled") {
    redirect(withSavedParam(targetPath, "pause_invalid"));
  }

  const { error } = await admin
    .from("courses")
    .update({
      status: "pause_scheduled",
      pause_start_date: pauseStartDate,
      pause_end_date: pauseEndDate,
      stop_date: null,
      is_published: true,
    })
    .eq("id", courseId)
    .eq("teacher_id", user.id)
    .eq("kind", "course");

  if (error) {
    redirect(withSavedParam(targetPath, "pause_error"));
  }

  const { data: recipients } = await admin
    .from("course_registration_intents")
    .select("id,first_name,last_name,email,stripe_subscription_id")
    .eq("course_id", courseId)
    .eq("status", "checkout_completed")
    .returns<RegistrationIntentSubscriptionRow[]>();

  const pauseStartDateLabel = formatCourseLifecycleDate(pauseStartDate) ?? pauseStartDate;
  const pauseEndDateLabel = formatCourseLifecycleDate(pauseEndDate) ?? pauseEndDate;

  for (const recipient of recipients ?? []) {
    const recipientEmail = recipient.email?.trim();
    if (!recipientEmail) continue;

    try {
      await sendCoursePauseNotificationEmail({
        courseTitle: course.title ?? "Kurs",
        customerName: formatRecipientName(recipient.first_name, recipient.last_name),
        customerEmail: recipientEmail,
        pauseStartDateLabel,
        pauseEndDateLabel,
      });
    } catch {
      // Keep the lifecycle state change even if one notification fails.
    }
  }

  redirect(withSavedParam(targetPath, "pause_scheduled"));
}

export async function scheduleCourseStopAction(formData: FormData) {
  const courseId = String(formData.get("course_id") || "").trim();
  const stopDate = toCourseLifecycleDate(String(formData.get("stop_date") || "").trim());
  const redirectTo = String(formData.get("redirect_to") || "").trim();
  const targetPath = redirectTo || `/dashboard/courses/${courseId}`;

  if (!courseId || !stopDate || !isLastDayOfMonthDate(stopDate)) {
    redirect(withSavedParam(targetPath, "stop_invalid"));
  }

  const { admin, user, course } = await requireOwnedCourse(courseId);

  if (!course || course.kind !== "course") {
    redirect(withSavedParam(targetPath, "stop_invalid"));
  }

  if (!["active", "pause_scheduled", "paused", "stop_scheduled"].includes(course.status)) {
    redirect(withSavedParam(targetPath, "stop_invalid"));
  }

  const { error: updateError } = await admin
    .from("courses")
    .update({
      status: "stop_scheduled",
      stop_date: stopDate,
      pause_start_date: null,
      pause_end_date: null,
      is_published: false,
      end_scheduled_at: new Date().toISOString(),
      end_reason: "provider_lifecycle_stop",
    })
    .eq("id", courseId)
    .eq("teacher_id", user.id)
    .eq("kind", "course");

  if (updateError) {
    redirect(withSavedParam(targetPath, "stop_error"));
  }

  const { data: registrationIntents } = await admin
    .from("course_registration_intents")
    .select("id,first_name,last_name,email,stripe_subscription_id")
    .eq("course_id", courseId)
    .eq("status", "checkout_completed")
    .returns<RegistrationIntentSubscriptionRow[]>();

  const { data: trialUsers } = await admin
    .from("trial_reservations")
    .select("id,first_name,last_name,email,converted_at,cancelled_at")
    .eq("course_id", courseId)
    .is("cancelled_at", null)
    .returns<TrialRecipientRow[]>();

  const stripe = getStripe();
  const cancelAt = toStopDateEndUnix(stopDate);
  let hadSubscriptionErrors = false;
  const stopDateLabel = formatCourseLifecycleDate(stopDate) ?? stopDate;

  for (const intent of registrationIntents ?? []) {
    const recipientEmail = intent.email?.trim();
    if (recipientEmail) {
      try {
        await sendCourseStopNotificationEmail({
          courseTitle: course.title ?? "Kurs",
          customerName: formatRecipientName(intent.first_name, intent.last_name),
          customerEmail: recipientEmail,
          stopDateLabel,
        });
      } catch {
        // Keep the lifecycle state change even if one notification fails.
      }
    }

    if (!intent.stripe_subscription_id) continue;

    try {
      await stripe.subscriptions.update(intent.stripe_subscription_id, {
        cancel_at: cancelAt,
        proration_behavior: "none",
      });

      await admin
        .from("course_registration_intents")
        .update({ subscription_end_scheduled_at: `${stopDate}T23:59:59.999+01:00` })
        .eq("id", intent.id);
    } catch {
      hadSubscriptionErrors = true;
    }
  }

  const participantEmails = new Set(
    (registrationIntents ?? [])
      .map((intent) => intent.email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email))
  );

  for (const trialUser of trialUsers ?? []) {
    const recipientEmail = trialUser.email?.trim();
    if (!recipientEmail || participantEmails.has(recipientEmail.toLowerCase())) continue;

    try {
      await sendCourseStopNotificationEmail({
        courseTitle: course.title ?? "Kurs",
        customerName: formatRecipientName(trialUser.first_name, trialUser.last_name),
        customerEmail: recipientEmail,
        stopDateLabel,
      });
    } catch {
      // Keep the lifecycle state change even if one notification fails.
    }
  }

  redirect(withSavedParam(targetPath, hadSubscriptionErrors ? "stop_partial" : "stop_scheduled"));
}

export async function cancelWorkshopAction(formData: FormData) {
  const courseId = String(formData.get("course_id") || "").trim();
  const redirectTo = String(formData.get("redirect_to") || "").trim();
  const targetPath = redirectTo || `/dashboard/courses/${courseId}`;

  if (!courseId) {
    redirect(withSavedParam(targetPath, "workshop_cancel_invalid"));
  }

  const { admin, user, course } = await requireOwnedCourse(courseId);

  if (!course || course.kind !== "workshop") {
    redirect(withSavedParam(targetPath, "workshop_cancel_invalid"));
  }

  const { error: unpublishError } = await admin
    .from("courses")
    .update({
      is_published: false,
      status: "ended",
    })
    .eq("id", courseId)
    .eq("teacher_id", user.id)
    .eq("kind", "workshop");

  if (unpublishError) {
    redirect(withSavedParam(targetPath, "workshop_cancel_error"));
  }

  const { data: bookings } = await admin
    .from("bookings")
    .select(
      "id,customer_first_name,customer_last_name,customer_email,status,stripe_session_id,refunded_at,stripe_refund_id"
    )
    .eq("course_id", courseId)
    .returns<WorkshopBookingRefundRow[]>();

  const stripe = getStripe();
  let hadRefundErrors = false;

  for (const booking of bookings ?? []) {
    if (booking.status === "refunded" || booking.refunded_at || booking.stripe_refund_id) {
      continue;
    }

    if (booking.status !== "paid" || !booking.stripe_session_id) {
      await admin
        .from("bookings")
        .update({
          status: "cancelled",
        })
        .eq("id", booking.id);
      continue;
    }

    let refundId: string | null = null;
    let refundAmount: number | null = null;

    try {
      const session = await stripe.checkout.sessions.retrieve(booking.stripe_session_id, {
        expand: ["payment_intent"],
      });
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;

      if (!paymentIntentId) {
        hadRefundErrors = true;
        continue;
      }

      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
      });
      refundId = refund.id;
      refundAmount = refund.amount ?? null;
    } catch {
      hadRefundErrors = true;
      continue;
    }

    const { error: bookingUpdateError } = await admin
      .from("bookings")
      .update({
        status: "refunded",
        refunded_at: new Date().toISOString(),
        stripe_refund_id: refundId,
        refund_amount_cents: refundAmount,
      })
      .eq("id", booking.id);

    if (bookingUpdateError) {
      hadRefundErrors = true;
      continue;
    }

    const recipientEmail = booking.customer_email?.trim();
    if (recipientEmail) {
      try {
        await sendWorkshopCancellationEmail({
          customerEmail: recipientEmail,
          customerName: formatRecipientName(booking.customer_first_name, booking.customer_last_name),
        });
      } catch {
        // Keep cancellation/refund state even if email delivery fails.
      }
    }
  }

  redirect(withSavedParam(targetPath, hadRefundErrors ? "workshop_cancel_partial" : "workshop_cancelled"));
}

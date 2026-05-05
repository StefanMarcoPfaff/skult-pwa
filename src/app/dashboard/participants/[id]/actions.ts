"use server";

import { redirect } from "next/navigation";
import {
  formatCourseLifecycleDate,
  getFirstDayOfNextMonthDate,
  getPreviousDate,
  isFirstDayOfMonthDate,
  isLastDayOfMonthDate,
  toCourseLifecycleDate,
} from "@/lib/course-lifecycle-shared";
import {
  sendParticipantCancellationConfirmationEmail,
  sendParticipantPauseConfirmationEmail,
} from "@/lib/participant-subscription-emails";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ParticipantSubscriptionRow = {
  id: string;
  trial_reservation_id: string;
  course_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  subscription_status: string | null;
  subscription_pause_start_date: string | null;
  subscription_pause_end_date: string | null;
  subscription_stop_date: string | null;
};

type CourseOwnershipRow = {
  id: string;
  title: string | null;
  teacher_id: string | null;
};

function withSavedParam(targetPath: string, value: string) {
  return `${targetPath}${targetPath.includes("?") ? "&" : "?"}saved=${value}`;
}

function formatRecipientName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "Kursteilnehmer*in";
}

function dateToEndUnix(date: string): number {
  return Math.floor(new Date(`${date}T23:59:59.999+01:00`).getTime() / 1000);
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

async function loadParticipantSubscriptionContext(reservationId: string, teacherId: string) {
  const admin = createSupabaseAdmin();
  const { data: subscription } = await admin
    .from("course_registration_intents")
    .select(
      "id,trial_reservation_id,course_id,first_name,last_name,email,stripe_subscription_id,status,subscription_status,subscription_pause_start_date,subscription_pause_end_date,subscription_stop_date"
    )
    .eq("trial_reservation_id", reservationId)
    .maybeSingle<ParticipantSubscriptionRow>();

  if (!subscription || subscription.status !== "checkout_completed") {
    return { admin, subscription: null, course: null };
  }

  const { data: course } = await admin
    .from("courses")
    .select("id,title,teacher_id")
    .eq("id", subscription.course_id)
    .eq("teacher_id", teacherId)
    .maybeSingle<CourseOwnershipRow>();

  if (!course) {
    return { admin, subscription: null, course: null };
  }

  return { admin, subscription, course };
}

export async function pauseParticipantSubscriptionAction(formData: FormData) {
  const reservationId = String(formData.get("reservationId") || "").trim();
  const redirectTo = String(formData.get("redirect_to") || "").trim() || "/dashboard/participants";
  const activeUntilDate = toCourseLifecycleDate(String(formData.get("active_until_date") || "").trim());
  const pauseEndDate = toCourseLifecycleDate(String(formData.get("pause_end_date") || "").trim());
  const pauseStartDate = activeUntilDate ? getFirstDayOfNextMonthDate(activeUntilDate) : null;

  if (
    !reservationId ||
    !activeUntilDate ||
    !pauseStartDate ||
    !pauseEndDate ||
    !isLastDayOfMonthDate(activeUntilDate) ||
    !isFirstDayOfMonthDate(pauseEndDate) ||
    pauseEndDate <= pauseStartDate
  ) {
    redirect(withSavedParam(redirectTo, "participant_pause_invalid"));
  }

  const user = await requireTeacher();
  const { admin, subscription, course } = await loadParticipantSubscriptionContext(reservationId, user.id);

  if (
    !subscription ||
    !course ||
    !subscription.stripe_subscription_id ||
    !["active", "pause_scheduled", "paused"].includes(subscription.subscription_status ?? "active")
  ) {
    redirect(withSavedParam(redirectTo, "participant_pause_invalid"));
  }

  const { error } = await admin
    .from("course_registration_intents")
    .update({
      subscription_status: "pause_scheduled",
      subscription_pause_start_date: pauseStartDate,
      subscription_pause_end_date: pauseEndDate,
      subscription_cancel_scheduled_at: null,
      subscription_cancelled_at: null,
      subscription_stop_date: null,
    })
    .eq("id", subscription.id);

  if (error) {
    redirect(withSavedParam(redirectTo, "participant_pause_error"));
  }

  const recipientEmail = subscription.email?.trim();
  if (recipientEmail) {
    try {
      await sendParticipantPauseConfirmationEmail({
        courseTitle: course.title ?? "Kurs",
        customerName: formatRecipientName(subscription.first_name, subscription.last_name),
        customerEmail: recipientEmail,
        activeUntilDateLabel: formatCourseLifecycleDate(activeUntilDate) ?? activeUntilDate,
        pauseStartDateLabel: formatCourseLifecycleDate(pauseStartDate) ?? pauseStartDate,
        pauseEndDateLabel: formatCourseLifecycleDate(pauseEndDate) ?? pauseEndDate,
        pauseEndExclusiveDateLabel:
          formatCourseLifecycleDate(getPreviousDate(pauseEndDate)) ?? formatCourseLifecycleDate(pauseEndDate) ?? pauseEndDate,
      });
    } catch {
      // Keep pause state even if email delivery fails.
    }
  }

  redirect(withSavedParam(redirectTo, "participant_pause_scheduled"));
}

export async function stopParticipantSubscriptionAction(formData: FormData) {
  const reservationId = String(formData.get("reservationId") || "").trim();
  const redirectTo = String(formData.get("redirect_to") || "").trim() || "/dashboard/participants";
  const stopDate = toCourseLifecycleDate(String(formData.get("stop_date") || "").trim());

  if (!reservationId || !stopDate || !isLastDayOfMonthDate(stopDate)) {
    redirect(withSavedParam(redirectTo, "participant_stop_invalid"));
  }

  const user = await requireTeacher();
  const { admin, subscription, course } = await loadParticipantSubscriptionContext(reservationId, user.id);

  if (
    !subscription ||
    !course ||
    !subscription.stripe_subscription_id ||
    !["active", "pause_scheduled", "paused"].includes(subscription.subscription_status ?? "active")
  ) {
    redirect(withSavedParam(redirectTo, "participant_stop_invalid"));
  }

  const stripe = getStripe();
  try {
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at: dateToEndUnix(stopDate),
      cancel_at_period_end: false,
    });
  } catch {
    redirect(withSavedParam(redirectTo, "participant_stop_error"));
  }

  const { error } = await admin
    .from("course_registration_intents")
    .update({
      subscription_status: "cancel_scheduled",
      subscription_pause_start_date: null,
      subscription_pause_end_date: null,
      subscription_cancel_scheduled_at: new Date().toISOString(),
      subscription_stop_date: stopDate,
    })
    .eq("id", subscription.id);

  if (error) {
    redirect(withSavedParam(redirectTo, "participant_stop_error"));
  }

  const recipientEmail = subscription.email?.trim();
  if (recipientEmail) {
    try {
      await sendParticipantCancellationConfirmationEmail({
        courseTitle: course.title ?? "Kurs",
        customerName: formatRecipientName(subscription.first_name, subscription.last_name),
        customerEmail: recipientEmail,
        cancellationDateLabel: formatCourseLifecycleDate(stopDate) ?? stopDate,
      });
    } catch {
      // Keep cancellation state even if email delivery fails.
    }
  }

  redirect(withSavedParam(redirectTo, "participant_cancel_scheduled"));
}

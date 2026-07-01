"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type Stripe from "stripe";
import { getOfferArchiveEligibility } from "@/app/dashboard/archive-rules";
import {
  buildCheckInAccessUrl,
  generateCheckInAccessToken,
  getDefaultCheckInAccessExpiry,
  hashCheckInAccessToken,
} from "@/lib/checkin-access-links";
import { sendCoursePauseNotificationEmail, sendCourseStopNotificationEmail } from "@/lib/course-lifecycle-emails";
import { formatMoney } from "@/lib/course-display";
import { mirrorStripeRefundToLedger } from "@/lib/payments/ledger";
import { paymentService } from "@/lib/payments/payment-service";
import { getStripe } from "@/lib/stripe";
import {
  CourseStatus,
  formatCourseLifecycleDate,
  getFirstDayOfNextMonthDate,
  getNextPossiblePauseDate,
  getPreviousDate,
  isFirstDayOfMonthDate,
  isLastDayOfMonthDate,
  toCourseLifecycleDate,
} from "@/lib/course-lifecycle-shared";
import { getCourseTerminationModelValue, getWorkshopCancellationPolicyValue } from "@/lib/offer-policies";
import { buildOfferViewModel } from "@/lib/offers/offer-view-model";
import { getProviderDisplayName } from "@/lib/provider-profiles";
import {
  getPaidOfferPublicationReadiness,
  getProviderBillingProfile,
} from "@/lib/provider-billing-profile";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendTrialCourseStopNotificationEmail } from "@/lib/trial-reservation-emails";
import { sendWorkshopCancellationEmail } from "@/lib/workshop-booking-emails";

type CourseOwnerRow = {
  id: string;
  title: string | null;
  kind: string | null;
  teacher_id: string;
  status: CourseStatus;
  is_published: boolean | null;
  starts_at?: string | null;
  ends_at?: string | null;
  location?: string | null;
  location_details?: string | null;
  instructor_name?: string | null;
  price_cents?: number | null;
  currency?: string | null;
  offer_image_url?: string | null;
  pause_start_date: string | null;
  pause_end_date: string | null;
  stop_date: string | null;
  cancellation_model: string | null;
  workshop_storno_policy: string | null;
  archived_at?: string | null;
};

type RegistrationIntentSubscriptionRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  course_pause_notification_sent_for_start_date: string | null;
  course_stop_notification_sent_for_stop_date: string | null;
};

type TrialRecipientRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  converted_at: string | null;
  cancelled_at: string | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  course_stop_notification_sent_for_stop_date: string | null;
};

type WorkshopBookingRefundRow = {
  id: string;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  is_simulation: boolean | null;
  status: string | null;
  payment_status: string | null;
  stripe_session_id: string | null;
  refunded_at: string | null;
  stripe_refund_id: string | null;
};

type StatusEmailProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: "independent_teacher" | "studio_provider" | null;
  organization_name: string | null;
  photo_url: string | null;
  company_logo_url: string | null;
};

type PublishMode = "play";

export type OfferActivationActionResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "invalid_request"
        | "not_found"
        | "invalid_status"
        | "missing_policy"
        | "missing_paid_offer_profile"
        | "update_failed"
        | "unknown";
      missingFields?: string[];
      warnings?: string[];
    };

type CourseCopySourceRow = {
  id: string;
  teacher_id: string;
  kind: string | null;
  title: string | null;
  description: string | null;
  location: string | null;
  location_details: string | null;
  capacity: number | null;
  starts_at: string | null;
  ends_at: string | null;
  weekday: number | null;
  start_time: string | null;
  duration_minutes: number | null;
  recurrence_type: string | null;
  trial_mode: string | null;
  instructor_name: string | null;
  cancellation_model: string | null;
  workshop_storno_policy: string | null;
  visibility: string | null;
  internal_note: string | null;
  reservation_notice: string | null;
  price_cents: number | null;
  currency: string | null;
};

type CourseSessionCopyRow = {
  starts_at: string | null;
  ends_at: string | null;
};

type TrialSlotCopyRow = {
  starts_at: string | null;
  ends_at: string | null;
  is_open: boolean | null;
  source_type: string | null;
};

type CheckInAccessSessionRow = {
  ends_at: string | null;
};

export type CreateTeacherCheckInLinkResult =
  | { ok: true; url: string; expiresAt: string }
  | { ok: false; error: "invalid_request" | "not_found" | "create_failed" };

function withSavedParam(targetPath: string, value: string) {
  return `${targetPath}${targetPath.includes("?") ? "&" : "?"}saved=${value}`;
}

function toStopDateEndUnix(stopDate: string): number {
  return Math.floor(new Date(`${stopDate}T23:59:59.999+01:00`).getTime() / 1000);
}

function formatRecipientName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "Kursteilnehmer*in";
}

function buildStatusOfferViewModel(course: CourseOwnerRow) {
  return buildOfferViewModel({
    course: {
      title: course.title,
      kind: course.kind,
      location: course.location ?? null,
      location_details: course.location_details ?? null,
      starts_at: course.starts_at ?? null,
      ends_at: course.ends_at ?? null,
      instructor_name: course.instructor_name ?? null,
      price_cents: course.price_cents ?? null,
      currency: course.currency ?? null,
      workshop_storno_policy: course.workshop_storno_policy ?? null,
      cancellation_model: course.cancellation_model ?? null,
      offer_image_url: course.offer_image_url ?? null,
    },
  });
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
      "id,title,kind,teacher_id,status,is_published,starts_at,ends_at,location,location_details,instructor_name,price_cents,currency,offer_image_url,pause_start_date,pause_end_date,stop_date,cancellation_model,workshop_storno_policy,archived_at"
    )
    .eq("id", courseId)
    .eq("teacher_id", user.id)
    .maybeSingle<CourseOwnerRow>();

  return { admin, user, course };
}

async function cleanupCopiedCourse(admin: ReturnType<typeof createSupabaseAdmin>, courseId: string) {
  await admin.from("trial_slots").delete().eq("course_id", courseId);
  await admin.from("course_sessions").delete().eq("course_id", courseId);
  await admin.from("courses").delete().eq("id", courseId);
}

export async function createTeacherCheckInLinkAction(formData: FormData): Promise<CreateTeacherCheckInLinkResult> {
  const courseId = String(formData.get("course_id") || "").trim();

  if (!courseId) {
    return { ok: false, error: "invalid_request" };
  }

  const { admin, user, course } = await requireOwnedCourse(courseId);
  if (!course) {
    return { ok: false, error: "not_found" };
  }

  const { data: sessions } = await admin
    .from("course_sessions")
    .select("ends_at")
    .eq("course_id", course.id)
    .returns<CheckInAccessSessionRow[]>();

  const token = generateCheckInAccessToken();
  const expiresAt = getDefaultCheckInAccessExpiry({
    courseEndsAt: course.ends_at ?? null,
    sessionEndsAt: (sessions ?? []).map((session) => session.ends_at),
  });

  const { error } = await admin.from("checkin_access_links").insert({
    token_hash: hashCheckInAccessToken(token),
    course_id: course.id,
    scope: "workshop",
    expires_at: expiresAt.toISOString(),
    created_by: user.id,
    metadata: {
      created_from: "dashboard_course_detail",
      course_kind: course.kind,
    },
  });

  if (error) {
    return { ok: false, error: "create_failed" };
  }

  revalidatePath(`/dashboard/courses/${course.id}`);
  return {
    ok: true,
    url: buildCheckInAccessUrl(token),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function setCoursePublishStateAction(formData: FormData) {
  const courseId = String(formData.get("course_id") || "").trim();
  const mode = String(formData.get("mode") || "").trim() as PublishMode;
  const redirectTo = String(formData.get("redirect_to") || "").trim();
  const targetPath = redirectTo || `/dashboard/courses/${courseId}`;

  console.log("[activate_offer_start]", {
    courseId,
    mode,
    targetPath,
  });

  if (!courseId || mode !== "play") {
    console.error("[activate_offer_error]", {
      courseId,
      mode,
      reason: "invalid_request",
    });
    return { ok: false, error: "invalid_request" } satisfies OfferActivationActionResult;
  }

  try {
    const { admin, user, course } = await requireOwnedCourse(courseId);

    if (!course) {
      console.error("[activate_offer_error]", {
        courseId,
        userId: user.id,
        reason: "not_found",
      });
      return { ok: false, error: "not_found" } satisfies OfferActivationActionResult;
    }

    if (course.status !== "draft") {
      console.error("[activate_offer_error]", {
        courseId,
        userId: user.id,
        currentStatus: course.status,
        reason: "invalid_status",
      });
      return { ok: false, error: "invalid_status" } satisfies OfferActivationActionResult;
    }

    const missingWorkshopPolicy =
      course.kind !== "course" &&
      !getWorkshopCancellationPolicyValue({ cancellation_policy: course.workshop_storno_policy });
    const missingCoursePolicy =
      course.kind === "course" &&
      !getCourseTerminationModelValue({ termination_model: course.cancellation_model });

    if (missingWorkshopPolicy || missingCoursePolicy) {
      console.error("[activate_offer_error]", {
        courseId,
        userId: user.id,
        reason: "missing_policy",
      });
      return { ok: false, error: "missing_policy" } satisfies OfferActivationActionResult;
    }

    if ((course.kind === "workshop" || course.kind === "exclusive_offer") && (course.price_cents ?? 0) > 0) {
      const providerProfile = await getProviderBillingProfile(admin, user.id);
      const paidOfferReadiness = getPaidOfferPublicationReadiness(providerProfile);

      if (!paidOfferReadiness.isReady) {
        console.error("[activate_offer_error]", {
          courseId,
          userId: user.id,
          reason: "missing_paid_offer_profile",
          missingFields: paidOfferReadiness.missingFields,
          warnings: paidOfferReadiness.warnings,
        });
        return {
          ok: false,
          error: "missing_paid_offer_profile",
          missingFields: paidOfferReadiness.missingFields,
          warnings: paidOfferReadiness.warnings,
        } satisfies OfferActivationActionResult;
      }
    }

    const { data: updatedCourse, error } = await admin
      .from("courses")
      .update({
        status: "active",
        is_published: true,
        pause_start_date: null,
        pause_end_date: null,
        stop_date: null,
      })
      .eq("id", courseId)
      .eq("teacher_id", user.id)
      .select("id,status,is_published,visibility")
      .maybeSingle<{
        id: string;
        status: CourseStatus;
        is_published: boolean | null;
        visibility: string | null;
      }>();

    if (error || !updatedCourse) {
      console.error("[activate_offer_error]", {
        courseId,
        userId: user.id,
        reason: "update_failed",
        error: error?.message ?? "missing_updated_row",
      });
      return { ok: false, error: "update_failed" } satisfies OfferActivationActionResult;
    }

    revalidatePath("/dashboard/courses");
    revalidatePath(`/dashboard/courses/${courseId}`);
    revalidatePath(targetPath);

    console.log("[activate_offer_success]", {
      courseId,
      userId: user.id,
      status: updatedCourse.status,
      isPublished: updatedCourse.is_published,
      visibility: updatedCourse.visibility,
    });

    return { ok: true } satisfies OfferActivationActionResult;
  } catch (error) {
    console.error("[activate_offer_error]", {
      courseId,
      mode,
      reason: "unknown",
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: "unknown" } satisfies OfferActivationActionResult;
  }
}

export async function duplicateCourseAction(formData: FormData) {
  const courseId = String(formData.get("course_id") || "").trim();

  if (!courseId) {
    redirect("/dashboard/courses");
  }

  const { admin, user } = await requireOwnedCourse(courseId);

  const { data: sourceCourse } = await admin
    .from("courses")
    .select(
      "id,teacher_id,kind,title,description,location,location_details,capacity,starts_at,ends_at,weekday,start_time,duration_minutes,recurrence_type,trial_mode,instructor_name,cancellation_model,workshop_storno_policy,visibility,internal_note,reservation_notice,price_cents,currency"
    )
    .eq("id", courseId)
    .eq("teacher_id", user.id)
    .maybeSingle<CourseCopySourceRow>();

  if (!sourceCourse) {
    redirect("/dashboard/courses");
  }

  const { data: copiedCourse, error: insertError } = await admin
    .from("courses")
    .insert({
      teacher_id: user.id,
      kind: sourceCourse.kind,
      title: sourceCourse.title ?? "Kopie",
      description: sourceCourse.description,
      location: sourceCourse.location,
      location_details: sourceCourse.location_details,
      capacity: sourceCourse.capacity,
      starts_at: sourceCourse.starts_at,
      ends_at: sourceCourse.ends_at,
      weekday: sourceCourse.weekday,
      start_time: sourceCourse.start_time,
      duration_minutes: sourceCourse.duration_minutes,
      recurrence_type: sourceCourse.recurrence_type,
      trial_mode: sourceCourse.trial_mode ?? "all_sessions",
      instructor_name: sourceCourse.instructor_name,
      cancellation_model: sourceCourse.cancellation_model,
      workshop_storno_policy: sourceCourse.workshop_storno_policy,
      visibility: sourceCourse.visibility,
      internal_note: sourceCourse.internal_note,
      reservation_notice: sourceCourse.reservation_notice,
      price_cents: sourceCourse.price_cents,
      currency: sourceCourse.currency,
      status: "draft",
      is_published: false,
      end_scheduled_at: null,
      end_reason: null,
      pause_start_date: null,
      pause_end_date: null,
      stop_date: null,
      archived_at: null,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError || !copiedCourse) {
    redirect(withSavedParam(`/dashboard/courses/${courseId}`, "copy_error"));
  }

  if (sourceCourse.kind === "workshop" || sourceCourse.kind === "exclusive_offer") {
    const { data: sessions } = await admin
      .from("course_sessions")
      .select("starts_at,ends_at")
      .eq("course_id", courseId)
      .order("starts_at", { ascending: true })
      .returns<CourseSessionCopyRow[]>();

    const copiedSessions = (sessions ?? []).filter((session) => session.starts_at && session.ends_at);

    if (copiedSessions.length > 0) {
      const { error: sessionInsertError } = await admin.from("course_sessions").insert(
        copiedSessions.map((session) => ({
          course_id: copiedCourse.id,
          starts_at: session.starts_at as string,
          ends_at: session.ends_at as string,
        }))
      );

      if (sessionInsertError) {
        await cleanupCopiedCourse(admin, copiedCourse.id);
        redirect(withSavedParam(`/dashboard/courses/${courseId}`, "copy_error"));
      }
    }
  }

  if (sourceCourse.kind === "course" && sourceCourse.trial_mode === "manual") {
    const { data: trialSlots } = await admin
      .from("trial_slots")
      .select("starts_at,ends_at,is_open,source_type")
      .eq("course_id", courseId)
      .eq("is_open", true)
      .order("starts_at", { ascending: true })
      .returns<TrialSlotCopyRow[]>();

    const copiedTrialSlots = (trialSlots ?? []).filter((slot) => slot.starts_at && slot.ends_at);

    if (copiedTrialSlots.length > 0) {
      const { error: trialSlotInsertError } = await admin.from("trial_slots").insert(
        copiedTrialSlots.map((slot) => ({
          course_id: copiedCourse.id,
          starts_at: slot.starts_at as string,
          ends_at: slot.ends_at as string,
          is_open: slot.is_open ?? true,
          source_type: "manual" as const,
        }))
      );

      if (trialSlotInsertError) {
        await cleanupCopiedCourse(admin, copiedCourse.id);
        redirect(withSavedParam(`/dashboard/courses/${courseId}`, "copy_error"));
      }
    }
  }

  revalidatePath("/dashboard/courses");
  revalidatePath(`/dashboard/courses/${courseId}`);
  redirect(`/dashboard/courses/${copiedCourse.id}/edit?copied=1`);
}

export async function scheduleCoursePauseAction(formData: FormData) {
  const courseId = String(formData.get("course_id") || "").trim();
  const activeUntilDate = toCourseLifecycleDate(String(formData.get("active_until_date") || "").trim());
  const pauseEndDate = toCourseLifecycleDate(String(formData.get("pause_end_date") || "").trim());
  const pauseStartDate = activeUntilDate ? getFirstDayOfNextMonthDate(activeUntilDate) : null;
  const redirectTo = String(formData.get("redirect_to") || "").trim();
  const targetPath = redirectTo || `/dashboard/courses/${courseId}`;

  if (!courseId || !activeUntilDate || !pauseStartDate || !pauseEndDate) {
    redirect(withSavedParam(targetPath, "pause_invalid"));
  }

  const nextPossiblePauseDate = getNextPossiblePauseDate();
  const defaultResumeDate = getFirstDayOfNextMonthDate(activeUntilDate);

  if (
    !isLastDayOfMonthDate(activeUntilDate) ||
    !isFirstDayOfMonthDate(pauseEndDate) ||
    pauseEndDate <= pauseStartDate ||
    activeUntilDate < nextPossiblePauseDate ||
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
    .select("id,first_name,last_name,email,stripe_subscription_id,subscription_status,course_pause_notification_sent_for_start_date")
    .eq("course_id", courseId)
    .eq("status", "checkout_completed")
    .returns<RegistrationIntentSubscriptionRow[]>();
  const activeRecipients = (recipients ?? []).filter((recipient) =>
    ["active", "pause_scheduled", "paused"].includes(recipient.subscription_status ?? "active")
  );

  const pauseStartDateLabel = formatCourseLifecycleDate(pauseStartDate) ?? pauseStartDate;
  const pauseEndDateLabel = formatCourseLifecycleDate(pauseEndDate) ?? pauseEndDate;
  const activeUntilDateLabel = formatCourseLifecycleDate(activeUntilDate) ?? activeUntilDate;
  const pauseEndExclusiveDateLabel =
    formatCourseLifecycleDate(getPreviousDate(pauseEndDate)) ?? pauseEndDateLabel;

  for (const recipient of activeRecipients) {
    if (recipient.course_pause_notification_sent_for_start_date === pauseStartDate) {
      continue;
    }
    const recipientEmail = recipient.email?.trim();
    if (!recipientEmail) continue;

    try {
      await sendCoursePauseNotificationEmail({
        courseTitle: course.title ?? "Kurs",
        customerName: formatRecipientName(recipient.first_name, recipient.last_name),
        customerEmail: recipientEmail,
        providerEmail: user.email ?? null,
        activeUntilDateLabel,
        pauseStartDateLabel,
        pauseEndDateLabel,
        pauseEndExclusiveDateLabel,
        offer: buildStatusOfferViewModel(course),
      });
      await admin
        .from("course_registration_intents")
        .update({ course_pause_notification_sent_for_start_date: pauseStartDate })
        .eq("id", recipient.id);
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
    .select("id,first_name,last_name,email,stripe_subscription_id,subscription_status,course_stop_notification_sent_for_stop_date")
    .eq("course_id", courseId)
    .eq("status", "checkout_completed")
    .returns<RegistrationIntentSubscriptionRow[]>();
  const activeRegistrationIntents = (registrationIntents ?? []).filter((intent) =>
    ["active", "pause_scheduled", "paused"].includes(intent.subscription_status ?? "active")
  );

  const { data: trialUsers } = await admin
    .from("trial_reservations")
    .select("id,first_name,last_name,email,converted_at,cancelled_at,trial_starts_at,trial_ends_at,course_stop_notification_sent_for_stop_date")
    .eq("course_id", courseId)
    .is("cancelled_at", null)
    .returns<TrialRecipientRow[]>();

  const stripe = getStripe();
  const cancelAt = toStopDateEndUnix(stopDate);
  let hadSubscriptionErrors = false;
  const stopDateLabel = formatCourseLifecycleDate(stopDate) ?? stopDate;

  for (const intent of activeRegistrationIntents) {
    const recipientEmail = intent.email?.trim();
    if (recipientEmail && intent.course_stop_notification_sent_for_stop_date !== stopDate) {
      try {
        await sendCourseStopNotificationEmail({
          courseTitle: course.title ?? "Kurs",
          customerName: formatRecipientName(intent.first_name, intent.last_name),
          customerEmail: recipientEmail,
          providerEmail: user.email ?? null,
          stopDateLabel,
          offer: buildStatusOfferViewModel(course),
        });
        await admin
          .from("course_registration_intents")
          .update({ course_stop_notification_sent_for_stop_date: stopDate })
          .eq("id", intent.id);
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
    activeRegistrationIntents
      .map((intent) => intent.email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email))
  );

  for (const trialUser of trialUsers ?? []) {
    const recipientEmail = trialUser.email?.trim();
    if (!recipientEmail || participantEmails.has(recipientEmail.toLowerCase())) continue;
    if (trialUser.course_stop_notification_sent_for_stop_date === stopDate) continue;

    try {
      await sendTrialCourseStopNotificationEmail({
        reservationId: trialUser.id,
        courseTitle: course.title ?? "Kurs",
        teacherEmail: user.email ?? null,
        customerName: formatRecipientName(trialUser.first_name, trialUser.last_name),
        customerEmail: recipientEmail,
        trialStartsAt: trialUser.trial_starts_at,
        trialEndsAt: trialUser.trial_ends_at,
      });
      await admin
        .from("trial_reservations")
        .update({ course_stop_notification_sent_for_stop_date: stopDate })
        .eq("id", trialUser.id);
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

  if (!course || (course.kind !== "workshop" && course.kind !== "exclusive_offer")) {
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
    .in("kind", ["workshop", "exclusive_offer"]);

  if (unpublishError) {
    redirect(withSavedParam(targetPath, "workshop_cancel_error"));
  }

  const { data: bookings } = await admin
    .from("bookings")
    .select(
      "id,customer_first_name,customer_last_name,customer_email,is_simulation,status,payment_status,stripe_session_id,refunded_at,stripe_refund_id"
    )
    .eq("course_id", courseId)
    .returns<WorkshopBookingRefundRow[]>();

  let hadRefundErrors = false;
  const [{ data: profile }, authResult] = course.teacher_id
    ? await Promise.all([
        admin
          .from("profiles")
          .select("first_name,last_name,provider_type,organization_name,photo_url,company_logo_url")
          .eq("id", course.teacher_id)
          .maybeSingle<StatusEmailProfileRow>(),
        admin.auth.admin.getUserById(course.teacher_id),
      ])
    : [{ data: null }, { data: { user: null } }];
  const providerName = profile?.provider_type ? getProviderDisplayName(profile.provider_type, profile) : null;
  const statusOfferEmailData = {
    workshopTitle: course.title,
    providerType: profile?.provider_type ?? null,
    providerName,
    teacherName: course.instructor_name ?? null,
    teacherEmail: authResult.data.user?.email?.trim() || null,
    senderImageUrl: profile?.photo_url ?? null,
    providerLogoUrl: profile?.company_logo_url ?? null,
    offerImageUrl: course.offer_image_url ?? null,
    location: course.location ?? null,
    locationDetails: course.location_details ?? null,
    startsAt: course.starts_at ?? null,
    endsAt: course.ends_at ?? null,
    priceLabel: typeof course.price_cents === "number" ? formatMoney(course.price_cents, course.currency ?? "EUR") : null,
  };

  for (const booking of bookings ?? []) {
    if (booking.status === "refunded" || booking.refunded_at || booking.stripe_refund_id) {
      continue;
    }

    if (booking.payment_status === "free" || booking.status !== "paid" || !booking.stripe_session_id) {
      const { error: cancelUpdateError } = await admin
        .from("bookings")
        .update({
          status: "cancelled",
          payment_status: booking.payment_status === "free" ? "cancelled" : booking.payment_status,
        })
        .eq("id", booking.id);
      if (cancelUpdateError) {
        hadRefundErrors = true;
        continue;
      }

      const recipientEmail = booking.customer_email?.trim();
      if (recipientEmail && !booking.is_simulation) {
        try {
          await sendWorkshopCancellationEmail({
            customerEmail: recipientEmail,
            customerName: formatRecipientName(booking.customer_first_name, booking.customer_last_name),
            ...statusOfferEmailData,
            paymentStatus: booking.payment_status === "free" ? "free" : "paid",
            refunded: false,
          });
        } catch {
          hadRefundErrors = true;
        }
      }
      continue;
    }

    let refundAmountLabel: string | null = null;
    try {
      const refund = await paymentService.refundPayment({
        provider: "stripe",
        referenceType: "checkout_session",
        referenceId: booking.stripe_session_id,
      });
      refundAmountLabel =
        typeof refund.amountCents === "number" ? formatMoney(refund.amountCents, course.currency ?? "EUR") : null;
      if (refund.raw) {
        try {
          await mirrorStripeRefundToLedger({
            bookingId: booking.id,
            checkoutSessionId: booking.stripe_session_id,
            refund: refund.raw as Stripe.Refund,
          });
        } catch {
          hadRefundErrors = true;
        }
      }
      const { error: bookingUpdateError } = await admin
        .from("bookings")
        .update({
          status: "refunded",
          payment_status: "refunded",
          refunded_at: new Date().toISOString(),
          stripe_refund_id: refund.refundId,
          refund_amount_cents: refund.amountCents,
        })
        .eq("id", booking.id);

      if (bookingUpdateError) {
        hadRefundErrors = true;
        continue;
      }
    } catch {
      hadRefundErrors = true;
      continue;
    }

    const recipientEmail = booking.customer_email?.trim();
    if (recipientEmail && !booking.is_simulation) {
      try {
        await sendWorkshopCancellationEmail({
          customerEmail: recipientEmail,
          customerName: formatRecipientName(booking.customer_first_name, booking.customer_last_name),
          ...statusOfferEmailData,
          paymentStatus: "paid",
          refundAmountLabel,
          refunded: true,
        });
      } catch {
        hadRefundErrors = true;
      }
    }
  }

  redirect(withSavedParam(targetPath, hadRefundErrors ? "workshop_cancel_partial" : "workshop_cancelled"));
}

export async function archiveCourseAction(formData: FormData) {
  const courseId = String(formData.get("course_id") || "").trim();
  const redirectTo = String(formData.get("redirect_to") || "").trim();
  const targetPath = redirectTo || "/dashboard/courses";

  if (!courseId) {
    redirect(withSavedParam(targetPath, "offer_archive_invalid"));
  }

  const { admin, user, course } = await requireOwnedCourse(courseId);

  if (!course) {
    redirect(withSavedParam(targetPath, "offer_archive_invalid"));
  }

  const [{ data: reservations }, { data: intents }, { data: bookings }] = await Promise.all([
    admin
      .from("trial_reservations")
      .select("id,decision_status,cancelled_at,archived_at")
      .eq("course_id", courseId),
    admin
      .from("course_registration_intents")
      .select("id,status,subscription_status,archived_at")
      .eq("course_id", courseId),
    admin
      .from("bookings")
      .select("id,status,refunded_at,stripe_refund_id,archived_at")
      .eq("course_id", courseId),
  ]);

  const activeTrialCount = (reservations ?? []).filter(
    (reservation) =>
      !reservation.archived_at &&
      !reservation.cancelled_at &&
      reservation.decision_status !== "rejected"
  ).length;
  const activeRegistrationCount = (intents ?? []).filter(
    (intent) =>
      !intent.archived_at &&
      intent.status === "checkout_completed" &&
      ["active", "pause_scheduled", "paused", "cancel_scheduled"].includes(intent.subscription_status ?? "active")
  ).length;
  const activeBookingCount = (bookings ?? []).filter(
    (booking) =>
      !booking.archived_at &&
      booking.status === "paid" &&
      !booking.refunded_at &&
      !booking.stripe_refund_id
  ).length;
  const openPaymentCount = activeBookingCount;

  const eligibility = getOfferArchiveEligibility({
    kind: course.kind,
    status: course.status,
    startsAt: course.starts_at ?? null,
    endsAt: course.ends_at ?? null,
    archivedAt: course.archived_at ?? null,
    activeTrialCount,
    activeRegistrationCount,
    activeBookingCount,
    openPaymentCount,
  });

  if (!eligibility.allowed) {
    redirect(withSavedParam(targetPath, "offer_archive_invalid"));
  }

  const archivedAt = new Date().toISOString();
  const { error } = await admin
    .from("courses")
    .update({ archived_at: archivedAt, is_published: false })
    .eq("id", courseId)
    .eq("teacher_id", user.id);

  if (error) {
    redirect(withSavedParam(targetPath, "offer_archive_error"));
  }

  revalidatePath("/dashboard/courses");
  revalidatePath(`/dashboard/courses/${courseId}`);
  redirect(withSavedParam("/dashboard/courses", "offer_archived"));
}

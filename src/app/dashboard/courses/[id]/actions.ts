"use server";

import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";
import { getCancellationModelLabel, getProviderDisplayName } from "@/lib/provider-profiles";
import {
  getCourseTerminationModelValue,
  getWorkshopCancellationPolicyValue,
} from "@/lib/offer-policies";
import {
  COURSE_END_NOTICE_DAYS,
  getMinimumCourseEndDate,
  toCourseEndIso,
} from "@/lib/course-ending";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendCourseEndingNotificationEmail } from "@/lib/trial-reservation-emails";

type PublishMode = "published" | "draft";

type CourseOwnerRow = {
  id: string;
  title: string | null;
  kind: string | null;
  teacher_id: string;
  ends_at: string | null;
  cancellation_model: string | null;
  workshop_storno_policy: string | null;
  location: string | null;
  location_details: string | null;
  instructor_name: string | null;
};

type RegistrationIntentNotificationRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  stripe_subscription_id: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  provider_type: "independent_teacher" | "studio_provider" | null;
  organization_name: string | null;
};

function withSavedParam(targetPath: string, value: string) {
  return `${targetPath}${targetPath.includes("?") ? "&" : "?"}saved=${value}`;
}

export async function setCoursePublishStateAction(formData: FormData) {
  const courseId = String(formData.get("course_id") || "").trim();
  const mode = String(formData.get("mode") || "").trim() as PublishMode;
  const redirectTo = String(formData.get("redirect_to") || "").trim();
  const targetPath = redirectTo || `/dashboard/courses/${courseId}`;

  if (!courseId || (mode !== "published" && mode !== "draft")) {
    redirect("/dashboard");
  }

  const publish = mode === "published";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!publish) {
    const { count } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId);

    if ((count ?? 0) > 0) {
      redirect(targetPath);
    }
  }

  if (publish) {
    const { data: course } = await supabase
      .from("courses")
      .select("kind,cancellation_model,workshop_storno_policy")
      .eq("id", courseId)
      .eq("teacher_id", user.id)
      .maybeSingle<CourseOwnerRow>();

    const missingWorkshopPolicy =
      course?.kind === "workshop" &&
      !getWorkshopCancellationPolicyValue({ cancellation_policy: course.workshop_storno_policy });
    const missingCoursePolicy =
      course?.kind === "course" &&
      !getCourseTerminationModelValue({ termination_model: course.cancellation_model });

    if (!course || missingWorkshopPolicy || missingCoursePolicy) {
      redirect(withSavedParam(targetPath, "missing_policy"));
    }
  }

  const { error } = await supabase
    .from("courses")
    .update({ is_published: publish })
    .eq("id", courseId)
    .eq("teacher_id", user.id);

  if (error) {
    redirect(targetPath);
  }

  redirect(withSavedParam(targetPath, publish ? "published" : "draft"));
}

export async function scheduleCourseEndAction(formData: FormData) {
  const courseId = String(formData.get("course_id") || "").trim();
  const endDate = String(formData.get("end_date") || "").trim();
  const redirectTo = String(formData.get("redirect_to") || "").trim();
  const targetPath = redirectTo || `/dashboard/courses/${courseId}`;

  if (!courseId || !endDate) {
    redirect(`${targetPath}${targetPath.includes("?") ? "&" : "?"}saved=ending_invalid`);
  }

  const endsAt = toCourseEndIso(endDate);
  if (!endsAt) {
    redirect(`${targetPath}${targetPath.includes("?") ? "&" : "?"}saved=ending_invalid`);
  }

  const minimumEndDate = getMinimumCourseEndDate();
  if (new Date(endsAt).getTime() < minimumEndDate.getTime()) {
    redirect(`${targetPath}${targetPath.includes("?") ? "&" : "?"}saved=ending_too_soon`);
  }

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdmin();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: course, error: courseError } = await admin
    .from("courses")
    .select("id,title,kind,teacher_id,ends_at,cancellation_model,workshop_storno_policy,location,location_details,instructor_name")
    .eq("id", courseId)
    .eq("teacher_id", user.id)
    .maybeSingle<CourseOwnerRow>();

  if (courseError || !course || course.kind !== "course") {
    redirect(`${targetPath}${targetPath.includes("?") ? "&" : "?"}saved=ending_invalid`);
  }

  const scheduledAt = new Date().toISOString();
  const { error: updateCourseError } = await admin
    .from("courses")
    .update({
      ends_at: endsAt,
      end_scheduled_at: scheduledAt,
      end_reason: "provider_scheduled_mvp",
    })
    .eq("id", courseId)
    .eq("teacher_id", user.id)
    .eq("kind", "course");

  if (updateCourseError) {
    redirect(`${targetPath}${targetPath.includes("?") ? "&" : "?"}saved=ending_error`);
  }

  const [{ data: registrationIntents }, { data: profile }] = await Promise.all([
    admin
      .from("course_registration_intents")
      .select("id,first_name,last_name,email,stripe_subscription_id")
      .eq("course_id", courseId)
      .eq("status", "checkout_completed")
      .returns<RegistrationIntentNotificationRow[]>(),
    admin
      .from("profiles")
      .select("first_name,last_name,provider_type,organization_name")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>(),
  ]);

  const providerType = profile?.provider_type ?? "independent_teacher";
  const providerName = getProviderDisplayName(providerType, {
    first_name: profile?.first_name,
    last_name: profile?.last_name,
    organization_name: profile?.organization_name,
  });

  const stripe = getStripe();
  const cancelAt = Math.floor(new Date(endsAt).getTime() / 1000);
  let hadSubscriptionErrors = false;

  for (const intent of registrationIntents ?? []) {
    if (intent.stripe_subscription_id) {
      try {
        await stripe.subscriptions.update(intent.stripe_subscription_id, {
          cancel_at: cancelAt,
          proration_behavior: "none",
        });

        await admin
          .from("course_registration_intents")
          .update({ subscription_end_scheduled_at: endsAt })
          .eq("id", intent.id);
      } catch (error) {
        hadSubscriptionErrors = true;
        console.error("[course end scheduling]", {
          context: "stripe.subscription.update",
          registrationIntentId: intent.id,
          subscriptionId: intent.stripe_subscription_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (intent.email) {
      try {
        await sendCourseEndingNotificationEmail({
          registrationIntentId: intent.id,
          courseTitle: course.title ?? "Kurs",
          providerType,
          providerName,
          instructorName: course.instructor_name,
          customerName:
            [intent.first_name, intent.last_name].filter(Boolean).join(" ").trim() || "Kursteilnehmer*in",
          customerEmail: intent.email,
          courseEndsAt: endsAt,
          cancellationLabel: course.cancellation_model
            ? getCancellationModelLabel(course.cancellation_model)
            : null,
          location: course.location,
          locationDetails: course.location_details,
        });

        await admin
          .from("course_registration_intents")
          .update({ course_end_notification_sent_at: new Date().toISOString() })
          .eq("id", intent.id);
      } catch (error) {
        console.error("[course end scheduling]", {
          context: "send.course_end_notification",
          registrationIntentId: intent.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const result = hadSubscriptionErrors ? "ending_partial" : "ending_scheduled";
  redirect(`${targetPath}${targetPath.includes("?") ? "&" : "?"}saved=${result}&notice_days=${COURSE_END_NOTICE_DAYS}`);
}

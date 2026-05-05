import "server-only";
import { getBerlinTodayDate } from "@/lib/course-lifecycle-shared";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

function toStopDateEndIso(stopDate: string): string {
  return `${stopDate}T23:59:59.999+01:00`;
}

function toDateStartUnix(date: string): number {
  return Math.floor(new Date(`${date}T00:00:00+01:00`).getTime() / 1000);
}

type SyncIntentRow = {
  id: string;
  course_id: string;
  stripe_subscription_id: string | null;
  status: string | null;
  subscription_status: string | null;
  subscription_pause_end_date: string | null;
};

type SyncCourseRow = {
  id: string;
  kind: string | null;
  status: string | null;
  pause_end_date: string | null;
};

async function syncStripePauseStateForIntents(intentIds: string[]) {
  if (intentIds.length === 0) return;

  const admin = createSupabaseAdmin();
  const stripe = getStripe();
  const uniqueIntentIds = Array.from(new Set(intentIds));
  const { data: intents } = await admin
    .from("course_registration_intents")
    .select("id,course_id,stripe_subscription_id,status,subscription_status,subscription_pause_end_date")
    .in("id", uniqueIntentIds)
    .returns<SyncIntentRow[]>();

  const relevantIntents = (intents ?? []).filter(
    (intent) => intent.status === "checkout_completed" && intent.stripe_subscription_id
  );
  if (relevantIntents.length === 0) return;

  const courseIds = Array.from(new Set(relevantIntents.map((intent) => intent.course_id)));
  const { data: courses } = await admin
    .from("courses")
    .select("id,kind,status,pause_end_date")
    .in("id", courseIds)
    .returns<SyncCourseRow[]>();
  const courseById = new Map((courses ?? []).map((course) => [course.id, course]));

  for (const intent of relevantIntents) {
    const course = courseById.get(intent.course_id);
    let desiredPauseEndDate: string | null = null;

    if (course?.kind === "course" && course.status === "paused" && course.pause_end_date) {
      desiredPauseEndDate = course.pause_end_date;
    }

    if (intent.subscription_status === "paused" && intent.subscription_pause_end_date) {
      if (!desiredPauseEndDate || intent.subscription_pause_end_date > desiredPauseEndDate) {
        desiredPauseEndDate = intent.subscription_pause_end_date;
      }
    }

    try {
      if (desiredPauseEndDate) {
        await stripe.subscriptions.update(intent.stripe_subscription_id as string, {
          pause_collection: {
            behavior: "void",
            resumes_at: toDateStartUnix(desiredPauseEndDate),
          },
          proration_behavior: "none",
        });
      } else {
        await stripe.subscriptions.update(intent.stripe_subscription_id as string, {
          pause_collection: "" as unknown as undefined,
          proration_behavior: "none",
        });
      }
    } catch (error) {
      console.error("[course lifecycle] stripe pause sync failed", {
        intentId: intent.id,
        courseId: intent.course_id,
        subscriptionId: intent.stripe_subscription_id,
        desiredPauseEndDate,
        error,
      });
    }
  }
}

async function collectIntentIdsForCourses(courseIds: string[]) {
  if (courseIds.length === 0) return [] as string[];

  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("course_registration_intents")
    .select("id")
    .in("course_id", courseIds)
    .eq("status", "checkout_completed")
    .returns<Array<{ id: string }>>();

  return (data ?? []).map((row) => row.id);
}

export async function runCourseLifecycleJob(referenceDate: Date = new Date()) {
  const admin = createSupabaseAdmin();
  const today = getBerlinTodayDate(referenceDate);

  const intentIdsToSync = new Set<string>();

  const { data: coursesDueToResume, error: coursesDueToResumeError } = await admin
    .from("courses")
    .select("id")
    .eq("kind", "course")
    .eq("status", "paused")
    .lte("pause_end_date", today)
    .returns<Array<{ id: string }>>();

  if (coursesDueToResumeError) {
    throw new Error(`resume transition lookup failed: ${coursesDueToResumeError.message}`);
  }

  const { data: resumedCourses, error: resumeError } = await admin
    .from("courses")
    .update({
      status: "active",
      is_published: true,
      pause_start_date: null,
      pause_end_date: null,
    })
    .eq("kind", "course")
    .eq("status", "paused")
    .lte("pause_end_date", today)
    .select("id");

  if (resumeError) {
    throw new Error(`resume transition failed: ${resumeError.message}`);
  }

  for (const id of await collectIntentIdsForCourses((coursesDueToResume ?? []).map((row) => row.id))) {
    intentIdsToSync.add(id);
  }

  const { data: coursesDueToPause, error: coursesDueToPauseError } = await admin
    .from("courses")
    .select("id")
    .eq("kind", "course")
    .eq("status", "pause_scheduled")
    .lte("pause_start_date", today)
    .returns<Array<{ id: string }>>();

  if (coursesDueToPauseError) {
    throw new Error(`pause transition lookup failed: ${coursesDueToPauseError.message}`);
  }

  const { data: pausedCourses, error: pauseError } = await admin
    .from("courses")
    .update({
      status: "paused",
      is_published: false,
    })
    .eq("kind", "course")
    .eq("status", "pause_scheduled")
    .lte("pause_start_date", today)
    .select("id");

  if (pauseError) {
    throw new Error(`pause transition failed: ${pauseError.message}`);
  }

  for (const id of await collectIntentIdsForCourses((coursesDueToPause ?? []).map((row) => row.id))) {
    intentIdsToSync.add(id);
  }

  const { data: dueToEnd, error: dueToEndError } = await admin
    .from("courses")
    .select("id,stop_date")
    .eq("kind", "course")
    .eq("status", "stop_scheduled")
    .lte("stop_date", today)
    .returns<Array<{ id: string; stop_date: string | null }>>();

  if (dueToEndError) {
    throw new Error(`stop transition lookup failed: ${dueToEndError.message}`);
  }

  let endedCount = 0;
  for (const course of dueToEnd ?? []) {
    if (!course.stop_date) continue;

    const { error: endError } = await admin
      .from("courses")
      .update({
        status: "ended",
        is_published: false,
        pause_start_date: null,
        pause_end_date: null,
        ends_at: toStopDateEndIso(course.stop_date),
      })
      .eq("id", course.id)
      .eq("status", "stop_scheduled");

    if (endError) {
      throw new Error(`stop transition failed: ${endError.message}`);
    }

    endedCount += 1;
  }

  const { data: resumedParticipants, error: participantResumeError } = await admin
    .from("course_registration_intents")
    .update({
      subscription_status: "active",
      subscription_pause_start_date: null,
      subscription_pause_end_date: null,
    })
    .in("subscription_status", ["pause_scheduled", "paused"])
    .lte("subscription_pause_end_date", today)
    .select("id");

  if (participantResumeError) {
    throw new Error(`participant resume transition failed: ${participantResumeError.message}`);
  }
  for (const row of resumedParticipants ?? []) {
    intentIdsToSync.add(row.id);
  }

  const { data: pausedParticipants, error: participantPauseError } = await admin
    .from("course_registration_intents")
    .update({
      subscription_status: "paused",
    })
    .eq("subscription_status", "pause_scheduled")
    .lte("subscription_pause_start_date", today)
    .select("id");

  if (participantPauseError) {
    throw new Error(`participant pause transition failed: ${participantPauseError.message}`);
  }
  for (const row of pausedParticipants ?? []) {
    intentIdsToSync.add(row.id);
  }

  const { data: cancelledParticipants, error: participantCancelError } = await admin
    .from("course_registration_intents")
    .update({
      subscription_status: "cancelled",
      subscription_cancelled_at: new Date().toISOString(),
      subscription_pause_start_date: null,
      subscription_pause_end_date: null,
    })
    .eq("subscription_status", "cancel_scheduled")
    .lte("subscription_stop_date", today)
    .select("id");

  if (participantCancelError) {
    throw new Error(`participant cancellation transition failed: ${participantCancelError.message}`);
  }
  for (const row of cancelledParticipants ?? []) {
    intentIdsToSync.add(row.id);
  }

  await syncStripePauseStateForIntents(Array.from(intentIdsToSync));

  return {
    processedDate: today,
    resumedCount: resumedCourses?.length ?? 0,
    pausedCount: pausedCourses?.length ?? 0,
    endedCount,
    resumedParticipantsCount: resumedParticipants?.length ?? 0,
    pausedParticipantsCount: pausedParticipants?.length ?? 0,
    cancelledParticipantsCount: cancelledParticipants?.length ?? 0,
  };
}

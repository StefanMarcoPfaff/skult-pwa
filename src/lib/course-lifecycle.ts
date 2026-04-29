import "server-only";
import { getBerlinTodayDate } from "@/lib/course-lifecycle-shared";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

function toStopDateEndIso(stopDate: string): string {
  return `${stopDate}T23:59:59.999+01:00`;
}

export async function runCourseLifecycleJob(referenceDate: Date = new Date()) {
  const admin = createSupabaseAdmin();
  const today = getBerlinTodayDate(referenceDate);

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

  return {
    processedDate: today,
    resumedCount: resumedCourses?.length ?? 0,
    pausedCount: pausedCourses?.length ?? 0,
    endedCount,
  };
}

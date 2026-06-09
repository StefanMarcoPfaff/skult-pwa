import { redirect } from "next/navigation";
import {
  buildCheckInAccessUrl,
  generateCheckInAccessToken,
  getDefaultCheckInAccessExpiry,
  hashCheckInAccessToken,
} from "@/lib/checkin-access-links";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CourseRow = {
  id: string;
  kind: string | null;
  teacher_id: string | null;
  ends_at: string | null;
};

type SessionRow = {
  ends_at: string | null;
};

export default async function DashboardCourseCheckInRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createSupabaseAdmin();
  const { data: course } = await admin
    .from("courses")
    .select("id,kind,teacher_id,ends_at")
    .eq("id", id)
    .maybeSingle<CourseRow>();

  if (!course || course.teacher_id !== user.id) {
    redirect("/dashboard/courses");
  }

  const { data: sessions } = await admin
    .from("course_sessions")
    .select("ends_at")
    .eq("course_id", course.id)
    .returns<SessionRow[]>();

  const token = generateCheckInAccessToken();
  const expiresAt = getDefaultCheckInAccessExpiry({
    courseEndsAt: course.ends_at,
    sessionEndsAt: (sessions ?? []).map((session) => session.ends_at),
  });

  const { error } = await admin.from("checkin_access_links").insert({
    token_hash: hashCheckInAccessToken(token),
    course_id: course.id,
    scope: "workshop",
    expires_at: expiresAt.toISOString(),
    created_by: user.id,
    metadata: {
      created_from: "dashboard_check_in_button",
      course_kind: course.kind,
    },
  });

  if (error) {
    redirect(`/dashboard/courses/${course.id}?saved=checkin_link_error`);
  }

  redirect(buildCheckInAccessUrl(token));
}

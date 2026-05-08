import { NextResponse } from "next/server";
import { buildCalendarFile } from "@/lib/calendar";
import {
  buildOfferCalendarFileInput,
  type OfferCalendarCourseRow,
  type OfferCalendarSessionRow,
} from "@/lib/calendar-resolver";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const [{ data: course }, { data: sessions }] = await Promise.all([
    admin
      .from("courses")
      .select(
        "id,title,kind,location,location_details,starts_at,duration_minutes,weekday,start_time,recurrence_type"
      )
      .eq("id", id)
      .eq("teacher_id", user.id)
      .maybeSingle<OfferCalendarCourseRow>(),
    admin
      .from("course_sessions")
      .select("id,starts_at,ends_at")
      .eq("course_id", id)
      .order("starts_at", { ascending: true })
      .returns<OfferCalendarSessionRow[]>(),
  ]);

  if (!course) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const calendarInput = buildOfferCalendarFileInput(course, sessions ?? []);
  if (!calendarInput) {
    return NextResponse.json({ error: "calendar_unavailable" }, { status: 409 });
  }

  const { filename, content } = buildCalendarFile(calendarInput);
  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}

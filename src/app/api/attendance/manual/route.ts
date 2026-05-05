import { NextResponse } from "next/server";
import { recordAttendanceForTicket, removeAttendanceForTicket } from "@/lib/attendance";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ManualAttendanceRequest = {
  courseId?: string;
  sessionId?: string | null;
  eventDate?: string | null;
  ticketId?: string;
  present?: boolean;
  room?: string | null;
  instructorName?: string | null;
};

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await req.json()) as ManualAttendanceRequest;
  const courseId = String(body.courseId ?? "").trim();
  const ticketId = String(body.ticketId ?? "").trim();
  const sessionId = body.sessionId ? String(body.sessionId).trim() : null;
  const eventDate = body.eventDate ? String(body.eventDate).trim() : null;

  if (!courseId || !ticketId || (!sessionId && !eventDate)) {
    return NextResponse.json({ error: "Missing attendance context." }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data: course } = await admin
    .from("courses")
    .select("id,teacher_id")
    .eq("id", courseId)
    .maybeSingle<{ id: string; teacher_id: string | null }>();

  if (!course || course.teacher_id !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (body.present === false) {
    await removeAttendanceForTicket({ courseId, sessionId, eventDate, ticketId });
    return NextResponse.json({ ok: true, present: false });
  }

  const result = await recordAttendanceForTicket({
    courseId,
    sessionId,
    eventDate,
    ticketId,
    checkedInBy: user.id,
    method: "manual",
    room: body.room ?? null,
    instructorName: body.instructorName ?? null,
  });

  return NextResponse.json({
    ok: true,
    present: true,
    alreadyPresent: result.alreadyRecorded,
    checkedInAt: result.attendance.checked_in_at,
  });
}

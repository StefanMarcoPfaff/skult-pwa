import { NextResponse } from "next/server";
import { recordAttendanceForTicket, recordAttendanceForTicketToken, type AttendanceStatus } from "@/lib/attendance";
import { loadValidCheckInAccessLink } from "@/lib/checkin-access-links";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type TeacherMagicLinkAttendanceRequest = {
  accessToken?: string;
  ticketId?: string;
  ticketToken?: string;
  attendanceStatus?: "present" | "excused";
  sessionId?: string | null;
  eventDate?: string | null;
  room?: string | null;
  instructorName?: string | null;
};

function getTodayDateKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getDateKey(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function POST(req: Request) {
  const body = (await req.json()) as TeacherMagicLinkAttendanceRequest;
  const accessToken = String(body.accessToken ?? "").trim();
  const ticketId = String(body.ticketId ?? "").trim();
  const ticketToken = String(body.ticketToken ?? "").trim();
  const attendanceStatus: AttendanceStatus = body.attendanceStatus === "excused" ? "excused" : "present";
  const sessionId = body.sessionId ? String(body.sessionId).trim() : null;
  const eventDate = body.eventDate ? String(body.eventDate).trim() : null;

  if (!accessToken || (!ticketId && !ticketToken) || (!sessionId && !eventDate)) {
    return NextResponse.json({ error: "Missing attendance context." }, { status: 400 });
  }

  if (!eventDate || eventDate.slice(0, 10) !== getTodayDateKey()) {
    return NextResponse.json({ error: "Heute ist kein Check-in für dieses Angebot möglich." }, { status: 400 });
  }

  const verified = await loadValidCheckInAccessLink(accessToken);
  if (!verified) {
    return NextResponse.json({ error: "Dieser Check-in-Link ist abgelaufen oder ungültig." }, { status: 403 });
  }

  if (sessionId) {
    const admin = createSupabaseAdmin();
    const { data: session } = await admin
      .from("course_sessions")
      .select("course_id,starts_at")
      .eq("id", sessionId)
      .maybeSingle<{ course_id: string; starts_at: string | null }>();

    if (!session || session.course_id !== verified.link.course_id || getDateKey(session.starts_at) !== eventDate.slice(0, 10)) {
      return NextResponse.json({ error: "Heute ist kein Check-in für dieses Angebot möglich." }, { status: 400 });
    }
  }

  try {
    const common = {
      courseId: verified.link.course_id,
      sessionId,
      eventDate,
      checkedInBy: null,
      method: "manual" as const,
      attendanceStatus,
      room: body.room ?? null,
      instructorName: body.instructorName ?? null,
      source: ticketToken ? ("qr_scan" as const) : ("checkin_link" as const),
      checkInAccessLinkId: verified.link.id,
      checkedInByLabel: "Check-in-Link",
      overwriteExisting: true,
      updateLegacyTicket: false,
      allowLegacyFallback: false,
    };

    const result = ticketToken
      ? await recordAttendanceForTicketToken({
          ...common,
          qrToken: ticketToken,
          method: "qr_scan",
          attendanceStatus: "present",
        })
      : await recordAttendanceForTicket({
          ...common,
          ticketId,
        });

    const admin = createSupabaseAdmin();
    await admin
      .from("checkin_access_links")
      .update({
        last_used_at: new Date().toISOString(),
        metadata: {
          ...(verified.link.metadata ?? {}),
          last_checkin_source: "teacher_magic_link",
          last_checked_in_ticket_id: result.ticket.id,
          last_checked_in_at: result.attendance.checked_in_at,
          last_attendance_status: result.attendance.attendance_status,
          last_checked_in_by_label: "Check-in-Link",
        },
      })
      .eq("id", verified.link.id);

    return NextResponse.json({
      ok: true,
      alreadyPresent: result.alreadyRecorded,
      checkedInAt: result.attendance.checked_in_at,
      attendanceStatus: result.attendance.attendance_status ?? attendanceStatus,
      ticketId: result.ticket.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Check-in failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

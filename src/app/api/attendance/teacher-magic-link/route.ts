import { NextResponse } from "next/server";
import { recordAttendanceForTicket, recordAttendanceForTicketToken } from "@/lib/attendance";
import { loadValidCheckInAccessLink } from "@/lib/checkin-access-links";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type TeacherMagicLinkAttendanceRequest = {
  accessToken?: string;
  ticketId?: string;
  ticketToken?: string;
  sessionId?: string | null;
  eventDate?: string | null;
  room?: string | null;
  instructorName?: string | null;
};

export async function POST(req: Request) {
  const body = (await req.json()) as TeacherMagicLinkAttendanceRequest;
  const accessToken = String(body.accessToken ?? "").trim();
  const ticketId = String(body.ticketId ?? "").trim();
  const ticketToken = String(body.ticketToken ?? "").trim();
  const sessionId = body.sessionId ? String(body.sessionId).trim() : null;
  const eventDate = body.eventDate ? String(body.eventDate).trim() : null;

  if (!accessToken || (!ticketId && !ticketToken) || (!sessionId && !eventDate)) {
    return NextResponse.json({ error: "Missing attendance context." }, { status: 400 });
  }

  const verified = await loadValidCheckInAccessLink(accessToken);
  if (!verified) {
    return NextResponse.json({ error: "Dieser Check-in-Link ist abgelaufen oder ungültig." }, { status: 403 });
  }

  try {
    const common = {
      courseId: verified.link.course_id,
      sessionId,
      eventDate,
      checkedInBy: null,
      method: "manual" as const,
      room: body.room ?? null,
      instructorName: body.instructorName ?? null,
      source: "teacher_magic_link" as const,
      checkInAccessLinkId: verified.link.id,
      checkedInByLabel: "Check-in-Link",
    };

    const result = ticketToken
      ? await recordAttendanceForTicketToken({
          ...common,
          qrToken: ticketToken,
          method: "teacher_scan",
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
          last_checked_in_by_label: "Check-in-Link",
        },
      })
      .eq("id", verified.link.id);

    return NextResponse.json({
      ok: true,
      alreadyPresent: result.alreadyRecorded,
      checkedInAt: result.attendance.checked_in_at,
      ticketId: result.ticket.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Check-in failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

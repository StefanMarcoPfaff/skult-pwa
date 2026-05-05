import { NextResponse } from "next/server";
import { recordAttendanceForTicketToken } from "@/lib/attendance";
import { verifySessionCheckInToken } from "@/lib/session-checkin-token";

export const runtime = "nodejs";

type SessionSelfCheckInRequest = {
  sessionToken?: string;
  ticketToken?: string;
};

export async function POST(req: Request) {
  const body = (await req.json()) as SessionSelfCheckInRequest;
  const sessionToken = String(body.sessionToken ?? "").trim();
  const ticketToken = String(body.ticketToken ?? "").trim();

  if (!sessionToken || !ticketToken) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const verified = verifySessionCheckInToken(sessionToken);
  if (!verified) {
    return NextResponse.json({ error: "Session QR is invalid or expired." }, { status: 400 });
  }

  try {
    const result = await recordAttendanceForTicketToken({
      qrToken: ticketToken,
      courseId: verified.courseId,
      sessionId: verified.sessionId,
      eventDate: verified.eventDate,
      checkedInBy: null,
      method: "participant_scan",
    });

    return NextResponse.json({
      ok: true,
      alreadyPresent: result.alreadyRecorded,
      checkedInAt: result.attendance.checked_in_at,
      customerName: result.ticket.customer_name,
      customerEmail: result.ticket.customer_email,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Self check-in failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

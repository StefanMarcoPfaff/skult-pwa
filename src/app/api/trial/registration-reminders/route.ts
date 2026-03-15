import { NextResponse } from "next/server";
import { runTrialRegistrationFollowupJob } from "@/lib/trial-registration-followups";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runTrialRegistrationFollowupJob();
    return NextResponse.json({
      ok: true,
      eligibleCount: result.eligibleCount,
      reminder24hSentCount: result.reminder24hSentCount,
      reminder48hSentCount: result.reminder48hSentCount,
      reminder72hSentCount: result.reminder72hSentCount,
      expirySentCount: result.expirySentCount,
      skippedAlreadyConvertedCount: result.skippedAlreadyConvertedCount,
      skippedReasons: result.skippedReasons,
      failuresCount: result.failuresCount,
      scannedCandidateCount: result.scannedCandidateCount,
      updatedReservationCount: result.updatedReservationCount,
      now: result.now,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Serverfehler";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

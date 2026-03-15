import { NextResponse } from "next/server";
import { runTrialDecisionReminderJob } from "@/lib/trial-decision-reminders";

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
    const result = await runTrialDecisionReminderJob();
    return NextResponse.json({
      ok: true,
      scannedCandidateCount: result.scannedCandidateCount,
      eligibleCount: result.eligibleCount,
      reminderEmailsAttempted: result.attemptedCount,
      reminderEmailsSent: result.sentCount,
      reminderEmailsFailed: result.failedCount,
      updatedReservationCount: result.updatedReservationCount,
      skippedReasons: result.skippedReasons,
      dueBefore: result.dueBefore,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Serverfehler";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

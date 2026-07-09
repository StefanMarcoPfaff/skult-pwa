import { NextResponse } from "next/server";
import { processSubscriptionMonthlyDocumentsForTransferredBatches } from "@/lib/payments/subscriptions/monthly-documents";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

async function handleSubscriptionMonthlyDocumentsCron(request: Request) {
  if (!isAuthorized(request)) {
    console.warn("[subscription-monthly-documents-cron] unauthorized request", {
      hasCronSecret: Boolean(process.env.CRON_SECRET),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processSubscriptionMonthlyDocumentsForTransferredBatches();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Serverfehler";
    console.error("[subscription-monthly-documents-cron] failed", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleSubscriptionMonthlyDocumentsCron(request);
}

export async function POST(request: Request) {
  return handleSubscriptionMonthlyDocumentsCron(request);
}

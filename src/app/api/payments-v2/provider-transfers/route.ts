import { NextResponse } from "next/server";
import { runPayableOneTimeProviderTransferJob } from "@/lib/payments/provider-transfer-job";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

async function handleProviderTransfersCron(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runPayableOneTimeProviderTransferJob();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Serverfehler";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleProviderTransfersCron(request);
}

export async function POST(request: Request) {
  return handleProviderTransfersCron(request);
}

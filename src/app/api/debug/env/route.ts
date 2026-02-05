import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    hasWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    webhookSecretStartsWith: process.env.STRIPE_WEBHOOK_SECRET?.slice(0, 6) ?? null,
  });
}

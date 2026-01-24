import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    hasStripeSecret: !!process.env.STRIPE_SECRET_KEY,
    startsWith: process.env.STRIPE_SECRET_KEY?.slice(0, 7) ?? null, // sollte "sk_test" sein
  });
}

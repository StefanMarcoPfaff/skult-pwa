import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json({ error: "missing session_id" }, { status: 400 });
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  const bookingId =
    session.metadata?.bookingId ??
    session.client_reference_id ??
    null;

  if (!bookingId) {
    return NextResponse.json({ error: "bookingId not found" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("bookings")
    .select("id,status,attendee_key,course_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    bookingId: data?.id ?? bookingId,
    status: data?.status ?? null,
    attendeeKey: data?.attendee_key ?? null,
    courseId: data?.course_id ?? null,
  });
}

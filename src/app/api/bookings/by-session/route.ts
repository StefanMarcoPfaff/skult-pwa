import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { finalizeWorkshopBookingBySession } from "@/lib/workshop-booking-finalization";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json({ error: "missing session_id" }, { status: 400 });
    }

    const finalized = await finalizeWorkshopBookingBySession(sessionId);

    if (finalized) {
      return NextResponse.json({
        bookingId: finalized.bookingId,
        status: finalized.status,
        attendeeKey: finalized.attendeeKey,
        courseId: finalized.courseId,
        workshopTitle: finalized.workshopTitle,
        customerName: finalized.customerName,
        customerEmail: finalized.customerEmail,
        location: finalized.location,
        locationDetails: finalized.locationDetails,
        sessionLines: finalized.sessionLines,
        providerName: finalized.providerName,
        instructorName: finalized.instructorName,
        stornoPolicyLabel: finalized.stornoPolicyLabel,
        priceLabel: finalized.priceLabel,
        qrToken: finalized.ticket?.qr_token ?? null,
      });
    }

    const { data, error } = await supabase
      .from("bookings")
      .select("id,status,attendee_key,course_id,customer_email")
      .eq("payment_session_id", sessionId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      bookingId: data?.id ?? null,
      status: data?.status ?? null,
      attendeeKey: data?.attendee_key ?? null,
      courseId: data?.course_id ?? null,
      customerEmail: data?.customer_email ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to load booking";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

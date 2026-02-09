import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase-server";
import crypto from "crypto";

export const runtime = "nodejs";

function makeAttendeeKey() {
  return crypto.randomBytes(16).toString("hex");
}

export async function POST(req: Request) {
  try {
    const { courseId } = (await req.json()) as { courseId?: string };
    if (!courseId) {
      return NextResponse.json({ error: "courseId fehlt" }, { status: 400 });
    }

    const supabase = await createClient();

    // 1) Workshop laden & prüfen
    const { data: course, error: courseErr } = await supabase
      .from("courses_lite")
      .select("id,title,price_type,price_cents,currency,offer_type")
      .eq("id", courseId)
      .single();

    if (courseErr || !course) {
      return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    }

    if (course.offer_type !== "workshop") {
      return NextResponse.json({ error: "Checkout nur für Workshops (V1)" }, { status: 400 });
    }

    if (course.price_type !== "paid" || !course.price_cents || course.price_cents <= 0) {
      return NextResponse.json({ error: "Workshop nicht paid konfiguriert" }, { status: 400 });
    }

    // 2) Booking anlegen (pending) — attendee_key ist Pflicht!
    const attendeeKey = makeAttendeeKey();

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .insert({
        course_id: course.id,
        attendee_key: attendeeKey,
        status: "pending",
        payment_provider: "stripe",
      })
      .select("id, attendee_key")
      .single();

    if (bookingErr || !booking) {
      return NextResponse.json(
        { error: bookingErr?.message || "Booking konnte nicht erstellt werden" },
        { status: 500 }
      );
    }

    // 3) Stripe Checkout Session erstellen (bookingId + attendeeKey mitgeben)
    const stripe = getStripe();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: (course.currency || "EUR").toLowerCase(),
            unit_amount: course.price_cents,
            product_data: { name: course.title || "Workshop" },
          },
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&courseId=${course.id}`,
      cancel_url: `${siteUrl}/checkout/cancel?courseId=${course.id}`,

      metadata: {
        bookingId: booking.id,
        courseId: course.id,
        attendeeKey: booking.attendee_key,
      },
      client_reference_id: booking.id,
    });

    // 4) Session-IDs in Supabase speichern (für Success-Page & Debugging)
    const { error: updErr } = await supabase
      .from("bookings")
      .update({
        stripe_session_id: session.id,
        payment_session_id: session.id,
        payment_provider: "stripe",
      })
      .eq("id", booking.id);

    if (updErr) {
      // nicht hart abbrechen – Checkout soll trotzdem funktionieren
      console.warn("⚠️ Could not store stripe_session_id:", updErr.message);
    }

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Serverfehler" }, { status: 500 });
  }
}

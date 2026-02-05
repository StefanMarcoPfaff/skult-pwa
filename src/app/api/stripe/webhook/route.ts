import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// einfacher Supabase Client (RLS ist bei euch disabled)
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error("❌ Webhook signature verification failed:", err.message);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.payment_status === "paid") {
        const bookingId = session.metadata?.bookingId || session.client_reference_id;

        if (!bookingId) {
          console.error("❌ No bookingId in session metadata/client_reference_id");
          return NextResponse.json({ error: "No bookingId found" }, { status: 400 });
        }

        const { error } = await supabase
          .from("bookings")
          .update({ status: "paid" })
          .eq("id", bookingId)
          .neq("status", "paid");

        if (error) {
          console.error("❌ Supabase update failed:", error);
          return NextResponse.json({ error: "DB update failed" }, { status: 500 });
        }

        console.log("✅ Booking marked as paid:", bookingId);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("❌ Webhook handler failed:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

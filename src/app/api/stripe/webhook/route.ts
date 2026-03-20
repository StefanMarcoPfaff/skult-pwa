import { NextResponse } from "next/server";
import Stripe from "stripe";
import { finalizeWorkshopBookingBySession } from "@/lib/workshop-booking-finalization";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function logWebhookEvent(message: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.log("[stripe-webhook]", message, payload);
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Signature verification failed";
    console.error("[stripe-webhook] signature verification failed", message);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  try {
    if (event.type !== "checkout.session.completed") {
      return NextResponse.json({ received: true });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== "paid") {
      return NextResponse.json({ received: true });
    }

    const finalized = await finalizeWorkshopBookingBySession(session.id);
    if (!finalized) {
      return NextResponse.json({ received: true });
    }

    logWebhookEvent("workshop booking finalized", {
      bookingId: finalized.bookingId,
      ticketId: finalized.ticket?.id ?? null,
    });

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Webhook handler failed";
    console.error("[stripe-webhook] handler failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

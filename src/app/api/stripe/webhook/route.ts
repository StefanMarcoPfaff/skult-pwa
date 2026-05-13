import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  finalizeCourseRegistrationCheckoutSession,
  markCourseRegistrationCheckoutFailed,
} from "@/lib/course-registration-finalization";
import { recordStripeWebhookEvent } from "@/lib/payments/ledger";
import { paymentService } from "@/lib/payments/payment-service";
import { finalizeWorkshopBookingBySession } from "@/lib/workshop-booking-finalization";

export const runtime = "nodejs";

function logWebhookEvent(message: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.log("[stripe-webhook]", message, payload);
}

function isCheckoutSessionPaymentConfirmed(
  eventType: Stripe.Event.Type,
  session: Stripe.Checkout.Session
): boolean {
  if (eventType === "checkout.session.async_payment_succeeded") {
    return true;
  }

  return session.payment_status === "paid";
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    const webhook = await paymentService.handleWebhookEvent({
      provider: "stripe",
      signature: sig,
      payload: body,
    });
    event = webhook.event.rawEvent as Stripe.Event;
    await recordStripeWebhookEvent({
      event,
      processingStatus: "processing",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Signature verification failed";
    console.error("[stripe-webhook] signature verification failed", message);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  try {
    if (
      event.type !== "checkout.session.completed" &&
      event.type !== "checkout.session.async_payment_succeeded" &&
      event.type !== "checkout.session.async_payment_failed"
    ) {
      return NextResponse.json({ received: true });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.registrationIntentId) {
      if (event.type === "checkout.session.async_payment_failed") {
        await markCourseRegistrationCheckoutFailed({
          sessionId: session.id,
          expectedIntentId: session.metadata.registrationIntentId,
        });
        await recordStripeWebhookEvent({
          event,
          processingStatus: "failed",
          processedAt: new Date().toISOString(),
        });
        return NextResponse.json({ received: true });
      }

      if (!isCheckoutSessionPaymentConfirmed(event.type, session)) {
        logWebhookEvent("course registration checkout awaiting confirmed payment", {
          sessionId: session.id,
          eventType: event.type,
          paymentStatus: session.payment_status,
        });
        return NextResponse.json({ received: true });
      }

      const finalized = await finalizeCourseRegistrationCheckoutSession({
        sessionId: session.id,
        expectedIntentId: session.metadata.registrationIntentId,
      });

      logWebhookEvent("course registration checkout handled", {
        sessionId: session.id,
        intentId: finalized.kind === "ignored" ? null : finalized.intentId,
        result: finalized.kind,
      });
      await recordStripeWebhookEvent({
        event,
        processingStatus: finalized.kind === "ignored" ? "ignored" : "processed",
        processedAt: new Date().toISOString(),
      });

      return NextResponse.json({ received: true });
    }

    if (!isCheckoutSessionPaymentConfirmed(event.type, session)) {
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
    await recordStripeWebhookEvent({
      event,
      processingStatus: "processed",
      processedAt: new Date().toISOString(),
    });

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Webhook handler failed";
    console.error("[stripe-webhook] handler failed", message);
    await recordStripeWebhookEvent({
      event,
      processingStatus: "failed",
      processedAt: new Date().toISOString(),
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

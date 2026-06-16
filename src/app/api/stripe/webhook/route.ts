import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  finalizeCourseRegistrationCheckoutSession,
  markCourseRegistrationCheckoutFailed,
} from "@/lib/course-registration-finalization";
import {
  mirrorStripeApplicationFeeEventToLedger,
  mirrorStripeChargeEventToLedger,
  mirrorStripeDisputeEventToLedger,
  mirrorStripeInvoiceEventToLedger,
  mirrorStripePayoutEventToLedger,
  mirrorStripeRefundEventToLedger,
  mirrorStripeTransferEventToLedger,
  recordStripeWebhookEvent,
  updateStripePaymentTransactionStatus,
} from "@/lib/payments/ledger";
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

function toStripeObjectId(
  value:
    | string
    | Stripe.PaymentIntent
    | Stripe.Subscription
    | Stripe.Customer
    | Stripe.DeletedCustomer
    | Stripe.Charge
    | null
    | undefined
): string | null {
  if (typeof value === "string") return value;
  return value?.id ?? null;
}

function normalizeUnixTimestamp(unixTimestamp: number | null | undefined): string | null {
  if (typeof unixTimestamp !== "number" || !Number.isFinite(unixTimestamp) || unixTimestamp <= 0) {
    return null;
  }

  return new Date(unixTimestamp * 1000).toISOString();
}

function getMetadataValue(
  metadata: Stripe.Metadata | null | undefined,
  key: string
): string | null {
  const value = metadata?.[key];
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
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
    const processedAt = new Date().toISOString();
    const eventType = event.type as string;
    const complete = async (processingStatus: "processed" | "failed" | "ignored") => {
      await recordStripeWebhookEvent({
        event,
        processingStatus,
        processedAt,
      });
      return NextResponse.json({ received: true });
    };

    switch (eventType) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.registrationIntentId) {
          if (event.type === "checkout.session.async_payment_failed") {
            await markCourseRegistrationCheckoutFailed({
              sessionId: session.id,
              expectedIntentId: session.metadata.registrationIntentId,
            });
            return complete("failed");
          }

          if (!isCheckoutSessionPaymentConfirmed(event.type, session)) {
            logWebhookEvent("course registration checkout awaiting confirmed payment", {
              sessionId: session.id,
              eventType,
              paymentStatus: session.payment_status,
            });
            return complete("ignored");
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

          return complete(finalized.kind === "ignored" ? "ignored" : "processed");
        }

        if (!isCheckoutSessionPaymentConfirmed(event.type, session)) {
          return complete("ignored");
        }

        const finalized = await finalizeWorkshopBookingBySession(session.id);
        if (!finalized) {
          return complete("ignored");
        }

        logWebhookEvent("workshop booking finalized", {
          bookingId: finalized.bookingId,
          ticketId: finalized.ticket?.id ?? null,
        });
        return complete("processed");
      }
      case "payment_intent.succeeded":
      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const latestCharge = toStripeObjectId(paymentIntent.latest_charge);
        const mirrored = await updateStripePaymentTransactionStatus({
          providerPaymentId: paymentIntent.id,
          providerCheckoutId: getMetadataValue(paymentIntent.metadata, "checkoutSessionId"),
          status: event.type === "payment_intent.succeeded" ? "paid" : "failed",
          amountCents: paymentIntent.amount_received ?? paymentIntent.amount ?? null,
          currency: paymentIntent.currency ?? null,
          providerCustomerId: toStripeObjectId(paymentIntent.customer),
          stripeChargeId: latestCharge,
          paidAt:
            event.type === "payment_intent.succeeded"
              ? normalizeUnixTimestamp(paymentIntent.created)
              : null,
          failedAt:
            event.type === "payment_intent.payment_failed"
              ? normalizeUnixTimestamp(paymentIntent.created)
              : null,
        });
        return complete(mirrored ? "processed" : "ignored");
      }
      case "charge.succeeded":
      case "charge.updated": {
        const charge = event.data.object as Stripe.Charge;
        const mirrored = await mirrorStripeChargeEventToLedger({ charge });
        return complete(mirrored ? "processed" : "ignored");
      }
      case "application_fee.created":
      case "application_fee.refunded": {
        const applicationFee = event.data.object as Stripe.ApplicationFee;
        const mirrored = await mirrorStripeApplicationFeeEventToLedger({ applicationFee });
        return complete(mirrored ? "processed" : "ignored");
      }
      case "transfer.created":
      case "transfer.paid":
      case "transfer.failed": {
        const transfer = event.data.object as Stripe.Transfer;
        const mirrored = await mirrorStripeTransferEventToLedger({
          transfer,
          status:
            eventType === "transfer.failed"
              ? "failed"
              : eventType === "transfer.paid"
                ? "paid"
                : "created",
        });
        return complete(mirrored ? "processed" : "ignored");
      }
      case "payout.paid":
      case "payout.failed": {
        const payout = event.data.object as Stripe.Payout;
        const mirrored = await mirrorStripePayoutEventToLedger({
          payout,
          status: eventType === "payout.paid" ? "paid" : "failed",
        });
        return complete(mirrored ? "processed" : "ignored");
      }
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const mirrored = await mirrorStripeInvoiceEventToLedger({
          invoice,
          status: event.type === "invoice.payment_succeeded" ? "paid" : "failed",
        });
        return complete(mirrored ? "processed" : "ignored");
      }
      case "refund.created":
      case "refund.updated": {
        const refund = event.data.object as Stripe.Refund;
        const mirrored = await mirrorStripeRefundEventToLedger({
          providerPaymentId: toStripeObjectId(refund.payment_intent),
          stripeChargeId: toStripeObjectId(refund.charge),
          providerRefundId: refund.id,
          amountCents: refund.amount ?? null,
          reason: refund.reason ?? null,
          status: refund.status,
          refundedAt: normalizeUnixTimestamp(refund.created),
        });
        return complete(mirrored ? "processed" : "ignored");
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        let mirrored = false;

        for (const refund of charge.refunds?.data ?? []) {
          const mirroredRefund = await mirrorStripeRefundEventToLedger({
            providerPaymentId: toStripeObjectId(charge.payment_intent),
            stripeChargeId: charge.id,
            providerRefundId: refund.id,
            amountCents: refund.amount ?? null,
            reason: refund.reason ?? null,
            status: refund.status,
            refundedAt: normalizeUnixTimestamp(refund.created),
          });
          mirrored = Boolean(mirroredRefund) || mirrored;
        }

        return complete(mirrored ? "processed" : "ignored");
      }
      case "charge.dispute.created":
      case "charge.dispute.closed": {
        const dispute = event.data.object as Stripe.Dispute;
        const mirrored = await mirrorStripeDisputeEventToLedger({
          dispute,
          eventType: eventType === "charge.dispute.created" ? "created" : "closed",
        });
        return complete(mirrored ? "processed" : "ignored");
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        // TODO(payment-v2): Mirror subscription state once the internal subscription model is authoritative.
        return complete("ignored");
      default:
        return complete("ignored");
    }
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

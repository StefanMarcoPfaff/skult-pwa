import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import {
  buildDestinationPaymentIntentData,
  buildDestinationSubscriptionData,
} from "@/lib/stripe-connect";
import type { PaymentProvider } from "@/lib/payments/provider";
import type {
  CancelPayoutInput,
  CancelPayoutResult,
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
  CreateRecurringPaymentInput,
  CreateRecurringPaymentResult,
  GetPaymentStatusInput,
  GetPaymentStatusResult,
  PaymentStatus,
  PaymentWebhookEvent,
  PaymentWebhookEventType,
  PaymentWebhookRequest,
  PaymentWebhookResult,
  RefundPaymentInput,
  RefundPaymentResult,
  SchedulePayoutInput,
  SchedulePayoutResult,
} from "@/lib/payments/types";

function normalizeStripePaymentStatus(status: string | null | undefined): PaymentStatus {
  switch (status) {
    case "paid":
      return "paid";
    case "unpaid":
      return "pending";
    case "no_payment_required":
      return "paid";
    default:
      return "unknown";
  }
}

function normalizeWebhookEventType(type: Stripe.Event.Type): PaymentWebhookEventType {
  if (
    type === "checkout.session.completed" ||
    type === "checkout.session.async_payment_succeeded" ||
    type === "checkout.session.async_payment_failed" ||
    type === "payment_intent.succeeded" ||
    type === "payment_intent.payment_failed" ||
    type === "charge.refunded" ||
    type === "refund.created" ||
    type === "refund.updated" ||
    type === "invoice.payment_succeeded" ||
    type === "invoice.payment_failed" ||
    type === "customer.subscription.updated" ||
    type === "customer.subscription.deleted"
  ) {
    return type;
  }

  return "unknown";
}

function mapCheckoutEventToPaymentStatus(eventType: Stripe.Event.Type, session: Stripe.Checkout.Session): PaymentStatus {
  if (eventType === "checkout.session.async_payment_failed") {
    return "failed";
  }

  return normalizeStripePaymentStatus(session.payment_status);
}

function toStripeObjectId(
  value:
    | string
    | Stripe.PaymentIntent
    | Stripe.Subscription
    | Stripe.Checkout.Session
    | Stripe.Customer
    | Stripe.DeletedCustomer
    | Stripe.Charge
    | null
    | undefined
): string | null {
  if (typeof value === "string") return value;
  return value?.id ?? null;
}

function mapPaymentIntentEventToPaymentStatus(eventType: Stripe.Event.Type): PaymentStatus {
  return eventType === "payment_intent.succeeded" ? "paid" : "failed";
}

function mapRefundStatus(status: Stripe.Refund["status"] | null): PaymentStatus {
  if (status === "failed" || status === "canceled") {
    return "failed";
  }

  if (status === "pending" || status === "requires_action") {
    return "pending";
  }

  return "refunded";
}

function mapInvoiceEventToPaymentStatus(eventType: Stripe.Event.Type, invoice: Stripe.Invoice): PaymentStatus {
  if (eventType === "invoice.payment_failed") {
    return "failed";
  }

  if (invoice.status === "paid") {
    return "paid";
  }

  return "pending";
}

function mapSubscriptionStatus(status: Stripe.Subscription.Status): PaymentStatus {
  if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
    return "cancelled";
  }

  if (status === "active" || status === "trialing") {
    return "paid";
  }

  if (status === "past_due" || status === "incomplete" || status === "paused") {
    return "pending";
  }

  return "unknown";
}

function buildNormalizedWebhookEvent(event: Stripe.Event): PaymentWebhookEvent {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      return {
        provider: "stripe",
        type: normalizeWebhookEventType(event.type),
        referenceType: "checkout_session",
        referenceId: session.id ?? null,
        paymentStatus: mapCheckoutEventToPaymentStatus(event.type, session),
        metadata: session.metadata ?? {},
        rawEvent: event,
      };
    }
    case "payment_intent.succeeded":
    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      return {
        provider: "stripe",
        type: normalizeWebhookEventType(event.type),
        referenceType: "payment_intent",
        referenceId: paymentIntent.id,
        paymentStatus: mapPaymentIntentEventToPaymentStatus(event.type),
        metadata: paymentIntent.metadata ?? {},
        rawEvent: event,
      };
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      return {
        provider: "stripe",
        type: "charge.refunded",
        referenceType: "payment_intent",
        referenceId: toStripeObjectId(charge.payment_intent),
        paymentStatus: "refunded",
        metadata: charge.metadata ?? {},
        rawEvent: event,
      };
    }
    case "refund.created":
    case "refund.updated": {
      const refund = event.data.object as Stripe.Refund;
      return {
        provider: "stripe",
        type: normalizeWebhookEventType(event.type),
        referenceType: "payment_intent",
        referenceId: toStripeObjectId(refund.payment_intent),
        paymentStatus: mapRefundStatus(refund.status),
        metadata: refund.metadata ?? {},
        rawEvent: event,
      };
    }
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      return {
        provider: "stripe",
        type: normalizeWebhookEventType(event.type),
        referenceType: "subscription",
        referenceId: toStripeObjectId(invoice.parent?.subscription_details?.subscription),
        paymentStatus: mapInvoiceEventToPaymentStatus(event.type, invoice),
        metadata: invoice.metadata ?? {},
        rawEvent: event,
      };
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      return {
        provider: "stripe",
        type: normalizeWebhookEventType(event.type),
        referenceType: "subscription",
        referenceId: subscription.id,
        paymentStatus:
          event.type === "customer.subscription.deleted"
            ? "cancelled"
            : mapSubscriptionStatus(subscription.status),
        metadata: subscription.metadata ?? {},
        rawEvent: event,
      };
    }
    default:
      return {
        provider: "stripe",
        type: "unknown",
        referenceType: "checkout_session",
        referenceId: null,
        paymentStatus: "unknown",
        metadata: {},
        rawEvent: event,
      };
  }
}

export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe" as const;

  private get client() {
    return getStripe();
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CreateCheckoutSessionResult> {
    const session = await this.client.checkout.sessions.create({
      mode: input.mode,
      customer_email: input.customer?.email,
      line_items: input.lineItems.map((item) => ({
        price_data: {
          currency: item.priceData.currency.toLowerCase(),
          unit_amount: item.priceData.unitAmount,
          product_data: {
            name: item.priceData.productName,
          },
        },
        quantity: item.quantity,
      })),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      payment_intent_data: input.providerContext?.connectedAccountId
        ? {
            ...buildDestinationPaymentIntentData(
              input.lineItems.reduce((sum, item) => sum + item.priceData.unitAmount * item.quantity, 0),
              input.providerContext.connectedAccountId,
              input.providerContext.providerType
            ),
            on_behalf_of: input.providerContext.onBehalfOfAccountId ?? input.providerContext.connectedAccountId,
          }
        : undefined,
      metadata: input.metadata,
      client_reference_id: input.clientReferenceId,
    });

    return {
      provider: this.name,
      flow: "checkout",
      sessionId: session.id,
      url: session.url,
      status: normalizeStripePaymentStatus(session.payment_status),
      raw: session,
    };
  }

  async createRecurringPayment(input: CreateRecurringPaymentInput): Promise<CreateRecurringPaymentResult> {
    const session = await this.client.checkout.sessions.create({
      mode: input.mode,
      customer_email: input.customer?.email,
      line_items: input.lineItems.map((item) => ({
        price_data: {
          currency: item.priceData.currency.toLowerCase(),
          unit_amount: item.priceData.unitAmount,
          recurring: {
            interval: item.priceData.recurringInterval ?? "month",
          },
          product_data: {
            name: item.priceData.productName,
          },
        },
        quantity: item.quantity,
      })),
      subscription_data: {
        ...(input.providerContext?.connectedAccountId
          ? buildDestinationSubscriptionData(
              input.providerContext.connectedAccountId,
              input.providerContext.providerType
            )
          : {}),
        ...(input.billingCycleAnchorUnix ? { billing_cycle_anchor: input.billingCycleAnchorUnix } : {}),
        metadata: input.metadata,
      },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: input.metadata,
      client_reference_id: input.clientReferenceId,
    });

    return {
      provider: this.name,
      flow: "recurring",
      sessionId: session.id,
      url: session.url,
      status: normalizeStripePaymentStatus(session.payment_status),
      raw: session,
    };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    let paymentIntentId: string | null = null;

    if (input.referenceType === "payment_intent") {
      paymentIntentId = input.referenceId;
    }

    if (input.referenceType === "checkout_session") {
      const session = await this.client.checkout.sessions.retrieve(input.referenceId, {
        expand: ["payment_intent"],
      });
      paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;
    }

    if (!paymentIntentId) {
      throw new Error("No payment intent available for refund.");
    }

    const refund = await this.client.refunds.create({
      payment_intent: paymentIntentId,
      ...(input.amountCents ? { amount: input.amountCents } : {}),
      ...(input.reason ? { reason: this.mapRefundReason(input.reason) } : {}),
      metadata: input.metadata,
    });

    return {
      provider: this.name,
      refundId: refund.id,
      status: refund.status === "failed" ? "failed" : "refunded",
      amountCents: refund.amount ?? null,
      raw: refund,
    };
  }

  async handleWebhookEvent(input: PaymentWebhookRequest): Promise<PaymentWebhookResult> {
    if (!input.signature) {
      throw new Error("Missing stripe signature.");
    }

    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
    }

    const event = this.client.webhooks.constructEvent(input.payload, input.signature, secret);
    const normalizedEvent = buildNormalizedWebhookEvent(event);

    return {
      provider: this.name,
      accepted: normalizedEvent.type !== "unknown",
      event: normalizedEvent,
    };
  }

  async schedulePayout(input: SchedulePayoutInput): Promise<SchedulePayoutResult> {
    const payout = await this.client.payouts.create(
      {
        amount: input.amountCents,
        currency: input.currency.toLowerCase(),
        metadata: input.metadata,
      },
      {
        stripeAccount: input.destinationAccountId,
      }
    );

    return {
      provider: this.name,
      payoutId: payout.id,
      status: payout.status === "paid" ? "paid" : payout.status === "failed" ? "failed" : "pending",
      raw: payout,
    };
  }

  async cancelPayout(input: CancelPayoutInput): Promise<CancelPayoutResult> {
    const payout = await this.client.payouts.cancel(input.payoutId);

    return {
      provider: this.name,
      payoutId: payout.id,
      status: payout.status === "canceled" ? "cancelled" : "pending",
      raw: payout,
    };
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusResult> {
    if (input.referenceType === "checkout_session") {
      const session = await this.client.checkout.sessions.retrieve(input.referenceId);
      return {
        provider: this.name,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        status: normalizeStripePaymentStatus(session.payment_status),
        raw: session,
      };
    }

    if (input.referenceType === "payment_intent") {
      const paymentIntent = await this.client.paymentIntents.retrieve(input.referenceId);
      return {
        provider: this.name,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        status: paymentIntent.status === "succeeded" ? "paid" : paymentIntent.status === "canceled" ? "cancelled" : "pending",
        raw: paymentIntent,
      };
    }

    if (input.referenceType === "subscription") {
      const subscription = await this.client.subscriptions.retrieve(input.referenceId);
      return {
        provider: this.name,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        status: subscription.status === "active" ? "paid" : subscription.status === "canceled" ? "cancelled" : "pending",
        raw: subscription,
      };
    }

    if (input.referenceType === "payout") {
      const payout = await this.client.payouts.retrieve(input.referenceId);
      return {
        provider: this.name,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        status: payout.status === "paid" ? "paid" : payout.status === "failed" ? "failed" : "pending",
        raw: payout,
      };
    }

    return {
      provider: this.name,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      status: "unknown",
    };
  }

  private mapRefundReason(reason: string): Stripe.RefundCreateParams.Reason | undefined {
    if (reason === "duplicate" || reason === "fraudulent" || reason === "requested_by_customer") {
      return reason;
    }

    return undefined;
  }
}

export function createStripePaymentProvider(): StripePaymentProvider {
  return new StripePaymentProvider();
}

import type Stripe from "stripe";
import type { ProviderType } from "@/lib/provider-profiles";

export type PaymentProviderName = "stripe" | (string & {});

export type PaymentFlowType = "checkout" | "recurring";
export type PaymentMode = "payment" | "subscription";
export type PaymentReferenceType = "checkout_session" | "payment_intent" | "subscription" | "payout";

export type PaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "refunded"
  | "requires_action"
  | "unknown";

export type PayoutStatus = "scheduled" | "cancelled" | "pending" | "paid" | "failed" | "not_supported";

export type PaymentMetadata = Record<string, string>;

export type PaymentLineItemInput = {
  quantity: number;
  priceData: {
    currency: string;
    unitAmount: number;
    productName: string;
    recurringInterval?: "day" | "week" | "month" | "year";
  };
};

export type PaymentCustomerInput = {
  email?: string;
};

export type ProviderContext = {
  connectedAccountId?: string | null;
  onBehalfOfAccountId?: string | null;
  providerType?: ProviderType | null;
};

export type CreateCheckoutSessionInput = {
  provider: PaymentProviderName;
  mode: Extract<PaymentMode, "payment">;
  successUrl: string;
  cancelUrl: string;
  customer?: PaymentCustomerInput;
  lineItems: PaymentLineItemInput[];
  metadata?: PaymentMetadata;
  clientReferenceId?: string;
  providerContext?: ProviderContext;
};

export type CreateCheckoutSessionResult = {
  provider: PaymentProviderName;
  flow: "checkout";
  sessionId: string;
  url: string | null;
  status: PaymentStatus;
  raw?: unknown;
};

export type CreateRecurringPaymentInput = {
  provider: PaymentProviderName;
  mode: Extract<PaymentMode, "subscription">;
  successUrl: string;
  cancelUrl: string;
  customer?: PaymentCustomerInput;
  lineItems: PaymentLineItemInput[];
  metadata?: PaymentMetadata;
  clientReferenceId?: string;
  providerContext?: ProviderContext;
  billingCycleAnchorUnix?: number;
};

export type CreateRecurringPaymentResult = {
  provider: PaymentProviderName;
  flow: "recurring";
  sessionId: string;
  url: string | null;
  status: PaymentStatus;
  raw?: unknown;
};

export type RefundPaymentInput = {
  provider: PaymentProviderName;
  referenceType: Extract<PaymentReferenceType, "checkout_session" | "payment_intent">;
  referenceId: string;
  amountCents?: number;
  reason?: string;
  metadata?: PaymentMetadata;
};

export type RefundPaymentResult = {
  provider: PaymentProviderName;
  refundId: string;
  status: PaymentStatus;
  amountCents: number | null;
  raw?: unknown;
};

export type PaymentWebhookRequest = {
  provider: PaymentProviderName;
  signature?: string | null;
  payload: string;
};

export type PaymentWebhookEventType =
  | "checkout.session.completed"
  | "checkout.session.async_payment_succeeded"
  | "checkout.session.async_payment_failed"
  | "unknown";

export type PaymentWebhookEvent = {
  provider: PaymentProviderName;
  type: PaymentWebhookEventType;
  referenceType: PaymentReferenceType;
  referenceId: string | null;
  paymentStatus: PaymentStatus;
  metadata: PaymentMetadata;
  rawEvent: unknown;
};

export type PaymentWebhookResult = {
  provider: PaymentProviderName;
  accepted: boolean;
  event: PaymentWebhookEvent;
};

export type SchedulePayoutInput = {
  provider: PaymentProviderName;
  destinationAccountId: string;
  amountCents: number;
  currency: string;
  metadata?: PaymentMetadata;
};

export type SchedulePayoutResult = {
  provider: PaymentProviderName;
  payoutId: string;
  status: PayoutStatus;
  raw?: unknown;
};

export type CancelPayoutInput = {
  provider: PaymentProviderName;
  payoutId: string;
};

export type CancelPayoutResult = {
  provider: PaymentProviderName;
  payoutId: string;
  status: PayoutStatus;
  raw?: unknown;
};

export type GetPaymentStatusInput = {
  provider: PaymentProviderName;
  referenceType: PaymentReferenceType;
  referenceId: string;
};

export type GetPaymentStatusResult = {
  provider: PaymentProviderName;
  referenceType: PaymentReferenceType;
  referenceId: string;
  status: PaymentStatus;
  raw?: unknown;
};

export type LedgerEntryType = "payment_authorized" | "payment_captured" | "payment_refunded" | "payout_scheduled" | "payout_cancelled";

export type LedgerEntry = {
  provider: PaymentProviderName;
  type: LedgerEntryType;
  referenceType: PaymentReferenceType;
  referenceId: string;
  amountCents?: number | null;
  currency?: string | null;
  metadata?: PaymentMetadata;
  createdAt: string;
};

export type StripeCheckoutSession = Stripe.Checkout.Session;
export type StripeRefund = Stripe.Refund;
export type StripeWebhookEvent = Stripe.Event;

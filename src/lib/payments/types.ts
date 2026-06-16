import type Stripe from "stripe";
import type { ProviderType } from "@/lib/provider-profiles";

export type PaymentProviderName = "stripe" | (string & {});

export type PaymentFlowType = "checkout" | "recurring";
export type PaymentMode = "payment" | "subscription";
export type PaymentReferenceType = "checkout_session" | "payment_intent" | "subscription" | "payout";

export const STRIPE_LEDGER_REFERENCE_FIELDS = [
  "stripe_charge_id",
  "stripe_payment_intent_id",
  "stripe_balance_transaction_id",
  "stripe_application_fee_id",
  "stripe_transfer_id",
  "stripe_payout_id",
  "stripe_refund_id",
  "stripe_dispute_id",
] as const;

export type StripeLedgerReferenceField = (typeof STRIPE_LEDGER_REFERENCE_FIELDS)[number];

export type StripeLedgerReferences = Partial<Record<StripeLedgerReferenceField, string | null>>;

export type PaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "refunded"
  | "refunded_partial"
  | "refunded_full"
  | "requires_action"
  | "disputed"
  | "chargeback_lost"
  | "chargeback_won"
  | "unknown";

export type PayoutStatus = "scheduled" | "cancelled" | "pending" | "paid" | "failed" | "not_supported";

export const PAYMENT_TRANSACTION_STATUSES = [
  "pending",
  "paid",
  "failed",
  "cancelled",
  "refunded",
  "refunded_partial",
  "refunded_full",
  "requires_action",
  "disputed",
  "chargeback_lost",
  "chargeback_won",
  "unknown",
] as const;

export type PaymentTransactionStatus = (typeof PAYMENT_TRANSACTION_STATUSES)[number];

export const LEDGER_PAYOUT_STATUSES = [
  "pending",
  "reserved",
  "pending_event_completion",
  "payable",
  "transfer_created",
  "paid_by_stripe",
  "refunded_partial",
  "refunded_full",
  "disputed",
  "chargeback_lost",
  "chargeback_won",
  "batched",
  "available",
  "scheduled",
  "paid",
  "failed",
  "cancelled",
  "held",
] as const;

export type LedgerPayoutStatus = (typeof LEDGER_PAYOUT_STATUSES)[number];

export const REFUND_KINDS = ["partial", "full", "unknown"] as const;
export type RefundKind = (typeof REFUND_KINDS)[number];
export type PaymentRefundStatus = "none" | "partial" | "full";

export function classifyRefundForPayment(input: {
  paymentAmountCents: number;
  cumulativeRefundedAmountCents: number;
}): {
  refundKind: RefundKind;
  refundStatus: PaymentRefundStatus;
  paymentStatus: Extract<PaymentTransactionStatus, "paid" | "refunded_partial" | "refunded_full">;
} {
  const paymentAmountCents = Math.max(0, Math.round(input.paymentAmountCents));
  const refundedAmountCents = Math.max(0, Math.round(input.cumulativeRefundedAmountCents));

  if (paymentAmountCents <= 0 || refundedAmountCents <= 0) {
    return {
      refundKind: "unknown",
      refundStatus: "none",
      paymentStatus: "paid",
    };
  }

  if (refundedAmountCents >= paymentAmountCents) {
    return {
      refundKind: "full",
      refundStatus: "full",
      paymentStatus: "refunded_full",
    };
  }

  return {
    refundKind: "partial",
    refundStatus: "partial",
    paymentStatus: "refunded_partial",
  };
}

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
  | "payment_intent.succeeded"
  | "payment_intent.payment_failed"
  | "charge.refunded"
  | "refund.created"
  | "refund.updated"
  | "invoice.payment_succeeded"
  | "invoice.payment_failed"
  | "customer.subscription.updated"
  | "customer.subscription.deleted"
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

import type Stripe from "stripe";
import { calculatePlatformFeeAmount, calculateProviderPayoutAmount } from "@/lib/platform-fees";
import type { ProviderType } from "@/lib/provider-profiles";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { LedgerEntry } from "@/lib/payments/types";

export interface PaymentLedger {
  record(entry: Omit<LedgerEntry, "createdAt">): Promise<LedgerEntry>;
}

export class InMemoryPreparationLedger implements PaymentLedger {
  async record(entry: Omit<LedgerEntry, "createdAt">): Promise<LedgerEntry> {
    return {
      ...entry,
      createdAt: new Date().toISOString(),
    };
  }
}

export const paymentLedger: PaymentLedger = new InMemoryPreparationLedger();

type StoredPaymentTransactionRow = {
  id: string;
  provider: string;
  provider_payment_id: string | null;
  provider_checkout_id: string | null;
  provider_subscription_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  refunded_at: string | null;
};

type StoredProviderPayoutProfileRow = {
  id: string;
};

type StoredRefundRecordRow = {
  id: string;
};

type MirrorStripePaymentInput = {
  bookingId?: string | null;
  courseRegistrationIntentId?: string | null;
  teacherId?: string | null;
  providerType?: ProviderType | null;
  providerAccountId?: string | null;
  accountHolderName?: string | null;
  payoutStatus?: "pending" | "pending_event_completion";
  session: Stripe.Checkout.Session;
  paidAt?: string | null;
  fallbackAmountCents?: number | null;
  fallbackCurrency?: string | null;
};

type MirrorStripeRefundInput = {
  bookingId?: string | null;
  courseRegistrationIntentId?: string | null;
  refund: Stripe.Refund;
  checkoutSessionId?: string | null;
  refundReason?: string | null;
  refundedAt?: string | null;
};

type RecordStripeWebhookEventInput = {
  event: Stripe.Event;
  processingStatus?: "pending" | "processing" | "processed" | "failed" | "ignored";
  processedAt?: string | null;
};

type StripeProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  provider_type: ProviderType | null;
  stripe_account_id: string | null;
};

function normalizeCurrency(currency: string | null | undefined): string {
  return (currency ?? "EUR").trim().toUpperCase() || "EUR";
}

function normalizePaymentMethod(session: Stripe.Checkout.Session): string | null {
  if (Array.isArray(session.payment_method_types) && session.payment_method_types.length > 0) {
    return session.payment_method_types.join(",");
  }

  return null;
}

function normalizePaidAt(session: Stripe.Checkout.Session, fallback?: string | null): string {
  if (fallback) return fallback;
  return new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();
}

async function loadStripeProfile(
  teacherId: string | null | undefined
): Promise<StripeProfileRow | null> {
  if (!teacherId) return null;

  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("profiles")
    .select("id,first_name,last_name,organization_name,provider_type,stripe_account_id")
    .eq("id", teacherId)
    .maybeSingle<StripeProfileRow>();

  return data ?? null;
}

function buildAccountHolderName(profile: StripeProfileRow | null, fallback: string | null | undefined): string {
  const derived =
    profile?.organization_name?.trim() ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
    fallback?.trim() ||
    "Stripe Provider";

  return derived;
}

async function ensureProviderPayoutProfile(input: {
  teacherId?: string | null;
  providerAccountId?: string | null;
  providerType?: ProviderType | null;
  accountHolderName?: string | null;
}): Promise<string | null> {
  const profile = await loadStripeProfile(input.teacherId);
  const teacherId = input.teacherId ?? profile?.id ?? null;
  const providerAccountId = input.providerAccountId ?? profile?.stripe_account_id ?? null;
  const accountHolderName = buildAccountHolderName(profile, input.accountHolderName);
  const admin = createSupabaseAdmin();

  if (providerAccountId) {
    const { data: existingByAccount } = await admin
      .from("provider_payout_profiles")
      .select("id")
      .eq("provider", "stripe")
      .eq("provider_account_id", providerAccountId)
      .maybeSingle<StoredProviderPayoutProfileRow>();

    if (existingByAccount?.id) {
      return existingByAccount.id;
    }
  }

  if (teacherId) {
    const { data: existingByTeacher } = await admin
      .from("provider_payout_profiles")
      .select("id")
      .eq("provider", "stripe")
      .eq("teacher_id", teacherId)
      .maybeSingle<StoredProviderPayoutProfileRow>();

    if (existingByTeacher?.id) {
      return existingByTeacher.id;
    }
  }

  const { data: inserted, error } = await admin
    .from("provider_payout_profiles")
    .insert({
      teacher_id: teacherId,
      payout_method: "stripe",
      account_holder_name: accountHolderName,
      verification_status: providerAccountId ? "verified" : "pending",
      provider: "stripe",
      provider_account_id: providerAccountId,
    })
    .select("id")
    .single<StoredProviderPayoutProfileRow>();

  if (inserted?.id) {
    return inserted.id;
  }

  if (error) {
    if (providerAccountId) {
      const { data: fallbackByAccount } = await admin
        .from("provider_payout_profiles")
        .select("id")
        .eq("provider", "stripe")
        .eq("provider_account_id", providerAccountId)
        .maybeSingle<StoredProviderPayoutProfileRow>();

      if (fallbackByAccount?.id) {
        return fallbackByAccount.id;
      }
    }

    if (teacherId) {
      const { data: fallbackByTeacher } = await admin
        .from("provider_payout_profiles")
        .select("id")
        .eq("provider", "stripe")
        .eq("teacher_id", teacherId)
        .maybeSingle<StoredProviderPayoutProfileRow>();

      return fallbackByTeacher?.id ?? null;
    }
  }

  return null;
}

async function findPaymentTransaction(input: {
  providerPaymentId?: string | null;
  providerCheckoutId?: string | null;
  providerSubscriptionId?: string | null;
}): Promise<StoredPaymentTransactionRow | null> {
  const admin = createSupabaseAdmin();

  if (input.providerPaymentId) {
    const { data } = await admin
      .from("payment_transactions")
      .select("id,provider,provider_payment_id,provider_checkout_id,provider_subscription_id,amount_cents,currency,status,refunded_at")
      .eq("provider", "stripe")
      .eq("provider_payment_id", input.providerPaymentId)
      .maybeSingle<StoredPaymentTransactionRow>();

    if (data) return data;
  }

  if (input.providerCheckoutId) {
    const { data } = await admin
      .from("payment_transactions")
      .select("id,provider,provider_payment_id,provider_checkout_id,provider_subscription_id,amount_cents,currency,status,refunded_at")
      .eq("provider", "stripe")
      .eq("provider_checkout_id", input.providerCheckoutId)
      .maybeSingle<StoredPaymentTransactionRow>();

    if (data) return data;
  }

  if (input.providerSubscriptionId) {
    const { data } = await admin
      .from("payment_transactions")
      .select("id,provider,provider_payment_id,provider_checkout_id,provider_subscription_id,amount_cents,currency,status,refunded_at")
      .eq("provider", "stripe")
      .eq("provider_subscription_id", input.providerSubscriptionId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<StoredPaymentTransactionRow>();

    if (data) return data;
  }

  return null;
}

async function ensureLedgerEntry(input: {
  paymentTransactionId: string;
  providerPayoutProfileId?: string | null;
  entryType: "payment" | "refund";
  grossAmountCents: number;
  platformFeeCents: number;
  providerFeeCents: number;
  netAmountCents: number;
  currency: string;
  payoutStatus: "pending" | "pending_event_completion" | "cancelled";
}): Promise<void> {
  const admin = createSupabaseAdmin();
  const { data: existing } = await admin
    .from("ledger_entries")
    .select("id")
    .eq("source_type", "payment_transaction")
    .eq("source_id", input.paymentTransactionId)
    .eq("entry_type", input.entryType)
    .maybeSingle<{ id: string }>();

  if (existing?.id) {
    await admin
      .from("ledger_entries")
      .update({
        provider_payout_profile_id: input.providerPayoutProfileId,
        gross_amount_cents: input.grossAmountCents,
        platform_fee_cents: input.platformFeeCents,
        provider_fee_cents: input.providerFeeCents,
        net_amount_cents: input.netAmountCents,
        currency: input.currency,
        payout_status: input.payoutStatus,
      })
      .eq("id", existing.id);
    return;
  }

  await admin.from("ledger_entries").insert({
    provider_payout_profile_id: input.providerPayoutProfileId,
    source_type: "payment_transaction",
    source_id: input.paymentTransactionId,
    entry_type: input.entryType,
    gross_amount_cents: input.grossAmountCents,
    platform_fee_cents: input.platformFeeCents,
    provider_fee_cents: input.providerFeeCents,
    net_amount_cents: input.netAmountCents,
    currency: input.currency,
    payout_status: input.payoutStatus,
  });
}

export async function mirrorStripePaymentToLedger(input: MirrorStripePaymentInput): Promise<string | null> {
  const admin = createSupabaseAdmin();
  const providerPaymentId =
    typeof input.session.payment_intent === "string"
      ? input.session.payment_intent
      : input.session.payment_intent?.id ?? null;
  const providerSubscriptionId =
    typeof input.session.subscription === "string"
      ? input.session.subscription
      : input.session.subscription?.id ?? null;
  const providerCheckoutId = input.session.id;
  const amountCents = Math.max(
    0,
    input.session.amount_total ?? input.fallbackAmountCents ?? 0
  );
  const currency = normalizeCurrency(input.session.currency ?? input.fallbackCurrency);
  const paidAt = normalizePaidAt(input.session, input.paidAt);
  const providerPayoutProfileId = await ensureProviderPayoutProfile({
    teacherId: input.teacherId,
    providerAccountId: input.providerAccountId,
    providerType: input.providerType,
    accountHolderName: input.accountHolderName,
  });
  const existing = await findPaymentTransaction({
    providerPaymentId,
    providerCheckoutId,
    providerSubscriptionId,
  });

  const payload = {
    booking_id: input.bookingId ?? null,
    course_registration_intent_id: input.courseRegistrationIntentId ?? null,
    provider: "stripe",
    provider_payment_id: providerPaymentId,
    provider_checkout_id: providerCheckoutId,
    provider_customer_id:
      typeof input.session.customer === "string" ? input.session.customer : input.session.customer?.id ?? null,
    provider_subscription_id: providerSubscriptionId,
    amount_cents: amountCents,
    currency,
    payment_method: normalizePaymentMethod(input.session),
    status: "paid",
    paid_at: paidAt,
    failed_at: null,
  };

  let paymentTransactionId: string | null = existing?.id ?? null;

  if (existing?.id) {
    await admin.from("payment_transactions").update(payload).eq("id", existing.id);
  } else {
    const { data: inserted } = await admin
      .from("payment_transactions")
      .insert(payload)
      .select("id")
      .single<{ id: string }>();

    paymentTransactionId = inserted?.id ?? null;

    if (!paymentTransactionId) {
      const fallback = await findPaymentTransaction({
        providerPaymentId,
        providerCheckoutId,
        providerSubscriptionId,
      });
      paymentTransactionId = fallback?.id ?? null;
    }
  }

  if (!paymentTransactionId) {
    return null;
  }

  const platformFeeCents = calculatePlatformFeeAmount(amountCents, input.providerType);
  const netAmountCents = calculateProviderPayoutAmount(amountCents, input.providerType);

  await ensureLedgerEntry({
    paymentTransactionId,
    providerPayoutProfileId,
    entryType: "payment",
    grossAmountCents: amountCents,
    platformFeeCents,
    providerFeeCents: 0,
    netAmountCents,
    currency,
    payoutStatus: input.payoutStatus ?? "pending",
  });

  return paymentTransactionId;
}

export async function mirrorStripeRefundToLedger(input: MirrorStripeRefundInput): Promise<string | null> {
  const admin = createSupabaseAdmin();
  const providerPaymentId =
    typeof input.refund.payment_intent === "string"
      ? input.refund.payment_intent
      : input.refund.payment_intent?.id ?? null;
  const paymentTransaction = await findPaymentTransaction({
    providerPaymentId,
    providerCheckoutId: input.checkoutSessionId ?? null,
  });

  if (!paymentTransaction?.id) {
    return null;
  }

  await admin
    .from("payment_transactions")
    .update({
      status: "refunded",
      refunded_at: input.refundedAt ?? new Date().toISOString(),
    })
    .eq("id", paymentTransaction.id);

  const { data: existingRefund } = await admin
    .from("refund_records")
    .select("id")
    .eq("provider_refund_id", input.refund.id)
    .maybeSingle<StoredRefundRecordRow>();

  let refundRecordId = existingRefund?.id ?? null;

  if (!refundRecordId) {
    const { data: inserted } = await admin
      .from("refund_records")
      .insert({
        payment_transaction_id: paymentTransaction.id,
        provider_refund_id: input.refund.id,
        amount_cents: input.refund.amount ?? paymentTransaction.amount_cents,
        reason: input.refundReason ?? input.refund.reason ?? null,
        status: input.refund.status === "failed" ? "failed" : "succeeded",
      })
      .select("id")
      .single<StoredRefundRecordRow>();

    refundRecordId = inserted?.id ?? null;
  }

  await admin
    .from("ledger_entries")
    .update({
      payout_status: "cancelled",
    })
    .eq("source_type", "payment_transaction")
    .eq("source_id", paymentTransaction.id)
    .eq("entry_type", "payment");

  if (refundRecordId) {
    const { data: refundLedger } = await admin
      .from("ledger_entries")
      .select("id")
      .eq("source_type", "refund_record")
      .eq("source_id", refundRecordId)
      .eq("entry_type", "refund")
      .maybeSingle<{ id: string }>();

    if (!refundLedger?.id) {
      await admin.from("ledger_entries").insert({
        source_type: "refund_record",
        source_id: refundRecordId,
        entry_type: "refund",
        gross_amount_cents: input.refund.amount ?? paymentTransaction.amount_cents,
        platform_fee_cents: 0,
        provider_fee_cents: 0,
        net_amount_cents: 0,
        currency: paymentTransaction.currency,
        payout_status: "cancelled",
      });
    }
  }

  return refundRecordId;
}

export async function recordStripeWebhookEvent(input: RecordStripeWebhookEventInput): Promise<void> {
  const admin = createSupabaseAdmin();
  const payload = {
    provider: "stripe",
    provider_event_id: input.event.id,
    event_type: input.event.type,
    payload: input.event,
    processing_status: input.processingStatus ?? "pending",
    processed_at: input.processedAt ?? null,
  };

  const { data: existing } = await admin
    .from("provider_webhook_events")
    .select("id")
    .eq("provider", "stripe")
    .eq("provider_event_id", input.event.id)
    .maybeSingle<{ id: string }>();

  if (existing?.id) {
    await admin.from("provider_webhook_events").update(payload).eq("id", existing.id);
    return;
  }

  await admin.from("provider_webhook_events").insert(payload);
}

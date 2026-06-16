import type Stripe from "stripe";
import {
  calculatePlatformFeeCents,
  calculateProviderPayoutCents,
  getPlatformFeeConfigForProvider,
} from "@/lib/platform-fees";
import { calculatePayoutAvailableAt } from "@/lib/payments/payout-eligibility";
import { PROVIDER_PAYOUT_PROFILE_PROVIDER } from "@/lib/payout-profile";
import type { ProviderType } from "@/lib/provider-profiles";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { classifyRefundForPayment, type LedgerEntry } from "@/lib/payments/types";

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
  booking_id?: string | null;
  course_registration_intent_id?: string | null;
  provider_payout_profile_id?: string | null;
  provider_payment_id: string | null;
  provider_checkout_id: string | null;
  provider_customer_id?: string | null;
  provider_subscription_id: string | null;
  stripe_charge_id?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_balance_transaction_id?: string | null;
  stripe_application_fee_id?: string | null;
  stripe_transfer_id?: string | null;
  stripe_payout_id?: string | null;
  stripe_refund_id?: string | null;
  stripe_dispute_id?: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  paid_at?: string | null;
  refunded_at: string | null;
  refunded_amount_cents?: number | null;
  refund_status?: string | null;
  failed_at?: string | null;
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
  payoutStatus?: "pending" | "reserved" | "pending_event_completion";
  availableAt?: string | null;
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

type CourseRegistrationIntentMirrorRow = {
  id: string;
  course_id: string | null;
};

type CourseMirrorRow = {
  teacher_id: string | null;
  price_cents: number | null;
  currency: string | null;
};

type StripeRecurringMirrorContext = {
  courseRegistrationIntentId: string;
  teacherId: string | null;
  providerType: ProviderType | null;
  providerAccountId: string | null;
  accountHolderName: string | null;
  fallbackAmountCents: number | null;
  fallbackCurrency: string | null;
  paymentModel: string | null;
};

function normalizeCurrency(currency: string | null | undefined): string {
  return (currency ?? "EUR").trim().toUpperCase() || "EUR";
}

function isPlatformChargeMetadata(metadata: Stripe.Metadata | null | undefined): boolean {
  return metadata?.payment_model === "platform_charge";
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

function normalizeUnixTimestamp(unixTimestamp: number | null | undefined): string | null {
  if (typeof unixTimestamp !== "number" || !Number.isFinite(unixTimestamp) || unixTimestamp <= 0) {
    return null;
  }

  return new Date(unixTimestamp * 1000).toISOString();
}

function getStripeChargeIdFromSession(session: Stripe.Checkout.Session): string | null {
  const paymentIntent = session.payment_intent;
  if (typeof paymentIntent !== "object" || !paymentIntent) return null;
  const latestCharge = paymentIntent.latest_charge;
  if (typeof latestCharge === "string") return latestCharge;
  return latestCharge?.id ?? null;
}

function toStripeObjectId(
  value:
    | string
    | Stripe.PaymentIntent
    | Stripe.Charge
    | Stripe.BalanceTransaction
    | Stripe.ApplicationFee
    | Stripe.Transfer
    | Stripe.Payout
    | Stripe.Refund
    | null
    | undefined
): string | null {
  if (typeof value === "string") return value;
  return value?.id ?? null;
}

function mapStripeRefundRecordStatus(status: Stripe.Refund["status"] | string | null | undefined): "pending" | "succeeded" | "failed" | "cancelled" {
  if (status === "failed") return "failed";
  if (status === "canceled") return "cancelled";
  if (status === "pending" || status === "requires_action") return "pending";
  return "succeeded";
}

function getPaymentTransactionSelectFields(): string {
  return [
    "id",
    "provider",
    "booking_id",
    "course_registration_intent_id",
    "provider_payout_profile_id",
    "provider_payment_id",
    "provider_checkout_id",
    "provider_customer_id",
    "provider_subscription_id",
    "stripe_charge_id",
    "stripe_payment_intent_id",
    "stripe_balance_transaction_id",
    "stripe_application_fee_id",
    "stripe_transfer_id",
    "stripe_payout_id",
    "stripe_refund_id",
    "stripe_dispute_id",
    "amount_cents",
    "currency",
    "status",
    "paid_at",
    "refunded_at",
    "refunded_amount_cents",
    "refund_status",
    "failed_at",
  ].join(",");
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

  if (teacherId) {
    const { data: existingCustomProfile } = await admin
      .from("provider_payout_profiles")
      .select("id")
      .eq("provider", PROVIDER_PAYOUT_PROFILE_PROVIDER)
      .eq("teacher_id", teacherId)
      .maybeSingle<StoredProviderPayoutProfileRow>();

    if (existingCustomProfile?.id) {
      return existingCustomProfile.id;
    }
  }

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
  stripeChargeId?: string | null;
  stripeTransferId?: string | null;
  stripePayoutId?: string | null;
  stripeDisputeId?: string | null;
}): Promise<StoredPaymentTransactionRow | null> {
  const admin = createSupabaseAdmin();
  const selectFields = getPaymentTransactionSelectFields();

  if (input.stripeChargeId) {
    const { data } = await admin
      .from("payment_transactions")
      .select(selectFields)
      .eq("provider", "stripe")
      .eq("stripe_charge_id", input.stripeChargeId)
      .maybeSingle<StoredPaymentTransactionRow>();

    if (data) return data;
  }

  if (input.providerPaymentId) {
    const { data } = await admin
      .from("payment_transactions")
      .select(selectFields)
      .eq("provider", "stripe")
      .eq("provider_payment_id", input.providerPaymentId)
      .maybeSingle<StoredPaymentTransactionRow>();

    if (data) return data;
  }

  if (input.providerCheckoutId) {
    const { data } = await admin
      .from("payment_transactions")
      .select(selectFields)
      .eq("provider", "stripe")
      .eq("provider_checkout_id", input.providerCheckoutId)
      .maybeSingle<StoredPaymentTransactionRow>();

    if (data) return data;
  }

  if (input.providerSubscriptionId) {
    const { data } = await admin
      .from("payment_transactions")
      .select(selectFields)
      .eq("provider", "stripe")
      .eq("provider_subscription_id", input.providerSubscriptionId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<StoredPaymentTransactionRow>();

    if (data) return data;
  }

  if (input.stripeTransferId) {
    const { data } = await admin
      .from("payment_transactions")
      .select(selectFields)
      .eq("provider", "stripe")
      .eq("stripe_transfer_id", input.stripeTransferId)
      .maybeSingle<StoredPaymentTransactionRow>();

    if (data) return data;
  }

  if (input.stripePayoutId) {
    const { data } = await admin
      .from("payment_transactions")
      .select(selectFields)
      .eq("provider", "stripe")
      .eq("stripe_payout_id", input.stripePayoutId)
      .maybeSingle<StoredPaymentTransactionRow>();

    if (data) return data;
  }

  if (input.stripeDisputeId) {
    const { data } = await admin
      .from("payment_transactions")
      .select(selectFields)
      .eq("provider", "stripe")
      .eq("stripe_dispute_id", input.stripeDisputeId)
      .maybeSingle<StoredPaymentTransactionRow>();

    if (data) return data;
  }

  return null;
}

async function sumSucceededRefundAmount(paymentTransactionId: string): Promise<number> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("refund_records")
    .select("amount_cents")
    .eq("payment_transaction_id", paymentTransactionId)
    .eq("status", "succeeded")
    .returns<Array<{ amount_cents: number | null }>>();

  return (data ?? []).reduce((sum, row) => sum + Math.max(0, row.amount_cents ?? 0), 0);
}

async function resolveStripeRecurringMirrorContext(
  providerSubscriptionId: string
): Promise<StripeRecurringMirrorContext | null> {
  const admin = createSupabaseAdmin();
  const { data: transactions } = await admin
    .from("payment_transactions")
    .select("id,course_registration_intent_id")
    .eq("provider", "stripe")
    .eq("provider_subscription_id", providerSubscriptionId)
    .returns<Array<{ id: string; course_registration_intent_id: string | null }>>();

  const intentIds = Array.from(
    new Set(
      (transactions ?? [])
        .map((transaction) => transaction.course_registration_intent_id)
        .filter((intentId): intentId is string => Boolean(intentId))
    )
  );

  if (intentIds.length !== 1) {
    return null;
  }

  const paymentTransactionIds = (transactions ?? []).map((transaction) => transaction.id);
  let paymentModel: string | null = null;
  if (paymentTransactionIds.length > 0) {
    const { data: existingLedgerEntry } = await admin
      .from("ledger_entries")
      .select("provider_payout_profile_id,payout_status")
      .in("payment_transaction_id", paymentTransactionIds)
      .limit(1)
      .maybeSingle<{ provider_payout_profile_id: string | null; payout_status: string | null }>();

    if (existingLedgerEntry?.payout_status === "reserved") {
      paymentModel = "platform_charge";
    }
  }

  const courseRegistrationIntentId = intentIds[0];
  const { data: intent } = await admin
    .from("course_registration_intents")
    .select("id,course_id")
    .eq("id", courseRegistrationIntentId)
    .maybeSingle<CourseRegistrationIntentMirrorRow>();

  if (!intent?.course_id) {
    return null;
  }

  const { data: course } = await admin
    .from("courses")
    .select("teacher_id,price_cents,currency")
    .eq("id", intent.course_id)
    .maybeSingle<CourseMirrorRow>();

  const profile = await loadStripeProfile(course?.teacher_id ?? null);

  return {
    courseRegistrationIntentId,
    teacherId: course?.teacher_id ?? null,
    providerType: profile?.provider_type ?? null,
    providerAccountId: profile?.stripe_account_id ?? null,
    accountHolderName: buildAccountHolderName(profile, null),
    fallbackAmountCents: course?.price_cents ?? null,
    fallbackCurrency: course?.currency ?? null,
    paymentModel,
  };
}

async function ensureStripePaymentLedgerMirror(input: {
  paymentTransactionId: string;
  teacherId?: string | null;
  providerType?: ProviderType | null;
  providerAccountId?: string | null;
  accountHolderName?: string | null;
  amountCents: number;
  currency: string;
  payoutStatus?: "pending" | "reserved" | "pending_event_completion";
  availableAt?: string | null;
  paymentModel?: string | null;
  stripeChargeId?: string | null;
  stripePaymentIntentId?: string | null;
}): Promise<void> {
  const providerPayoutProfileId = await ensureProviderPayoutProfile({
    teacherId: input.teacherId,
    providerAccountId: input.providerAccountId,
    providerType: input.providerType,
    accountHolderName: input.accountHolderName,
  });
  const platformFeeConfig = await getPlatformFeeConfigForProvider(createSupabaseAdmin(), input.teacherId);
  const platformFeeCents = calculatePlatformFeeCents(input.amountCents, platformFeeConfig.platformFeePercent);
  const netAmountCents = calculateProviderPayoutCents(input.amountCents, platformFeeConfig.platformFeePercent);

  if (providerPayoutProfileId) {
    await createSupabaseAdmin()
      .from("payment_transactions")
      .update({
        provider_payout_profile_id: providerPayoutProfileId,
      })
      .eq("id", input.paymentTransactionId)
      .is("provider_payout_profile_id", null);
  }

  await ensureLedgerEntry({
    paymentTransactionId: input.paymentTransactionId,
    providerPayoutProfileId,
    entryType: "payment",
    grossAmountCents: input.amountCents,
    platformFeeCents,
    providerFeeCents: 0,
    netAmountCents,
    currency: input.currency,
    payoutStatus: input.payoutStatus ?? "pending",
    availableAt: input.availableAt ?? null,
    stripeChargeId: input.stripeChargeId ?? null,
    stripePaymentIntentId: input.stripePaymentIntentId ?? null,
  });
}

async function upsertStripeRefundMirror(input: {
  providerPaymentId?: string | null;
  checkoutSessionId?: string | null;
  stripeChargeId?: string | null;
  providerRefundId: string;
  amountCents?: number | null;
  reason?: string | null;
  status?: Stripe.Refund["status"] | string | null;
  refundedAt?: string | null;
}): Promise<string | null> {
  const admin = createSupabaseAdmin();
  const paymentTransaction = await findPaymentTransaction({
    providerPaymentId: input.providerPaymentId,
    providerCheckoutId: input.checkoutSessionId ?? null,
    stripeChargeId: input.stripeChargeId ?? null,
  });

  if (!paymentTransaction?.id) {
    return null;
  }
  const refundRecordStatus = mapStripeRefundRecordStatus(input.status);
  const normalizedRefundAmountCents = Math.max(0, input.amountCents ?? paymentTransaction.amount_cents);
  const refundKind =
    refundRecordStatus === "succeeded"
      ? classifyRefundForPayment({
          paymentAmountCents: paymentTransaction.amount_cents,
          cumulativeRefundedAmountCents: normalizedRefundAmountCents,
        }).refundKind
      : "unknown";

  const payload = {
    payment_transaction_id: paymentTransaction.id,
    provider_refund_id: input.providerRefundId,
    stripe_refund_id: input.providerRefundId,
    stripe_charge_id: input.stripeChargeId ?? paymentTransaction.stripe_charge_id ?? null,
    stripe_payment_intent_id: input.providerPaymentId ?? paymentTransaction.provider_payment_id,
    amount_cents: normalizedRefundAmountCents,
    reason: input.reason ?? null,
    status: refundRecordStatus,
    refund_kind: refundKind,
  };

  const { data: existingRefund } = await admin
    .from("refund_records")
    .select("id")
    .eq("provider_refund_id", input.providerRefundId)
    .maybeSingle<StoredRefundRecordRow>();

  let refundRecordId = existingRefund?.id ?? null;

  if (refundRecordId) {
    await admin.from("refund_records").update(payload).eq("id", refundRecordId);
  } else {
    const { data: inserted } = await admin
      .from("refund_records")
      .insert(payload)
      .select("id")
      .single<StoredRefundRecordRow>();

    refundRecordId = inserted?.id ?? null;
  }

  const succeededRefundAmountCents =
    refundRecordStatus === "succeeded"
      ? await sumSucceededRefundAmount(paymentTransaction.id)
      : Math.max(0, paymentTransaction.refunded_amount_cents ?? 0);
  const refundClassification = classifyRefundForPayment({
    paymentAmountCents: paymentTransaction.amount_cents,
    cumulativeRefundedAmountCents: succeededRefundAmountCents,
  });
  const refundLedgerStatus =
    refundClassification.refundStatus === "full"
      ? "refunded_full"
      : refundClassification.refundStatus === "partial"
        ? "refunded_partial"
        : "cancelled";

  if (refundRecordStatus === "succeeded") {
    await admin
      .from("payment_transactions")
      .update({
        status: refundClassification.paymentStatus,
        refunded_amount_cents: succeededRefundAmountCents,
        refund_status: refundClassification.refundStatus,
        refunded_at:
          refundClassification.refundStatus === "full"
            ? input.refundedAt ?? new Date().toISOString()
            : paymentTransaction.refunded_at ?? null,
        stripe_refund_id: input.providerRefundId,
        stripe_charge_id: input.stripeChargeId ?? paymentTransaction.stripe_charge_id ?? null,
        stripe_payment_intent_id: input.providerPaymentId ?? paymentTransaction.provider_payment_id,
      })
      .eq("id", paymentTransaction.id);

    await admin
      .from("ledger_entries")
      .update({
        payout_status: refundLedgerStatus,
        stripe_refund_id: input.providerRefundId,
        stripe_charge_id: input.stripeChargeId ?? paymentTransaction.stripe_charge_id ?? null,
        stripe_payment_intent_id: input.providerPaymentId ?? paymentTransaction.provider_payment_id,
      })
      .eq("source_type", "payment_transaction")
      .eq("source_id", paymentTransaction.id)
      .eq("entry_type", "payment");
  }

  if (refundRecordId) {
    const refundLedgerPayload = {
      provider_payout_profile_id: paymentTransaction.provider_payout_profile_id ?? null,
      gross_amount_cents: normalizedRefundAmountCents,
      platform_fee_cents: 0,
      provider_fee_cents: 0,
      net_amount_cents: 0,
      currency: paymentTransaction.currency,
      payout_status: refundLedgerStatus,
      stripe_refund_id: input.providerRefundId,
      stripe_charge_id: input.stripeChargeId ?? paymentTransaction.stripe_charge_id ?? null,
      stripe_payment_intent_id: input.providerPaymentId ?? paymentTransaction.provider_payment_id,
    };
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
        ...refundLedgerPayload,
      });
    } else {
      await admin.from("ledger_entries").update(refundLedgerPayload).eq("id", refundLedger.id);
    }
  }

  return refundRecordId;
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
  payoutStatus: "pending" | "reserved" | "pending_event_completion" | "payable" | "batched" | "cancelled";
  availableAt?: string | null;
  stripeChargeId?: string | null;
  stripePaymentIntentId?: string | null;
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
        available_at: input.availableAt ?? null,
        stripe_charge_id: input.stripeChargeId ?? null,
        stripe_payment_intent_id: input.stripePaymentIntentId ?? null,
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
    available_at: input.availableAt ?? null,
    stripe_charge_id: input.stripeChargeId ?? null,
    stripe_payment_intent_id: input.stripePaymentIntentId ?? null,
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
  const stripeChargeId = getStripeChargeIdFromSession(input.session);
  const amountCents = Math.max(
    0,
    input.session.amount_total ?? input.fallbackAmountCents ?? 0
  );
  const currency = normalizeCurrency(input.session.currency ?? input.fallbackCurrency);
  const paidAt = normalizePaidAt(input.session, input.paidAt);
  const existing = await findPaymentTransaction({
    providerPaymentId,
    providerCheckoutId,
    providerSubscriptionId,
  });
  const paymentModel = isPlatformChargeMetadata(input.session.metadata) ? "platform_charge" : "connect_destination_charge";

  const payload = {
    booking_id: input.bookingId ?? null,
    course_registration_intent_id: input.courseRegistrationIntentId ?? null,
    provider: "stripe",
    provider_payment_id: providerPaymentId,
    provider_checkout_id: providerCheckoutId,
    provider_customer_id:
      typeof input.session.customer === "string" ? input.session.customer : input.session.customer?.id ?? null,
    provider_subscription_id: providerSubscriptionId,
    stripe_charge_id: stripeChargeId,
    stripe_payment_intent_id: providerPaymentId,
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

  await ensureStripePaymentLedgerMirror({
    paymentTransactionId,
    teacherId: input.teacherId,
    providerType: input.providerType,
    providerAccountId: paymentModel === "platform_charge" ? null : input.providerAccountId,
    accountHolderName: input.accountHolderName,
    amountCents,
    currency,
    payoutStatus: input.payoutStatus ?? (paymentModel === "platform_charge" ? "reserved" : "pending"),
    availableAt: input.availableAt ?? null,
    paymentModel,
    stripeChargeId,
    stripePaymentIntentId: providerPaymentId,
  });

  return paymentTransactionId;
}

export async function mirrorStripeRefundToLedger(input: MirrorStripeRefundInput): Promise<string | null> {
  return upsertStripeRefundMirror({
    providerPaymentId:
      typeof input.refund.payment_intent === "string"
        ? input.refund.payment_intent
        : input.refund.payment_intent?.id ?? null,
    checkoutSessionId: input.checkoutSessionId ?? null,
    stripeChargeId: toStripeObjectId(input.refund.charge),
    providerRefundId: input.refund.id,
    amountCents: input.refund.amount ?? null,
    reason: input.refundReason ?? input.refund.reason ?? null,
    status: input.refund.status,
    refundedAt: input.refundedAt ?? normalizeUnixTimestamp(input.refund.created),
  });
}

export async function updateStripePaymentTransactionStatus(input: {
  providerPaymentId?: string | null;
  providerCheckoutId?: string | null;
  status: "paid" | "failed";
  amountCents?: number | null;
  currency?: string | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  stripeChargeId?: string | null;
  stripeBalanceTransactionId?: string | null;
  paidAt?: string | null;
  failedAt?: string | null;
}): Promise<string | null> {
  const paymentTransaction = await findPaymentTransaction({
    providerPaymentId: input.providerPaymentId,
    providerCheckoutId: input.providerCheckoutId,
  });

  if (!paymentTransaction?.id) {
    return null;
  }

  const admin = createSupabaseAdmin();
  const amountCents = Math.max(0, input.amountCents ?? paymentTransaction.amount_cents);
  const currency = normalizeCurrency(input.currency ?? paymentTransaction.currency);
  await admin
    .from("payment_transactions")
    .update({
      provider_customer_id: input.providerCustomerId ?? paymentTransaction.provider_customer_id ?? null,
      provider_subscription_id: input.providerSubscriptionId ?? paymentTransaction.provider_subscription_id ?? null,
      stripe_charge_id: input.stripeChargeId ?? paymentTransaction.stripe_charge_id ?? null,
      stripe_payment_intent_id: input.providerPaymentId ?? paymentTransaction.provider_payment_id,
      stripe_balance_transaction_id:
        input.stripeBalanceTransactionId ?? paymentTransaction.stripe_balance_transaction_id ?? null,
      amount_cents: amountCents,
      currency,
      status: input.status,
      paid_at:
        input.status === "paid"
          ? input.paidAt ?? paymentTransaction.paid_at ?? new Date().toISOString()
          : paymentTransaction.paid_at ?? null,
      failed_at:
        input.status === "failed"
          ? input.failedAt ?? paymentTransaction.failed_at ?? new Date().toISOString()
          : null,
    })
    .eq("id", paymentTransaction.id);

  await admin
    .from("ledger_entries")
    .update({
      stripe_charge_id: input.stripeChargeId ?? paymentTransaction.stripe_charge_id ?? null,
      stripe_payment_intent_id: input.providerPaymentId ?? paymentTransaction.provider_payment_id,
      stripe_balance_transaction_id:
        input.stripeBalanceTransactionId ?? paymentTransaction.stripe_balance_transaction_id ?? null,
    })
    .eq("source_type", "payment_transaction")
    .eq("source_id", paymentTransaction.id)
    .eq("entry_type", "payment");

  return paymentTransaction.id;
}

export async function mirrorStripeInvoiceEventToLedger(input: {
  invoice: Stripe.Invoice;
  status: "paid" | "failed";
}): Promise<string | null> {
  const providerPaymentIntentId = input.invoice.last_finalization_error?.payment_intent?.id ?? null;
  const providerPaymentId =
    providerPaymentIntentId ??
    (input.invoice.billing_reason === "subscription_cycle" ||
    input.invoice.billing_reason === "subscription_update" ||
    input.invoice.billing_reason === "subscription_threshold"
      ? input.invoice.id
      : null);
  const providerSubscriptionId =
    typeof input.invoice.parent?.subscription_details?.subscription === "string"
      ? input.invoice.parent.subscription_details.subscription
      : input.invoice.parent?.subscription_details?.subscription?.id ?? null;
  const providerCustomerId =
    typeof input.invoice.customer === "string" ? input.invoice.customer : input.invoice.customer?.id ?? null;
  const amountCents = Math.max(
    0,
    input.status === "paid"
      ? input.invoice.amount_paid ?? input.invoice.amount_due ?? 0
      : input.invoice.amount_due ?? input.invoice.amount_paid ?? 0
  );
  const currency = normalizeCurrency(input.invoice.currency);
  const timestamp =
    input.status === "paid"
      ? normalizeUnixTimestamp(input.invoice.status_transitions?.paid_at)
      : normalizeUnixTimestamp(input.invoice.created);
  const existingByPaymentIntent = providerPaymentId
    ? await findPaymentTransaction({
        providerPaymentId,
      })
    : null;

  if (existingByPaymentIntent?.id) {
    await updateStripePaymentTransactionStatus({
      providerPaymentId,
      status: input.status,
      amountCents,
      currency,
      providerCustomerId,
      providerSubscriptionId,
      paidAt: input.status === "paid" ? timestamp : null,
      failedAt: input.status === "failed" ? timestamp : null,
    });

    return existingByPaymentIntent.id;
  }

  if (!providerPaymentId || !providerSubscriptionId) {
    return null;
  }

  const mirrorContext = await resolveStripeRecurringMirrorContext(providerSubscriptionId);
  if (!mirrorContext?.courseRegistrationIntentId) {
    return null;
  }

  const admin = createSupabaseAdmin();
  const payload = {
    booking_id: null,
    course_registration_intent_id: mirrorContext.courseRegistrationIntentId,
    provider: "stripe",
    provider_payment_id: providerPaymentId,
    provider_checkout_id: null,
    provider_customer_id: providerCustomerId,
    provider_subscription_id: providerSubscriptionId,
    amount_cents: amountCents,
    currency,
    payment_method: null,
    status: input.status,
    paid_at: input.status === "paid" ? timestamp ?? new Date().toISOString() : null,
    failed_at: input.status === "failed" ? timestamp ?? new Date().toISOString() : null,
  };

  const { data: inserted } = await admin
    .from("payment_transactions")
    .insert(payload)
    .select("id")
    .single<{ id: string }>();

  const paymentTransactionId =
    inserted?.id ??
    (
      await findPaymentTransaction({
        providerPaymentId,
      })
    )?.id ??
    null;

  if (!paymentTransactionId) {
    return null;
  }

  if (input.status === "paid") {
    const paymentModel = mirrorContext.paymentModel === "platform_charge" ? "platform_charge" : "connect_destination_charge";
    await ensureStripePaymentLedgerMirror({
      paymentTransactionId,
      teacherId: mirrorContext.teacherId,
      providerType: mirrorContext.providerType,
      providerAccountId: paymentModel === "platform_charge" ? null : mirrorContext.providerAccountId,
      accountHolderName: mirrorContext.accountHolderName,
      amountCents,
      currency,
      payoutStatus: paymentModel === "platform_charge" ? "reserved" : "pending",
      availableAt: null,
      paymentModel,
      stripePaymentIntentId: providerPaymentId,
    });
  }

  return paymentTransactionId;
}

export async function mirrorStripeRefundEventToLedger(input: {
  providerPaymentId?: string | null;
  checkoutSessionId?: string | null;
  stripeChargeId?: string | null;
  providerRefundId: string;
  amountCents?: number | null;
  reason?: string | null;
  status?: Stripe.Refund["status"] | string | null;
  refundedAt?: string | null;
}): Promise<string | null> {
  return upsertStripeRefundMirror(input);
}

async function updateStripeReferencesForPaymentTransaction(input: {
  paymentTransactionId: string;
  stripeChargeId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeBalanceTransactionId?: string | null;
  stripeApplicationFeeId?: string | null;
  stripeTransferId?: string | null;
  stripePayoutId?: string | null;
  stripeDisputeId?: string | null;
  payoutStatus?: string | null;
  paymentStatus?: string | null;
}): Promise<string | null> {
  const admin = createSupabaseAdmin();
  const paymentPatch = {
    stripe_charge_id: input.stripeChargeId ?? undefined,
    stripe_payment_intent_id: input.stripePaymentIntentId ?? undefined,
    stripe_balance_transaction_id: input.stripeBalanceTransactionId ?? undefined,
    stripe_application_fee_id: input.stripeApplicationFeeId ?? undefined,
    stripe_transfer_id: input.stripeTransferId ?? undefined,
    stripe_payout_id: input.stripePayoutId ?? undefined,
    stripe_dispute_id: input.stripeDisputeId ?? undefined,
    status: input.paymentStatus ?? undefined,
  };

  await admin.from("payment_transactions").update(paymentPatch).eq("id", input.paymentTransactionId);

  const { data: ledgerEntries } = await admin
    .from("ledger_entries")
    .select("id,payout_status,available_at")
    .eq("source_type", "payment_transaction")
    .eq("source_id", input.paymentTransactionId)
    .eq("entry_type", "payment")
    .returns<Array<{ id: string; payout_status: string | null; available_at: string | null }>>();

  const now = Date.now();
  for (const entry of ledgerEntries ?? []) {
    let nextPayoutStatus = input.payoutStatus ?? undefined;

    if (nextPayoutStatus === "transfer_created" && entry.payout_status === "pending_event_completion") {
      const availableAtTime = entry.available_at ? new Date(entry.available_at).getTime() : NaN;
      if (Number.isFinite(availableAtTime) && availableAtTime > now) {
        nextPayoutStatus = undefined;
      }
    }

    await admin
      .from("ledger_entries")
      .update({
        stripe_charge_id: input.stripeChargeId ?? undefined,
        stripe_payment_intent_id: input.stripePaymentIntentId ?? undefined,
        stripe_balance_transaction_id: input.stripeBalanceTransactionId ?? undefined,
        stripe_application_fee_id: input.stripeApplicationFeeId ?? undefined,
        stripe_transfer_id: input.stripeTransferId ?? undefined,
        stripe_payout_id: input.stripePayoutId ?? undefined,
        stripe_dispute_id: input.stripeDisputeId ?? undefined,
        payout_status: nextPayoutStatus,
      })
      .eq("id", entry.id);
  }

  return input.paymentTransactionId;
}

export async function mirrorStripeChargeEventToLedger(input: {
  charge: Stripe.Charge;
}): Promise<string | null> {
  const chargeId = input.charge.id;
  const providerPaymentId = toStripeObjectId(input.charge.payment_intent);
  const paymentTransaction = await findPaymentTransaction({
    stripeChargeId: chargeId,
    providerPaymentId,
  });

  if (!paymentTransaction?.id) {
    return null;
  }

  return updateStripeReferencesForPaymentTransaction({
    paymentTransactionId: paymentTransaction.id,
    stripeChargeId: chargeId,
    stripePaymentIntentId: providerPaymentId,
    stripeBalanceTransactionId: toStripeObjectId(input.charge.balance_transaction),
  });
}

export async function mirrorStripeApplicationFeeEventToLedger(input: {
  applicationFee: Stripe.ApplicationFee;
}): Promise<string | null> {
  const chargeId = toStripeObjectId(input.applicationFee.charge);
  const paymentIntentId =
    typeof input.applicationFee.charge === "object"
      ? toStripeObjectId(input.applicationFee.charge?.payment_intent)
      : null;
  const paymentTransaction = await findPaymentTransaction({
    stripeChargeId: chargeId,
    providerPaymentId: paymentIntentId,
  });

  if (!paymentTransaction?.id) {
    return null;
  }

  return updateStripeReferencesForPaymentTransaction({
    paymentTransactionId: paymentTransaction.id,
    stripeChargeId: chargeId,
    stripePaymentIntentId: paymentIntentId,
    stripeBalanceTransactionId: toStripeObjectId(input.applicationFee.balance_transaction),
    stripeApplicationFeeId: input.applicationFee.id,
  });
}

export async function mirrorStripeTransferEventToLedger(input: {
  transfer: Stripe.Transfer;
  status: "created" | "paid" | "failed";
}): Promise<string | null> {
  const sourceChargeId = toStripeObjectId(input.transfer.source_transaction);
  const paymentTransaction = await findPaymentTransaction({
    stripeChargeId: sourceChargeId,
    stripeTransferId: input.transfer.id,
  });

  if (!paymentTransaction?.id) {
    return null;
  }

  return updateStripeReferencesForPaymentTransaction({
    paymentTransactionId: paymentTransaction.id,
    stripeChargeId: sourceChargeId,
    stripeBalanceTransactionId: toStripeObjectId(input.transfer.balance_transaction),
    stripeTransferId: input.transfer.id,
    payoutStatus: input.status === "failed" ? "failed" : "transfer_created",
  });
}

function getPayoutMetadataValue(payout: Stripe.Payout, key: string): string | null {
  const value = payout.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function upsertStripePayoutBatchMirror(input: {
  payout: Stripe.Payout;
  status: "paid" | "failed";
}): Promise<string | null> {
  const admin = createSupabaseAdmin();
  const payload = {
    payout_provider: "stripe",
    payout_method: "stripe",
    total_amount_cents: Math.max(0, input.payout.amount ?? 0),
    currency: normalizeCurrency(input.payout.currency),
    status: input.status,
    executed_at: input.status === "paid" ? normalizeUnixTimestamp(input.payout.arrival_date) ?? new Date().toISOString() : null,
    failed_at: input.status === "failed" ? new Date().toISOString() : null,
    stripe_payout_id: input.payout.id,
    stripe_balance_transaction_id: toStripeObjectId(input.payout.balance_transaction),
    settlement_reference: input.payout.id,
  };
  const { data: existing } = await admin
    .from("payout_batches")
    .select("id")
    .eq("stripe_payout_id", input.payout.id)
    .maybeSingle<{ id: string }>();

  if (existing?.id) {
    await admin.from("payout_batches").update(payload).eq("id", existing.id);
    return existing.id;
  }

  const { data: inserted } = await admin
    .from("payout_batches")
    .insert(payload)
    .select("id")
    .maybeSingle<{ id: string }>();

  return inserted?.id ?? null;
}

export async function mirrorStripePayoutEventToLedger(input: {
  payout: Stripe.Payout;
  status: "paid" | "failed";
}): Promise<string | null> {
  const batchId = await upsertStripePayoutBatchMirror(input);
  const metadataPaymentTransactionId =
    getPayoutMetadataValue(input.payout, "paymentTransactionId") ??
    getPayoutMetadataValue(input.payout, "payment_transaction_id");
  const metadataLedgerEntryId =
    getPayoutMetadataValue(input.payout, "ledgerEntryId") ??
    getPayoutMetadataValue(input.payout, "ledger_entry_id");
  const paymentTransaction = metadataPaymentTransactionId
    ? { id: metadataPaymentTransactionId }
    : await findPaymentTransaction({ stripePayoutId: input.payout.id });

  if (paymentTransaction?.id) {
    await updateStripeReferencesForPaymentTransaction({
      paymentTransactionId: paymentTransaction.id,
      stripePayoutId: input.payout.id,
      stripeBalanceTransactionId: toStripeObjectId(input.payout.balance_transaction),
      payoutStatus: input.status === "paid" ? "paid_by_stripe" : "failed",
    });
  }

  if (metadataLedgerEntryId) {
    await createSupabaseAdmin()
      .from("ledger_entries")
      .update({
        payout_batch_id: batchId ?? undefined,
        stripe_payout_id: input.payout.id,
        stripe_balance_transaction_id: toStripeObjectId(input.payout.balance_transaction),
        payout_status: input.status === "paid" ? "paid_by_stripe" : "failed",
      })
      .eq("id", metadataLedgerEntryId);
  }

  return paymentTransaction?.id ?? batchId;
}

function mapDisputeLedgerStatus(dispute: Stripe.Dispute, eventType: "created" | "closed"): "disputed" | "chargeback_lost" | "chargeback_won" {
  if (eventType === "created") return "disputed";
  if (dispute.status === "won") return "chargeback_won";
  if (dispute.status === "lost") return "chargeback_lost";
  return "disputed";
}

export async function mirrorStripeDisputeEventToLedger(input: {
  dispute: Stripe.Dispute;
  eventType: "created" | "closed";
}): Promise<string | null> {
  const disputeWithPaymentIntent = input.dispute as Stripe.Dispute & {
    payment_intent?: string | Stripe.PaymentIntent | null;
  };
  const chargeId = toStripeObjectId(input.dispute.charge);
  const paymentIntentId = toStripeObjectId(disputeWithPaymentIntent.payment_intent);
  const paymentTransaction = await findPaymentTransaction({
    stripeChargeId: chargeId,
    providerPaymentId: paymentIntentId,
    stripeDisputeId: input.dispute.id,
  });

  if (!paymentTransaction?.id) {
    return null;
  }

  const status = mapDisputeLedgerStatus(input.dispute, input.eventType);
  return updateStripeReferencesForPaymentTransaction({
    paymentTransactionId: paymentTransaction.id,
    stripeChargeId: chargeId,
    stripePaymentIntentId: paymentIntentId,
    stripeDisputeId: input.dispute.id,
    payoutStatus: status,
    paymentStatus: status,
  });
}

export { calculatePayoutAvailableAt };

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

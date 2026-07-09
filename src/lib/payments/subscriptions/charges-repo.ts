import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  CreateSubscriptionChargeInput,
  SubscriptionCharge,
  SubscriptionChargeStatus,
} from "@/lib/payments/subscriptions/types";

type SubscriptionChargeRow = {
  id: string;
  subscription_contract_id: string;
  subscription_period_id: string | null;
  payment_transaction_id: string | null;
  ledger_entry_id: string | null;
  provider: string;
  provider_charge_id: string | null;
  provider_invoice_id: string | null;
  provider_payment_reference: string | null;
  charge_type: SubscriptionCharge["chargeType"];
  gross_amount_cents: number;
  platform_fee_cents: number;
  provider_net_cents: number;
  currency: string;
  status: SubscriptionChargeStatus;
  charged_at: string | null;
  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  failure_code: string | null;
  failure_message: string | null;
  next_payment_attempt: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const SUBSCRIPTION_CHARGE_SELECT_FIELDS = [
  "id",
  "subscription_contract_id",
  "subscription_period_id",
  "payment_transaction_id",
  "ledger_entry_id",
  "provider",
  "provider_charge_id",
  "provider_invoice_id",
  "provider_payment_reference",
  "charge_type",
  "gross_amount_cents",
  "platform_fee_cents",
  "provider_net_cents",
  "currency",
  "status",
  "charged_at",
  "stripe_invoice_id",
  "stripe_payment_intent_id",
  "stripe_charge_id",
  "failure_code",
  "failure_message",
  "next_payment_attempt",
  "metadata",
  "created_at",
  "updated_at",
].join(",");

function mapRow(row: SubscriptionChargeRow): SubscriptionCharge {
  return {
    id: row.id,
    subscriptionContractId: row.subscription_contract_id,
    subscriptionPeriodId: row.subscription_period_id,
    paymentTransactionId: row.payment_transaction_id,
    ledgerEntryId: row.ledger_entry_id,
    provider: row.provider,
    providerChargeId: row.provider_charge_id,
    providerInvoiceId: row.provider_invoice_id,
    providerPaymentReference: row.provider_payment_reference,
    chargeType: row.charge_type,
    grossAmountCents: row.gross_amount_cents,
    platformFeeCents: row.platform_fee_cents,
    providerNetCents: row.provider_net_cents,
    currency: row.currency,
    status: row.status,
    chargedAt: row.charged_at,
    stripeInvoiceId: row.stripe_invoice_id,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    stripeChargeId: row.stripe_charge_id,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    nextPaymentAttempt: row.next_payment_attempt,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createSubscriptionCharge(input: CreateSubscriptionChargeInput): Promise<SubscriptionCharge> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_charges")
    .insert({
      subscription_contract_id: input.subscriptionContractId,
      subscription_period_id: input.subscriptionPeriodId ?? null,
      payment_transaction_id: input.paymentTransactionId ?? null,
      ledger_entry_id: input.ledgerEntryId ?? null,
      provider: input.provider,
      provider_charge_id: input.providerChargeId ?? null,
      provider_invoice_id: input.providerInvoiceId ?? null,
      provider_payment_reference: input.providerPaymentReference ?? null,
      charge_type: input.chargeType,
      gross_amount_cents: input.grossAmountCents,
      platform_fee_cents: input.platformFeeCents ?? 0,
      provider_net_cents: input.providerNetCents ?? 0,
      currency: input.currency,
      status: input.status ?? "draft",
      charged_at: input.chargedAt ?? null,
      stripe_invoice_id: input.stripeInvoiceId ?? null,
      stripe_payment_intent_id: input.stripePaymentIntentId ?? null,
      stripe_charge_id: input.stripeChargeId ?? null,
      failure_code: input.failureCode ?? null,
      failure_message: input.failureMessage ?? null,
      next_payment_attempt: input.nextPaymentAttempt ?? null,
      metadata: input.metadata ?? {},
    })
    .select(SUBSCRIPTION_CHARGE_SELECT_FIELDS)
    .single<SubscriptionChargeRow>();

  if (error) throw error;
  return mapRow(data);
}

export async function findSubscriptionChargeById(id: string): Promise<SubscriptionCharge | null> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_charges")
    .select(SUBSCRIPTION_CHARGE_SELECT_FIELDS)
    .eq("id", id)
    .maybeSingle<SubscriptionChargeRow>();

  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function findSubscriptionChargeByProviderReference(input: {
  provider: string;
  providerChargeId?: string | null;
  providerInvoiceId?: string | null;
  providerPaymentReference?: string | null;
}): Promise<SubscriptionCharge | null> {
  const admin = createSupabaseAdmin();

  if (input.providerChargeId) {
    const { data, error } = await admin
      .from("subscription_charges")
      .select(SUBSCRIPTION_CHARGE_SELECT_FIELDS)
      .eq("provider", input.provider)
      .eq("provider_charge_id", input.providerChargeId)
      .maybeSingle<SubscriptionChargeRow>();

    if (error) throw error;
    if (data) return mapRow(data);
  }

  if (input.providerInvoiceId) {
    const { data, error } = await admin
      .from("subscription_charges")
      .select(SUBSCRIPTION_CHARGE_SELECT_FIELDS)
      .eq("provider", input.provider)
      .eq("provider_invoice_id", input.providerInvoiceId)
      .maybeSingle<SubscriptionChargeRow>();

    if (error) throw error;
    if (data) return mapRow(data);
  }

  if (input.providerPaymentReference) {
    const { data, error } = await admin
      .from("subscription_charges")
      .select(SUBSCRIPTION_CHARGE_SELECT_FIELDS)
      .eq("provider", input.provider)
      .eq("provider_payment_reference", input.providerPaymentReference)
      .maybeSingle<SubscriptionChargeRow>();

    if (error) throw error;
    if (data) return mapRow(data);
  }

  return null;
}

export async function listSubscriptionChargesByContractId(
  subscriptionContractId: string
): Promise<SubscriptionCharge[]> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_charges")
    .select(SUBSCRIPTION_CHARGE_SELECT_FIELDS)
    .eq("subscription_contract_id", subscriptionContractId)
    .order("created_at", { ascending: true })
    .returns<SubscriptionChargeRow[]>();

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function listSubscriptionChargesByPeriodId(subscriptionPeriodId: string): Promise<SubscriptionCharge[]> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_charges")
    .select(SUBSCRIPTION_CHARGE_SELECT_FIELDS)
    .eq("subscription_period_id", subscriptionPeriodId)
    .order("created_at", { ascending: true })
    .returns<SubscriptionChargeRow[]>();

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function updateSubscriptionCharge(
  id: string,
  patch: Partial<CreateSubscriptionChargeInput & { status: SubscriptionChargeStatus }>
): Promise<SubscriptionCharge> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_charges")
    .update({
      subscription_contract_id: patch.subscriptionContractId,
      subscription_period_id: patch.subscriptionPeriodId,
      payment_transaction_id: patch.paymentTransactionId,
      ledger_entry_id: patch.ledgerEntryId,
      provider: patch.provider,
      provider_charge_id: patch.providerChargeId,
      provider_invoice_id: patch.providerInvoiceId,
      provider_payment_reference: patch.providerPaymentReference,
      charge_type: patch.chargeType,
      gross_amount_cents: patch.grossAmountCents,
      platform_fee_cents: patch.platformFeeCents,
      provider_net_cents: patch.providerNetCents,
      currency: patch.currency,
      status: patch.status,
      charged_at: patch.chargedAt,
      stripe_invoice_id: patch.stripeInvoiceId,
      stripe_payment_intent_id: patch.stripePaymentIntentId,
      stripe_charge_id: patch.stripeChargeId,
      failure_code: patch.failureCode,
      failure_message: patch.failureMessage,
      next_payment_attempt: patch.nextPaymentAttempt,
      metadata: patch.metadata,
    })
    .eq("id", id)
    .select(SUBSCRIPTION_CHARGE_SELECT_FIELDS)
    .single<SubscriptionChargeRow>();

  if (error) throw error;
  return mapRow(data);
}

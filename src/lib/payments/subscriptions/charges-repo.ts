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
  provider: string;
  provider_charge_id: string | null;
  provider_invoice_id: string | null;
  provider_payment_reference: string | null;
  charge_type: SubscriptionCharge["chargeType"];
  gross_amount_cents: number;
  currency: string;
  status: SubscriptionChargeStatus;
  charged_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function mapRow(row: SubscriptionChargeRow): SubscriptionCharge {
  return {
    id: row.id,
    subscriptionContractId: row.subscription_contract_id,
    subscriptionPeriodId: row.subscription_period_id,
    paymentTransactionId: row.payment_transaction_id,
    provider: row.provider,
    providerChargeId: row.provider_charge_id,
    providerInvoiceId: row.provider_invoice_id,
    providerPaymentReference: row.provider_payment_reference,
    chargeType: row.charge_type,
    grossAmountCents: row.gross_amount_cents,
    currency: row.currency,
    status: row.status,
    chargedAt: row.charged_at,
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
      provider: input.provider,
      provider_charge_id: input.providerChargeId ?? null,
      provider_invoice_id: input.providerInvoiceId ?? null,
      provider_payment_reference: input.providerPaymentReference ?? null,
      charge_type: input.chargeType,
      gross_amount_cents: input.grossAmountCents,
      currency: input.currency,
      status: input.status ?? "draft",
      charged_at: input.chargedAt ?? null,
      metadata: input.metadata ?? {},
    })
    .select(
      "id,subscription_contract_id,subscription_period_id,payment_transaction_id,provider,provider_charge_id,provider_invoice_id,provider_payment_reference,charge_type,gross_amount_cents,currency,status,charged_at,metadata,created_at,updated_at"
    )
    .single<SubscriptionChargeRow>();

  if (error) throw error;
  return mapRow(data);
}

export async function findSubscriptionChargeById(id: string): Promise<SubscriptionCharge | null> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_charges")
    .select(
      "id,subscription_contract_id,subscription_period_id,payment_transaction_id,provider,provider_charge_id,provider_invoice_id,provider_payment_reference,charge_type,gross_amount_cents,currency,status,charged_at,metadata,created_at,updated_at"
    )
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
      .select(
        "id,subscription_contract_id,subscription_period_id,payment_transaction_id,provider,provider_charge_id,provider_invoice_id,provider_payment_reference,charge_type,gross_amount_cents,currency,status,charged_at,metadata,created_at,updated_at"
      )
      .eq("provider", input.provider)
      .eq("provider_charge_id", input.providerChargeId)
      .maybeSingle<SubscriptionChargeRow>();

    if (error) throw error;
    if (data) return mapRow(data);
  }

  if (input.providerInvoiceId) {
    const { data, error } = await admin
      .from("subscription_charges")
      .select(
        "id,subscription_contract_id,subscription_period_id,payment_transaction_id,provider,provider_charge_id,provider_invoice_id,provider_payment_reference,charge_type,gross_amount_cents,currency,status,charged_at,metadata,created_at,updated_at"
      )
      .eq("provider", input.provider)
      .eq("provider_invoice_id", input.providerInvoiceId)
      .maybeSingle<SubscriptionChargeRow>();

    if (error) throw error;
    if (data) return mapRow(data);
  }

  if (input.providerPaymentReference) {
    const { data, error } = await admin
      .from("subscription_charges")
      .select(
        "id,subscription_contract_id,subscription_period_id,payment_transaction_id,provider,provider_charge_id,provider_invoice_id,provider_payment_reference,charge_type,gross_amount_cents,currency,status,charged_at,metadata,created_at,updated_at"
      )
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
    .select(
      "id,subscription_contract_id,subscription_period_id,payment_transaction_id,provider,provider_charge_id,provider_invoice_id,provider_payment_reference,charge_type,gross_amount_cents,currency,status,charged_at,metadata,created_at,updated_at"
    )
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
    .select(
      "id,subscription_contract_id,subscription_period_id,payment_transaction_id,provider,provider_charge_id,provider_invoice_id,provider_payment_reference,charge_type,gross_amount_cents,currency,status,charged_at,metadata,created_at,updated_at"
    )
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
      provider: patch.provider,
      provider_charge_id: patch.providerChargeId,
      provider_invoice_id: patch.providerInvoiceId,
      provider_payment_reference: patch.providerPaymentReference,
      charge_type: patch.chargeType,
      gross_amount_cents: patch.grossAmountCents,
      currency: patch.currency,
      status: patch.status,
      charged_at: patch.chargedAt,
      metadata: patch.metadata,
    })
    .eq("id", id)
    .select(
      "id,subscription_contract_id,subscription_period_id,payment_transaction_id,provider,provider_charge_id,provider_invoice_id,provider_payment_reference,charge_type,gross_amount_cents,currency,status,charged_at,metadata,created_at,updated_at"
    )
    .single<SubscriptionChargeRow>();

  if (error) throw error;
  return mapRow(data);
}

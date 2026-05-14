import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  CreateSubscriptionCreditInput,
  SubscriptionCredit,
  SubscriptionCreditStatus,
} from "@/lib/payments/subscriptions/types";

type SubscriptionCreditRow = {
  id: string;
  subscription_contract_id: string;
  origin_type: SubscriptionCredit["originType"];
  origin_id: string | null;
  amount_cents: number;
  remaining_amount_cents: number;
  currency: string;
  status: SubscriptionCreditStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function mapRow(row: SubscriptionCreditRow): SubscriptionCredit {
  return {
    id: row.id,
    subscriptionContractId: row.subscription_contract_id,
    originType: row.origin_type,
    originId: row.origin_id,
    amountCents: row.amount_cents,
    remainingAmountCents: row.remaining_amount_cents,
    currency: row.currency,
    status: row.status,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createSubscriptionCredit(input: CreateSubscriptionCreditInput): Promise<SubscriptionCredit> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_credits")
    .insert({
      subscription_contract_id: input.subscriptionContractId,
      origin_type: input.originType,
      origin_id: input.originId ?? null,
      amount_cents: input.amountCents,
      remaining_amount_cents: input.remainingAmountCents,
      currency: input.currency,
      status: input.status ?? "available",
      metadata: input.metadata ?? {},
    })
    .select("id,subscription_contract_id,origin_type,origin_id,amount_cents,remaining_amount_cents,currency,status,metadata,created_at,updated_at")
    .single<SubscriptionCreditRow>();

  if (error) throw error;
  return mapRow(data);
}

export async function findSubscriptionCreditById(id: string): Promise<SubscriptionCredit | null> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_credits")
    .select("id,subscription_contract_id,origin_type,origin_id,amount_cents,remaining_amount_cents,currency,status,metadata,created_at,updated_at")
    .eq("id", id)
    .maybeSingle<SubscriptionCreditRow>();

  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function listSubscriptionCreditsByContractId(
  subscriptionContractId: string
): Promise<SubscriptionCredit[]> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_credits")
    .select("id,subscription_contract_id,origin_type,origin_id,amount_cents,remaining_amount_cents,currency,status,metadata,created_at,updated_at")
    .eq("subscription_contract_id", subscriptionContractId)
    .order("created_at", { ascending: false })
    .returns<SubscriptionCreditRow[]>();

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function listAvailableSubscriptionCreditsByContractId(
  subscriptionContractId: string
): Promise<SubscriptionCredit[]> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_credits")
    .select("id,subscription_contract_id,origin_type,origin_id,amount_cents,remaining_amount_cents,currency,status,metadata,created_at,updated_at")
    .eq("subscription_contract_id", subscriptionContractId)
    .in("status", ["available", "partially_applied"])
    .gt("remaining_amount_cents", 0)
    .order("created_at", { ascending: true })
    .returns<SubscriptionCreditRow[]>();

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function updateSubscriptionCredit(
  id: string,
  patch: Partial<CreateSubscriptionCreditInput & { status: SubscriptionCreditStatus }>
): Promise<SubscriptionCredit> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_credits")
    .update({
      subscription_contract_id: patch.subscriptionContractId,
      origin_type: patch.originType,
      origin_id: patch.originId,
      amount_cents: patch.amountCents,
      remaining_amount_cents: patch.remainingAmountCents,
      currency: patch.currency,
      status: patch.status,
      metadata: patch.metadata,
    })
    .eq("id", id)
    .select("id,subscription_contract_id,origin_type,origin_id,amount_cents,remaining_amount_cents,currency,status,metadata,created_at,updated_at")
    .single<SubscriptionCreditRow>();

  if (error) throw error;
  return mapRow(data);
}

import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  CreateSubscriptionContractInput,
  SubscriptionContract,
  SubscriptionContractStatus,
} from "@/lib/payments/subscriptions/types";

type SubscriptionContractRow = {
  id: string;
  course_registration_intent_id: string | null;
  course_id: string;
  teacher_id: string;
  customer_email: string;
  provider: string;
  provider_subscription_id: string | null;
  provider_customer_id: string | null;
  provider_mandate_id: string | null;
  status: SubscriptionContractStatus;
  interval_unit: "month";
  interval_count: number;
  base_amount_cents: number;
  currency: string;
  billing_anchor_day: number;
  next_charge_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  cancel_effective_date: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function mapRow(row: SubscriptionContractRow): SubscriptionContract {
  return {
    id: row.id,
    courseRegistrationIntentId: row.course_registration_intent_id,
    courseId: row.course_id,
    teacherId: row.teacher_id,
    customerEmail: row.customer_email,
    provider: row.provider,
    providerSubscriptionId: row.provider_subscription_id,
    providerCustomerId: row.provider_customer_id,
    providerMandateId: row.provider_mandate_id,
    status: row.status,
    intervalUnit: row.interval_unit,
    intervalCount: row.interval_count,
    baseAmountCents: row.base_amount_cents,
    currency: row.currency,
    billingAnchorDay: row.billing_anchor_day,
    nextChargeAt: row.next_charge_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    cancelEffectiveDate: row.cancel_effective_date,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createSubscriptionContract(input: CreateSubscriptionContractInput): Promise<SubscriptionContract> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_contracts")
    .insert({
      course_registration_intent_id: input.courseRegistrationIntentId ?? null,
      course_id: input.courseId,
      teacher_id: input.teacherId,
      customer_email: input.customerEmail,
      provider: input.provider,
      provider_subscription_id: input.providerSubscriptionId ?? null,
      provider_customer_id: input.providerCustomerId ?? null,
      provider_mandate_id: input.providerMandateId ?? null,
      status: input.status ?? "draft",
      interval_unit: "month",
      interval_count: input.intervalCount ?? 1,
      base_amount_cents: input.baseAmountCents,
      currency: input.currency,
      billing_anchor_day: input.billingAnchorDay ?? 1,
      next_charge_at: input.nextChargeAt ?? null,
      started_at: input.startedAt ?? null,
      ended_at: input.endedAt ?? null,
      cancel_effective_date: input.cancelEffectiveDate ?? null,
      metadata: input.metadata ?? {},
    })
    .select(
      "id,course_registration_intent_id,course_id,teacher_id,customer_email,provider,provider_subscription_id,provider_customer_id,provider_mandate_id,status,interval_unit,interval_count,base_amount_cents,currency,billing_anchor_day,next_charge_at,started_at,ended_at,cancel_effective_date,metadata,created_at,updated_at"
    )
    .single<SubscriptionContractRow>();

  if (error) throw error;
  return mapRow(data);
}

export async function findSubscriptionContractById(id: string): Promise<SubscriptionContract | null> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_contracts")
    .select(
      "id,course_registration_intent_id,course_id,teacher_id,customer_email,provider,provider_subscription_id,provider_customer_id,provider_mandate_id,status,interval_unit,interval_count,base_amount_cents,currency,billing_anchor_day,next_charge_at,started_at,ended_at,cancel_effective_date,metadata,created_at,updated_at"
    )
    .eq("id", id)
    .maybeSingle<SubscriptionContractRow>();

  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function findSubscriptionContractByIntentId(intentId: string): Promise<SubscriptionContract | null> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_contracts")
    .select(
      "id,course_registration_intent_id,course_id,teacher_id,customer_email,provider,provider_subscription_id,provider_customer_id,provider_mandate_id,status,interval_unit,interval_count,base_amount_cents,currency,billing_anchor_day,next_charge_at,started_at,ended_at,cancel_effective_date,metadata,created_at,updated_at"
    )
    .eq("course_registration_intent_id", intentId)
    .maybeSingle<SubscriptionContractRow>();

  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function findSubscriptionContractByProviderSubscriptionId(input: {
  provider: string;
  providerSubscriptionId: string;
}): Promise<SubscriptionContract | null> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_contracts")
    .select(
      "id,course_registration_intent_id,course_id,teacher_id,customer_email,provider,provider_subscription_id,provider_customer_id,provider_mandate_id,status,interval_unit,interval_count,base_amount_cents,currency,billing_anchor_day,next_charge_at,started_at,ended_at,cancel_effective_date,metadata,created_at,updated_at"
    )
    .eq("provider", input.provider)
    .eq("provider_subscription_id", input.providerSubscriptionId)
    .maybeSingle<SubscriptionContractRow>();

  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function listSubscriptionContractsByTeacherId(teacherId: string): Promise<SubscriptionContract[]> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_contracts")
    .select(
      "id,course_registration_intent_id,course_id,teacher_id,customer_email,provider,provider_subscription_id,provider_customer_id,provider_mandate_id,status,interval_unit,interval_count,base_amount_cents,currency,billing_anchor_day,next_charge_at,started_at,ended_at,cancel_effective_date,metadata,created_at,updated_at"
    )
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false })
    .returns<SubscriptionContractRow[]>();

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function updateSubscriptionContract(
  id: string,
  patch: Partial<CreateSubscriptionContractInput & { status: SubscriptionContractStatus }>
): Promise<SubscriptionContract> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_contracts")
    .update({
      course_registration_intent_id: patch.courseRegistrationIntentId,
      course_id: patch.courseId,
      teacher_id: patch.teacherId,
      customer_email: patch.customerEmail,
      provider: patch.provider,
      provider_subscription_id: patch.providerSubscriptionId,
      provider_customer_id: patch.providerCustomerId,
      provider_mandate_id: patch.providerMandateId,
      status: patch.status,
      interval_count: patch.intervalCount,
      base_amount_cents: patch.baseAmountCents,
      currency: patch.currency,
      billing_anchor_day: patch.billingAnchorDay,
      next_charge_at: patch.nextChargeAt,
      started_at: patch.startedAt,
      ended_at: patch.endedAt,
      cancel_effective_date: patch.cancelEffectiveDate,
      metadata: patch.metadata,
    })
    .eq("id", id)
    .select(
      "id,course_registration_intent_id,course_id,teacher_id,customer_email,provider,provider_subscription_id,provider_customer_id,provider_mandate_id,status,interval_unit,interval_count,base_amount_cents,currency,billing_anchor_day,next_charge_at,started_at,ended_at,cancel_effective_date,metadata,created_at,updated_at"
    )
    .single<SubscriptionContractRow>();

  if (error) throw error;
  return mapRow(data);
}

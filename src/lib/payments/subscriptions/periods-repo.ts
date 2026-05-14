import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  CreateSubscriptionPeriodInput,
  SubscriptionPeriod,
  SubscriptionPeriodStatus,
} from "@/lib/payments/subscriptions/types";

type SubscriptionPeriodRow = {
  id: string;
  subscription_contract_id: string;
  period_start: string;
  period_end: string;
  service_month: string;
  status: SubscriptionPeriodStatus;
  planned_charge_at: string | null;
  charged_at: string | null;
  pause_mode: "course_pause" | "participant_pause" | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function mapRow(row: SubscriptionPeriodRow): SubscriptionPeriod {
  return {
    id: row.id,
    subscriptionContractId: row.subscription_contract_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    serviceMonth: row.service_month,
    status: row.status,
    plannedChargeAt: row.planned_charge_at,
    chargedAt: row.charged_at,
    pauseMode: row.pause_mode,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createSubscriptionPeriod(input: CreateSubscriptionPeriodInput): Promise<SubscriptionPeriod> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_periods")
    .insert({
      subscription_contract_id: input.subscriptionContractId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      service_month: input.serviceMonth,
      status: input.status ?? "planned",
      planned_charge_at: input.plannedChargeAt ?? null,
      charged_at: input.chargedAt ?? null,
      pause_mode: input.pauseMode ?? null,
      metadata: input.metadata ?? {},
    })
    .select(
      "id,subscription_contract_id,period_start,period_end,service_month,status,planned_charge_at,charged_at,pause_mode,metadata,created_at,updated_at"
    )
    .single<SubscriptionPeriodRow>();

  if (error) throw error;
  return mapRow(data);
}

export async function findSubscriptionPeriodById(id: string): Promise<SubscriptionPeriod | null> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_periods")
    .select(
      "id,subscription_contract_id,period_start,period_end,service_month,status,planned_charge_at,charged_at,pause_mode,metadata,created_at,updated_at"
    )
    .eq("id", id)
    .maybeSingle<SubscriptionPeriodRow>();

  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function findSubscriptionPeriodByServiceMonth(input: {
  subscriptionContractId: string;
  serviceMonth: string;
}): Promise<SubscriptionPeriod | null> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_periods")
    .select(
      "id,subscription_contract_id,period_start,period_end,service_month,status,planned_charge_at,charged_at,pause_mode,metadata,created_at,updated_at"
    )
    .eq("subscription_contract_id", input.subscriptionContractId)
    .eq("service_month", input.serviceMonth)
    .maybeSingle<SubscriptionPeriodRow>();

  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function listSubscriptionPeriodsByContractId(
  subscriptionContractId: string
): Promise<SubscriptionPeriod[]> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_periods")
    .select(
      "id,subscription_contract_id,period_start,period_end,service_month,status,planned_charge_at,charged_at,pause_mode,metadata,created_at,updated_at"
    )
    .eq("subscription_contract_id", subscriptionContractId)
    .order("service_month", { ascending: true })
    .returns<SubscriptionPeriodRow[]>();

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function updateSubscriptionPeriod(
  id: string,
  patch: Partial<CreateSubscriptionPeriodInput & { status: SubscriptionPeriodStatus }>
): Promise<SubscriptionPeriod> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_periods")
    .update({
      subscription_contract_id: patch.subscriptionContractId,
      period_start: patch.periodStart,
      period_end: patch.periodEnd,
      service_month: patch.serviceMonth,
      status: patch.status,
      planned_charge_at: patch.plannedChargeAt,
      charged_at: patch.chargedAt,
      pause_mode: patch.pauseMode,
      metadata: patch.metadata,
    })
    .eq("id", id)
    .select(
      "id,subscription_contract_id,period_start,period_end,service_month,status,planned_charge_at,charged_at,pause_mode,metadata,created_at,updated_at"
    )
    .single<SubscriptionPeriodRow>();

  if (error) throw error;
  return mapRow(data);
}

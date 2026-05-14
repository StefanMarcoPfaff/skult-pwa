import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  CreateSubscriptionEventInput,
  SubscriptionEvent,
} from "@/lib/payments/subscriptions/types";

type SubscriptionEventRow = {
  id: string;
  subscription_contract_id: string | null;
  subscription_period_id: string | null;
  subscription_charge_id: string | null;
  event_type: string;
  event_source: SubscriptionEvent["eventSource"];
  payload: Record<string, unknown>;
  created_at: string;
};

function mapRow(row: SubscriptionEventRow): SubscriptionEvent {
  return {
    id: row.id,
    subscriptionContractId: row.subscription_contract_id,
    subscriptionPeriodId: row.subscription_period_id,
    subscriptionChargeId: row.subscription_charge_id,
    eventType: row.event_type,
    eventSource: row.event_source,
    payload: row.payload,
    createdAt: row.created_at,
  };
}

export async function createSubscriptionEvent(input: CreateSubscriptionEventInput): Promise<SubscriptionEvent> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_events")
    .insert({
      subscription_contract_id: input.subscriptionContractId ?? null,
      subscription_period_id: input.subscriptionPeriodId ?? null,
      subscription_charge_id: input.subscriptionChargeId ?? null,
      event_type: input.eventType,
      event_source: input.eventSource,
      payload: input.payload ?? {},
    })
    .select("id,subscription_contract_id,subscription_period_id,subscription_charge_id,event_type,event_source,payload,created_at")
    .single<SubscriptionEventRow>();

  if (error) throw error;
  return mapRow(data);
}

export async function findSubscriptionEventById(id: string): Promise<SubscriptionEvent | null> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_events")
    .select("id,subscription_contract_id,subscription_period_id,subscription_charge_id,event_type,event_source,payload,created_at")
    .eq("id", id)
    .maybeSingle<SubscriptionEventRow>();

  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function listSubscriptionEventsByContractId(subscriptionContractId: string): Promise<SubscriptionEvent[]> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_events")
    .select("id,subscription_contract_id,subscription_period_id,subscription_charge_id,event_type,event_source,payload,created_at")
    .eq("subscription_contract_id", subscriptionContractId)
    .order("created_at", { ascending: false })
    .returns<SubscriptionEventRow[]>();

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

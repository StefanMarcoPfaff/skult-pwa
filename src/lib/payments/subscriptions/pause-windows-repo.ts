import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  CreateSubscriptionPauseWindowInput,
  SubscriptionPauseWindow,
  SubscriptionPauseWindowStatus,
} from "@/lib/payments/subscriptions/types";

type SubscriptionPauseWindowRow = {
  id: string;
  subscription_contract_id: string | null;
  scope_type: SubscriptionPauseWindow["scopeType"];
  scope_id: string;
  start_date: string;
  end_date: string;
  status: SubscriptionPauseWindowStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function mapRow(row: SubscriptionPauseWindowRow): SubscriptionPauseWindow {
  return {
    id: row.id,
    subscriptionContractId: row.subscription_contract_id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createSubscriptionPauseWindow(
  input: CreateSubscriptionPauseWindowInput
): Promise<SubscriptionPauseWindow> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_pause_windows")
    .insert({
      subscription_contract_id: input.subscriptionContractId ?? null,
      scope_type: input.scopeType,
      scope_id: input.scopeId,
      start_date: input.startDate,
      end_date: input.endDate,
      status: input.status ?? "scheduled",
      metadata: input.metadata ?? {},
    })
    .select("id,subscription_contract_id,scope_type,scope_id,start_date,end_date,status,metadata,created_at,updated_at")
    .single<SubscriptionPauseWindowRow>();

  if (error) throw error;
  return mapRow(data);
}

export async function findSubscriptionPauseWindowById(id: string): Promise<SubscriptionPauseWindow | null> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_pause_windows")
    .select("id,subscription_contract_id,scope_type,scope_id,start_date,end_date,status,metadata,created_at,updated_at")
    .eq("id", id)
    .maybeSingle<SubscriptionPauseWindowRow>();

  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function listSubscriptionPauseWindowsByContractId(
  subscriptionContractId: string
): Promise<SubscriptionPauseWindow[]> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_pause_windows")
    .select("id,subscription_contract_id,scope_type,scope_id,start_date,end_date,status,metadata,created_at,updated_at")
    .eq("subscription_contract_id", subscriptionContractId)
    .order("start_date", { ascending: true })
    .returns<SubscriptionPauseWindowRow[]>();

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function listSubscriptionPauseWindowsByScope(input: {
  scopeType: SubscriptionPauseWindow["scopeType"];
  scopeId: string;
}): Promise<SubscriptionPauseWindow[]> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_pause_windows")
    .select("id,subscription_contract_id,scope_type,scope_id,start_date,end_date,status,metadata,created_at,updated_at")
    .eq("scope_type", input.scopeType)
    .eq("scope_id", input.scopeId)
    .order("start_date", { ascending: true })
    .returns<SubscriptionPauseWindowRow[]>();

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function updateSubscriptionPauseWindow(
  id: string,
  patch: Partial<CreateSubscriptionPauseWindowInput & { status: SubscriptionPauseWindowStatus }>
): Promise<SubscriptionPauseWindow> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_pause_windows")
    .update({
      subscription_contract_id: patch.subscriptionContractId,
      scope_type: patch.scopeType,
      scope_id: patch.scopeId,
      start_date: patch.startDate,
      end_date: patch.endDate,
      status: patch.status,
      metadata: patch.metadata,
    })
    .eq("id", id)
    .select("id,subscription_contract_id,scope_type,scope_id,start_date,end_date,status,metadata,created_at,updated_at")
    .single<SubscriptionPauseWindowRow>();

  if (error) throw error;
  return mapRow(data);
}

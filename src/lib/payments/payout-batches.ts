import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type PayableLedgerEntryRow = {
  id: string;
  provider_payout_profile_id: string | null;
  net_amount_cents: number;
  currency: string;
  payout_status: string;
  payout_batch_id: string | null;
};

type ProviderPayoutProfileRow = {
  id: string;
  provider: string;
  payout_method: string;
};

type PayoutBatchRow = {
  id: string;
};

type SimulationGroup = {
  providerPayoutProfileId: string;
  payoutProvider: string;
  payoutMethod: string;
  currency: string;
  entries: PayableLedgerEntryRow[];
};

export async function createSimulatedPayoutBatch(): Promise<{
  consideredCount: number;
  skippedCount: number;
  batchCount: number;
  itemCount: number;
  batchIds: string[];
}> {
  const admin = createSupabaseAdmin();
  const { data: payableEntries } = await admin
    .from("ledger_entries")
    .select("id,provider_payout_profile_id,net_amount_cents,currency,payout_status,payout_batch_id")
    .eq("entry_type", "payment")
    .eq("payout_status", "payable")
    .is("payout_batch_id", null)
    .returns<PayableLedgerEntryRow[]>();

  const candidateEntries = payableEntries ?? [];
  const profileIds = Array.from(
    new Set(
      candidateEntries
        .map((entry) => entry.provider_payout_profile_id)
        .filter((profileId): profileId is string => Boolean(profileId))
    )
  );

  if (candidateEntries.length === 0 || profileIds.length === 0) {
    return {
      consideredCount: candidateEntries.length,
      skippedCount: candidateEntries.length,
      batchCount: 0,
      itemCount: 0,
      batchIds: [],
    };
  }

  const { data: profiles } = await admin
    .from("provider_payout_profiles")
    .select("id,provider,payout_method")
    .in("id", profileIds)
    .returns<ProviderPayoutProfileRow[]>();

  const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile] as const));
  const groups = new Map<string, SimulationGroup>();
  let skippedCount = 0;

  for (const entry of candidateEntries) {
    if (!entry.provider_payout_profile_id) {
      skippedCount += 1;
      continue;
    }

    const profile = profilesById.get(entry.provider_payout_profile_id);
    if (!profile) {
      skippedCount += 1;
      continue;
    }

    const groupKey = [
      profile.id,
      profile.provider,
      profile.payout_method,
      entry.currency.trim().toUpperCase(),
    ].join("::");

    const existingGroup = groups.get(groupKey);
    if (existingGroup) {
      existingGroup.entries.push(entry);
      continue;
    }

    groups.set(groupKey, {
      providerPayoutProfileId: profile.id,
      payoutProvider: profile.provider,
      payoutMethod: profile.payout_method,
      currency: entry.currency.trim().toUpperCase(),
      entries: [entry],
    });
  }

  const createdBatchIds: string[] = [];
  let createdItemCount = 0;

  for (const group of groups.values()) {
    const eligibleEntryIds = group.entries.map((entry) => entry.id);
    const { data: lockedEntries } = await admin
      .from("ledger_entries")
      .select("id,provider_payout_profile_id,net_amount_cents,currency,payout_status,payout_batch_id")
      .in("id", eligibleEntryIds)
      .eq("payout_status", "payable")
      .is("payout_batch_id", null)
      .returns<PayableLedgerEntryRow[]>();

    const finalEntries = lockedEntries ?? [];
    if (finalEntries.length === 0) {
      continue;
    }

    const totalAmountCents = finalEntries.reduce((sum, entry) => sum + Math.max(0, entry.net_amount_cents), 0);
    const { data: batch } = await admin
      .from("payout_batches")
      .insert({
        payout_provider: group.payoutProvider,
        payout_method: group.payoutMethod,
        total_amount_cents: totalAmountCents,
        currency: group.currency,
        status: "simulated_pending",
      })
      .select("id")
      .single<PayoutBatchRow>();

    const batchId = batch?.id ?? null;
    if (!batchId) {
      continue;
    }

    createdBatchIds.push(batchId);

    for (const entry of finalEntries) {
      const { data: existingItem } = await admin
        .from("payout_items")
        .select("id")
        .eq("ledger_entry_id", entry.id)
        .maybeSingle<{ id: string }>();

      if (!existingItem?.id) {
        await admin.from("payout_items").insert({
          payout_batch_id: batchId,
          provider_payout_profile_id: group.providerPayoutProfileId,
          ledger_entry_id: entry.id,
          amount_cents: Math.max(0, entry.net_amount_cents),
          currency: group.currency,
          status: "simulated_pending",
        });
        createdItemCount += 1;
      }

      await admin
        .from("ledger_entries")
        .update({
          payout_batch_id: batchId,
          payout_status: "batched",
        })
        .eq("id", entry.id)
        .eq("payout_status", "payable")
        .is("payout_batch_id", null);
    }
  }

  return {
    consideredCount: candidateEntries.length,
    skippedCount,
    batchCount: createdBatchIds.length,
    itemCount: createdItemCount,
    batchIds: createdBatchIds,
  };
}

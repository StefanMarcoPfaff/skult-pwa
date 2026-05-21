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

type SelectedPayoutLedgerRow = {
  id: string;
  provider_payout_profile_id: string | null;
  net_amount_cents: number;
  currency: string;
  payout_status: string;
  payout_batch_id: string | null;
};

type SelectedPayoutProfileRow = {
  id: string;
  provider: string;
  payout_method: string;
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

export async function createSimulatedPaidPayoutForLedgerEntry(input: {
  ledgerEntryId: string;
}): Promise<{
  batchId: string;
  payoutItemId: string | null;
  ledgerEntryId: string;
}> {
  const ledgerEntryId = input.ledgerEntryId.trim();
  if (!ledgerEntryId) {
    throw new Error("Kein Ledger-Eintrag vorhanden");
  }

  const admin = createSupabaseAdmin();
  const { data: entry } = await admin
    .from("ledger_entries")
    .select("id,provider_payout_profile_id,net_amount_cents,currency,payout_status,payout_batch_id")
    .eq("id", ledgerEntryId)
    .eq("entry_type", "payment")
    .eq("source_type", "payment_transaction")
    .maybeSingle<SelectedPayoutLedgerRow>();

  if (!entry?.id) {
    throw new Error("Kein Ledger-Eintrag vorhanden");
  }

  if (!entry.provider_payout_profile_id) {
    throw new Error("Kein Provider-Payout-Profil vorhanden");
  }

  if (entry.payout_status === "cancelled" || entry.payout_status === "held") {
    throw new Error("Bereits storniert oder gesperrt");
  }

  if (entry.payout_status === "paid") {
    throw new Error("Bereits ausgezahlt");
  }

  if (entry.payout_batch_id) {
    const { data: existingItem } = await admin
      .from("payout_items")
      .select("id")
      .eq("ledger_entry_id", entry.id)
      .maybeSingle<{ id: string }>();

    await admin
      .from("payout_items")
      .update({
        status: "paid",
        executed_at: new Date().toISOString(),
      })
      .eq("ledger_entry_id", entry.id);

    await admin
      .from("payout_batches")
      .update({
        status: "paid",
        executed_at: new Date().toISOString(),
      })
      .eq("id", entry.payout_batch_id);

    const { data: updatedLedger } = await admin
      .from("ledger_entries")
      .update({
        payout_status: "paid",
      })
      .eq("id", entry.id)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (!updatedLedger?.id) {
      throw new Error("Ledger-Auszahlungsstatus konnte nicht auf paid gesetzt werden");
    }

    return {
      batchId: entry.payout_batch_id,
      payoutItemId: existingItem?.id ?? null,
      ledgerEntryId: entry.id,
    };
  }

  if (entry.payout_status !== "payable" && entry.payout_status !== "available") {
    throw new Error("Ledger-Eintrag ist noch nicht auszahlbar");
  }

  const { data: profile } = await admin
    .from("provider_payout_profiles")
    .select("id,provider,payout_method")
    .eq("id", entry.provider_payout_profile_id)
    .maybeSingle<SelectedPayoutProfileRow>();

  if (!profile?.id) {
    throw new Error("Kein Provider-Payout-Profil vorhanden");
  }

  const { data: batch } = await admin
    .from("payout_batches")
    .insert({
      payout_provider: profile.provider,
      payout_method: profile.payout_method,
      total_amount_cents: Math.max(0, entry.net_amount_cents),
      currency: entry.currency.trim().toUpperCase(),
      status: "paid",
      executed_at: new Date().toISOString(),
    })
    .select("id")
    .single<PayoutBatchRow>();

  const batchId = batch?.id ?? null;
  if (!batchId) {
    throw new Error("Simulations-Auszahlung konnte nicht angelegt werden");
  }

  const { data: item } = await admin
    .from("payout_items")
    .insert({
      payout_batch_id: batchId,
      provider_payout_profile_id: profile.id,
      ledger_entry_id: entry.id,
      amount_cents: Math.max(0, entry.net_amount_cents),
      currency: entry.currency.trim().toUpperCase(),
      status: "paid",
      executed_at: new Date().toISOString(),
    })
    .select("id")
    .single<{ id: string }>();

  const { data: updatedLedger } = await admin
    .from("ledger_entries")
    .update({
      payout_batch_id: batchId,
      payout_status: "paid",
    })
    .eq("id", entry.id)
    .eq("payout_status", entry.payout_status)
    .is("payout_batch_id", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (!updatedLedger?.id) {
    throw new Error("Ledger-Auszahlungsstatus konnte nicht finalisiert werden");
  }

  return {
    batchId,
    payoutItemId: item?.id ?? null,
    ledgerEntryId: entry.id,
  };
}

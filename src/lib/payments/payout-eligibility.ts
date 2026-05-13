import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const DEFAULT_PAYOUT_HOLD_DAYS = 7;

type EligibleLedgerEntryRow = {
  id: string;
  source_id: string;
  source_type: string;
  payout_status: string;
  available_at: string | null;
  payout_batch_id: string | null;
};

type RelatedPaymentTransactionRow = {
  id: string;
  booking_id: string | null;
  status: string;
  refunded_at: string | null;
};

export function calculatePayoutAvailableAt(input: {
  eventEndsAt?: string | null;
  holdDays?: number;
}): string | null {
  if (!input.eventEndsAt) {
    return null;
  }

  const eventEnd = new Date(input.eventEndsAt);
  if (Number.isNaN(eventEnd.getTime())) {
    return null;
  }

  const holdDays = input.holdDays ?? DEFAULT_PAYOUT_HOLD_DAYS;
  return new Date(eventEnd.getTime() + holdDays * 24 * 60 * 60 * 1000).toISOString();
}

export async function markEligibleLedgerEntriesAsPayable(): Promise<{
  checkedCount: number;
  markedCount: number;
  markedLedgerEntryIds: string[];
}> {
  const admin = createSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data: candidateEntries } = await admin
    .from("ledger_entries")
    .select("id,source_id,source_type,payout_status,available_at,payout_batch_id")
    .eq("entry_type", "payment")
    .eq("source_type", "payment_transaction")
    .eq("payout_status", "pending_event_completion")
    .is("payout_batch_id", null)
    .not("available_at", "is", null)
    .lte("available_at", nowIso)
    .returns<EligibleLedgerEntryRow[]>();

  const checkedEntries = candidateEntries ?? [];
  const paymentTransactionIds = checkedEntries.map((entry) => entry.source_id);

  if (paymentTransactionIds.length === 0) {
    return {
      checkedCount: 0,
      markedCount: 0,
      markedLedgerEntryIds: [],
    };
  }

  const { data: relatedTransactions } = await admin
    .from("payment_transactions")
    .select("id,booking_id,status,refunded_at")
    .in("id", paymentTransactionIds)
    .returns<RelatedPaymentTransactionRow[]>();

  const transactionsById = new Map((relatedTransactions ?? []).map((row) => [row.id, row] as const));
  const eligibleLedgerEntryIds = checkedEntries
    .filter((entry) => {
      const transaction = transactionsById.get(entry.source_id);
      if (!transaction?.booking_id) {
        return false;
      }

      if (transaction.status === "refunded" || transaction.status === "failed" || transaction.refunded_at) {
        return false;
      }

      return true;
    })
    .map((entry) => entry.id);

  if (eligibleLedgerEntryIds.length === 0) {
    return {
      checkedCount: checkedEntries.length,
      markedCount: 0,
      markedLedgerEntryIds: [],
    };
  }

  const { error } = await admin
    .from("ledger_entries")
    .update({
      payout_status: "payable",
    })
    .in("id", eligibleLedgerEntryIds)
    .eq("payout_status", "pending_event_completion")
    .is("payout_batch_id", null)
    .lte("available_at", nowIso);

  if (error) {
    throw error;
  }

  return {
    checkedCount: checkedEntries.length,
    markedCount: eligibleLedgerEntryIds.length,
    markedLedgerEntryIds: eligibleLedgerEntryIds,
  };
}

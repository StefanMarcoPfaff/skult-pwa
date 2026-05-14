"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSimulatedPayoutBatch } from "@/lib/payments/payout-batches";
import {
  forceLedgerEntryPayableForTest,
  markEligibleLedgerEntriesAsPayable,
} from "@/lib/payments/payout-eligibility";
import { requirePaymentsV2AdminAccess } from "./access";
import { PAYMENTS_V2_ADMIN_PATH } from "./ui";

function redirectWithActionState(actionState: string) {
  redirect(`${PAYMENTS_V2_ADMIN_PATH}?action=${encodeURIComponent(actionState)}`);
}

export async function markEligibleLedgerEntriesAsPayableAction() {
  await requirePaymentsV2AdminAccess();

  try {
    const result = await markEligibleLedgerEntriesAsPayable();
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithActionState(
      result.markedCount > 0 ? `eligible-ok-${result.markedCount}` : `eligible-none-${result.checkedCount}`
    );
  } catch {
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithActionState("eligible-error");
  }
}

export async function createSimulatedPayoutBatchAction() {
  await requirePaymentsV2AdminAccess();

  try {
    const result = await createSimulatedPayoutBatch();
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithActionState(
      result.batchCount > 0
        ? `batch-ok-${result.batchCount}-${result.itemCount}`
        : `batch-none-${result.consideredCount}`
    );
  } catch {
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithActionState("batch-error");
  }
}

export async function forceLedgerEntryPayableForTestAction(formData: FormData) {
  await requirePaymentsV2AdminAccess();

  const ledgerEntryId = String(formData.get("ledgerEntryId") ?? "").trim();

  try {
    const updated = await forceLedgerEntryPayableForTest(ledgerEntryId);
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithActionState(updated ? `force-payable-ok-${ledgerEntryId}` : `force-payable-none-${ledgerEntryId}`);
  } catch {
    revalidatePath(PAYMENTS_V2_ADMIN_PATH);
    redirectWithActionState(`force-payable-error-${ledgerEntryId}`);
  }
}

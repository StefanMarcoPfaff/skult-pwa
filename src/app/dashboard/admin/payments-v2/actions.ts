"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { createSimulatedPayoutBatch } from "@/lib/payments/payout-batches";
import { markEligibleLedgerEntriesAsPayable } from "@/lib/payments/payout-eligibility";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canAccessPaymentsV2Audit } from "./access";

const PAYMENTS_V2_ADMIN_PATH = "/dashboard/admin/payments-v2";

async function requirePaymentsV2AdminAccess() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!canAccessPaymentsV2Audit(user.email)) {
    notFound();
  }
}

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

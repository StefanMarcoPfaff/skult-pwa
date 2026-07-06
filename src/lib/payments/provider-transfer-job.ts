import "server-only";

import { markEligibleLedgerEntriesAsPayable } from "@/lib/payments/payout-eligibility";
import {
  processPayableOneTimeProviderTransfers,
  type ProcessProviderTransfersResult,
} from "@/lib/payments/provider-transfer-processor";
import {
  processProviderTransferPostProcessing,
  type ProcessProviderTransferPostProcessingResult,
} from "@/lib/payments/provider-transfer-post-processing";

export type ProviderTransferJobResult = {
  stripeMode: "test" | "live" | "unknown";
  markedPayable: Awaited<ReturnType<typeof markEligibleLedgerEntriesAsPayable>>;
  transfers: ProcessProviderTransfersResult;
  postTransfer: ProcessProviderTransferPostProcessingResult;
};

function getStripeMode(): ProviderTransferJobResult["stripeMode"] {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (key.startsWith("sk_test_")) return "test";
  if (key.startsWith("sk_live_")) return "live";
  return "unknown";
}

function assertStripeModeAllowed(): ProviderTransferJobResult["stripeMode"] {
  const stripeMode = getStripeMode();
  const liveTransfersEnabled = process.env.STRIPE_PROVIDER_TRANSFERS_ALLOW_LIVE === "true";

  if (stripeMode === "live" && !liveTransfersEnabled) {
    throw new Error("Stripe Live-Transfers sind nicht aktiviert. Setze STRIPE_PROVIDER_TRANSFERS_ALLOW_LIVE=true bewusst.");
  }

  return stripeMode;
}

export async function runPayableOneTimeProviderTransferJob(input?: {
  limit?: number;
}): Promise<ProviderTransferJobResult> {
  const stripeMode = assertStripeModeAllowed();
  const markedPayable = await markEligibleLedgerEntriesAsPayable({ scope: "one_time_stripe_custom_v2" });
  const transfers = await processPayableOneTimeProviderTransfers({ limit: input?.limit });
  const createdLedgerEntryIds = transfers.results
    .filter((result) => result.status === "created")
    .map((result) => result.ledgerEntryId);
  const postTransfer = await processProviderTransferPostProcessing({
    ledgerEntryIds: createdLedgerEntryIds.length > 0 ? createdLedgerEntryIds : undefined,
    limit: input?.limit,
  });

  return {
    stripeMode,
    markedPayable,
    transfers,
    postTransfer,
  };
}

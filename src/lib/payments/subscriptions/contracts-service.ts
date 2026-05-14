import "server-only";

import {
  createSubscriptionContract,
  findSubscriptionContractById,
  updateSubscriptionContract,
} from "@/lib/payments/subscriptions/contracts-repo";
import { canTransitionSubscriptionContractStatus } from "@/lib/payments/subscriptions/status";
import type {
  CreateSubscriptionContractInput,
  SubscriptionContract,
  SubscriptionContractStatus,
} from "@/lib/payments/subscriptions/types";

function assertContractTransition(current: SubscriptionContractStatus, next: SubscriptionContractStatus) {
  if (!canTransitionSubscriptionContractStatus(current, next)) {
    throw new Error(`Invalid subscription contract status transition: ${current} -> ${next}`);
  }
}

export async function createDraftContract(
  input: Omit<CreateSubscriptionContractInput, "status">
): Promise<SubscriptionContract> {
  return createSubscriptionContract({
    ...input,
    status: "draft",
  });
}

export async function createPendingInitialPaymentContract(
  input: Omit<CreateSubscriptionContractInput, "status">
): Promise<SubscriptionContract> {
  return createSubscriptionContract({
    ...input,
    status: "pending_initial_payment",
  });
}

export async function activateContract(input: {
  contractId: string;
  startedAt?: string | null;
  nextChargeAt?: string | null;
  providerSubscriptionId?: string | null;
  providerCustomerId?: string | null;
  providerMandateId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<SubscriptionContract> {
  const existing = await findSubscriptionContractById(input.contractId);
  if (!existing) {
    throw new Error(`Subscription contract not found: ${input.contractId}`);
  }

  assertContractTransition(existing.status, "active");

  return updateSubscriptionContract(input.contractId, {
    status: "active",
    startedAt: input.startedAt ?? existing.startedAt ?? new Date().toISOString(),
    nextChargeAt: input.nextChargeAt ?? existing.nextChargeAt,
    providerSubscriptionId: input.providerSubscriptionId ?? existing.providerSubscriptionId,
    providerCustomerId: input.providerCustomerId ?? existing.providerCustomerId,
    providerMandateId: input.providerMandateId ?? existing.providerMandateId,
    metadata: input.metadata ? { ...existing.metadata, ...input.metadata } : existing.metadata,
  });
}

export async function markLegacyExternal(input: {
  contractId: string;
  providerSubscriptionId?: string | null;
  providerCustomerId?: string | null;
  providerMandateId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<SubscriptionContract> {
  const existing = await findSubscriptionContractById(input.contractId);
  if (!existing) {
    throw new Error(`Subscription contract not found: ${input.contractId}`);
  }

  assertContractTransition(existing.status, "legacy_external");

  return updateSubscriptionContract(input.contractId, {
    status: "legacy_external",
    providerSubscriptionId: input.providerSubscriptionId ?? existing.providerSubscriptionId,
    providerCustomerId: input.providerCustomerId ?? existing.providerCustomerId,
    providerMandateId: input.providerMandateId ?? existing.providerMandateId,
    metadata: input.metadata ? { ...existing.metadata, ...input.metadata } : existing.metadata,
  });
}

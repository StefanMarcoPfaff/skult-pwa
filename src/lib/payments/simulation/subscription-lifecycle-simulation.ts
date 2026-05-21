import "server-only";

import { listSubscriptionChargesByContractId, updateSubscriptionCharge } from "@/lib/payments/subscriptions/charges-repo";
import { findSubscriptionContractById, updateSubscriptionContract } from "@/lib/payments/subscriptions/contracts-repo";
import {
  getBerlinTodayDate,
  getLastDayOfMonth,
  normalizeSubscriptionDateString,
  toBerlinEndOfDayIso,
} from "@/lib/payments/subscriptions/dates";
import { createSubscriptionEvent, listSubscriptionEventsByContractId } from "@/lib/payments/subscriptions/events-repo";
import {
  createSubscriptionPauseWindow,
  listSubscriptionPauseWindowsByContractId,
  updateSubscriptionPauseWindow,
} from "@/lib/payments/subscriptions/pause-windows-repo";
import { listSubscriptionPeriodsByContractId, updateSubscriptionPeriod } from "@/lib/payments/subscriptions/periods-repo";
import {
  canTransitionSubscriptionChargeStatus,
  canTransitionSubscriptionContractStatus,
  canTransitionSubscriptionPauseWindowStatus,
  canTransitionSubscriptionPeriodStatus,
} from "@/lib/payments/subscriptions/status";
import type {
  SubscriptionContract,
  SubscriptionEvent,
  SubscriptionPauseWindow,
  SubscriptionPeriod,
} from "@/lib/payments/subscriptions/types";
import { assertSimulationTargetId, buildSimulationMetadata } from "@/lib/payments/simulation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type SubscriptionLifecycleResult = {
  subscriptionContractId: string;
  pauseWindowId?: string | null;
  eventId: string;
  newStatus: string;
  nextRenewalBlocked: boolean;
  affectedPeriodIds: string[];
  affectedChargeIds: string[];
  simulationMetadata: ReturnType<typeof buildSimulationMetadata>;
};

function normalizeRequiredDate(value: string | null | undefined, fieldName: string): string {
  const normalized = normalizeSubscriptionDateString(value);
  if (!normalized) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return normalized;
}

function ensureMonthFirst(value: string, fieldName: string) {
  if (!value.endsWith("-01")) {
    throw new Error(`${fieldName} must be a month first day`);
  }
}

function ensureMonthLast(value: string, fieldName: string) {
  if (getLastDayOfMonth(value) !== value) {
    throw new Error(`${fieldName} must be a month last day`);
  }
}

function isContractLifecycleSimulationAllowed(contract: SubscriptionContract): boolean {
  return ["active", "pause_scheduled", "paused"].includes(contract.status);
}

function isDateWithinRange(value: string, startDate: string, endDate: string): boolean {
  return value >= startDate && value <= endDate;
}

function shouldAffectPeriodForPause(period: SubscriptionPeriod, pauseStartDate: string, pauseEndDate: string): boolean {
  return period.periodStart >= pauseStartDate && period.periodEnd <= pauseEndDate;
}

function shouldAffectPeriodForCancel(period: SubscriptionPeriod, cancelEffectiveDate: string): boolean {
  return period.periodStart > cancelEffectiveDate;
}

async function ensureSimulationEvent(input: {
  events: SubscriptionEvent[];
  contractId: string;
  eventType: string;
  referenceId: string;
  simulationMetadata: ReturnType<typeof buildSimulationMetadata>;
  payload: Record<string, unknown>;
}) {
  const existing = input.events.find(
    (event) =>
      event.eventType === input.eventType &&
      event.subscriptionContractId === input.contractId &&
      event.payload.reference_id === input.referenceId
  );

  if (existing) {
    return existing;
  }

  const created = await createSubscriptionEvent({
    subscriptionContractId: input.contractId,
    eventType: input.eventType,
    eventSource: "admin",
    payload: {
      simulation: true,
      triggered_by_admin_user_id: input.simulationMetadata.triggered_by_admin_user_id,
      triggered_at: input.simulationMetadata.triggered_at,
      scenario: input.simulationMetadata.scenario,
      source_admin_ui: input.simulationMetadata.source_admin_ui,
      reference_id: input.referenceId,
      ...input.payload,
    },
  });
  input.events.push(created);
  return created;
}

async function maybeUpdateIntentSubscriptionStatus(input: {
  contract: SubscriptionContract;
  subscriptionStatus: "pause_scheduled" | "paused" | "cancel_scheduled" | "cancelled";
  pauseStartDate?: string | null;
  pauseEndDate?: string | null;
  stopDate?: string | null;
}) {
  if (!input.contract.courseRegistrationIntentId) {
    return;
  }

  const admin = createSupabaseAdmin();
  await admin
    .from("course_registration_intents")
    .update({
      subscription_status: input.subscriptionStatus,
      subscription_pause_start_date:
        input.subscriptionStatus === "pause_scheduled" || input.subscriptionStatus === "paused"
          ? input.pauseStartDate ?? null
          : null,
      subscription_pause_end_date:
        input.subscriptionStatus === "pause_scheduled" || input.subscriptionStatus === "paused"
          ? input.pauseEndDate ?? null
          : null,
      subscription_stop_date:
        input.subscriptionStatus === "cancel_scheduled" || input.subscriptionStatus === "cancelled"
          ? input.stopDate ?? null
          : null,
      subscription_cancel_scheduled_at:
        input.subscriptionStatus === "cancel_scheduled" ? new Date().toISOString() : null,
    })
    .eq("id", input.contract.courseRegistrationIntentId);
}

function isNextRenewalBlockedByPause(nextChargeAt: string | null, pauseStartDate: string, pauseEndDate: string): boolean {
  const nextChargeDate = normalizeSubscriptionDateString(nextChargeAt?.slice(0, 10) ?? null);
  if (!nextChargeDate) return false;
  return nextChargeDate >= pauseStartDate && nextChargeDate <= pauseEndDate;
}

function isNextRenewalBlockedByCancel(nextChargeAt: string | null, cancelEffectiveDate: string): boolean {
  const nextChargeDate = normalizeSubscriptionDateString(nextChargeAt?.slice(0, 10) ?? null);
  if (!nextChargeDate) return false;
  return nextChargeDate > cancelEffectiveDate;
}

async function updatePeriodsAndChargesForPause(input: {
  contract: SubscriptionContract;
  pauseStartDate: string;
  pauseEndDate: string;
}): Promise<{ affectedPeriodIds: string[]; affectedChargeIds: string[] }> {
  const periods = await listSubscriptionPeriodsByContractId(input.contract.id);
  const charges = await listSubscriptionChargesByContractId(input.contract.id);
  const affectedPeriodIds: string[] = [];
  const affectedChargeIds: string[] = [];

  for (const period of periods) {
    if (!shouldAffectPeriodForPause(period, input.pauseStartDate, input.pauseEndDate)) {
      continue;
    }

    if (canTransitionSubscriptionPeriodStatus(period.status, "paused")) {
      const updated = await updateSubscriptionPeriod(period.id, {
        status: "paused",
        pauseMode: "course_pause",
      });
      affectedPeriodIds.push(updated.id);
    } else if (period.status === "paused") {
      affectedPeriodIds.push(period.id);
    }

    const relatedCharges = charges.filter((charge) => charge.subscriptionPeriodId === period.id);
    for (const charge of relatedCharges) {
      if (["paid", "refunded", "credited", "cancelled"].includes(charge.status)) {
        continue;
      }

      if (canTransitionSubscriptionChargeStatus(charge.status, "cancelled")) {
        const updatedCharge = await updateSubscriptionCharge(charge.id, {
          status: "cancelled",
        });
        affectedChargeIds.push(updatedCharge.id);
      }
    }
  }

  return { affectedPeriodIds, affectedChargeIds };
}

async function updatePeriodsAndChargesForCancel(input: {
  contract: SubscriptionContract;
  cancelEffectiveDate: string;
}): Promise<{ affectedPeriodIds: string[]; affectedChargeIds: string[] }> {
  const periods = await listSubscriptionPeriodsByContractId(input.contract.id);
  const charges = await listSubscriptionChargesByContractId(input.contract.id);
  const affectedPeriodIds: string[] = [];
  const affectedChargeIds: string[] = [];

  for (const period of periods) {
    if (!shouldAffectPeriodForCancel(period, input.cancelEffectiveDate)) {
      continue;
    }

    if (canTransitionSubscriptionPeriodStatus(period.status, "cancelled")) {
      const updated = await updateSubscriptionPeriod(period.id, {
        status: "cancelled",
      });
      affectedPeriodIds.push(updated.id);
    } else if (period.status === "cancelled") {
      affectedPeriodIds.push(period.id);
    }

    const relatedCharges = charges.filter((charge) => charge.subscriptionPeriodId === period.id);
    for (const charge of relatedCharges) {
      if (["paid", "refunded", "credited", "cancelled"].includes(charge.status)) {
        continue;
      }

      if (canTransitionSubscriptionChargeStatus(charge.status, "cancelled")) {
        const updatedCharge = await updateSubscriptionCharge(charge.id, {
          status: "cancelled",
        });
        affectedChargeIds.push(updatedCharge.id);
      }
    }
  }

  return { affectedPeriodIds, affectedChargeIds };
}

export async function simulateSubscriptionPause(input: {
  subscriptionContractId: string;
  adminUserId: string;
  pauseStartDate: string;
  pauseEndDate: string;
  scenarioNote?: string | null;
  reason?: string | null;
}): Promise<SubscriptionLifecycleResult> {
  const subscriptionContractId = assertSimulationTargetId(input.subscriptionContractId);
  const pauseStartDate = normalizeRequiredDate(input.pauseStartDate, "pauseStartDate");
  const pauseEndDate = normalizeRequiredDate(input.pauseEndDate, "pauseEndDate");
  ensureMonthFirst(pauseStartDate, "pauseStartDate");
  ensureMonthLast(pauseEndDate, "pauseEndDate");

  if (pauseEndDate <= pauseStartDate) {
    throw new Error("pauseEndDate must be after pauseStartDate");
  }

  const simulationMetadata = buildSimulationMetadata({
    triggeredByAdminUserId: input.adminUserId,
    scenario: input.scenarioNote?.trim()
      ? `subscription_pause:${input.scenarioNote.trim()}`
      : "subscription_pause",
    sourceAdminUi: "/dashboard/admin/payments-v2/subscriptions",
  });

  const contract = await findSubscriptionContractById(subscriptionContractId);
  if (!contract) {
    throw new Error("Subscription contract not found");
  }

  if (!isContractLifecycleSimulationAllowed(contract)) {
    throw new Error(`Subscription contract status not allowed for pause simulation: ${contract.status}`);
  }

  const today = getBerlinTodayDate();
  const nextStatus = isDateWithinRange(today, pauseStartDate, pauseEndDate) ? "paused" : "pause_scheduled";
  if (!canTransitionSubscriptionContractStatus(contract.status, nextStatus)) {
    throw new Error(`Invalid contract transition for pause simulation: ${contract.status} -> ${nextStatus}`);
  }

  const pauseWindows = await listSubscriptionPauseWindowsByContractId(contract.id);
  const existingPauseWindow =
    pauseWindows.find(
      (window) =>
        window.scopeType === "contract" &&
        window.scopeId === contract.id &&
        window.startDate === pauseStartDate &&
        window.endDate === pauseEndDate
    ) ?? null;

  let pauseWindow: SubscriptionPauseWindow;
  if (existingPauseWindow) {
    const desiredWindowStatus = nextStatus === "paused" ? "active" : "scheduled";
    if (
      existingPauseWindow.status !== desiredWindowStatus &&
      canTransitionSubscriptionPauseWindowStatus(existingPauseWindow.status, desiredWindowStatus)
    ) {
      pauseWindow = await updateSubscriptionPauseWindow(existingPauseWindow.id, {
        status: desiredWindowStatus,
      });
    } else {
      pauseWindow = existingPauseWindow;
    }
  } else {
    pauseWindow = await createSubscriptionPauseWindow({
      subscriptionContractId: contract.id,
      scopeType: "contract",
      scopeId: contract.id,
      startDate: pauseStartDate,
      endDate: pauseEndDate,
      status: nextStatus === "paused" ? "active" : "scheduled",
      metadata: {
        simulation: true,
        scenario: simulationMetadata.scenario,
        sourceAdminUi: simulationMetadata.source_admin_ui,
        reason: input.reason?.trim() || null,
      },
    });
  }

  const updatedContract = await updateSubscriptionContract(contract.id, {
    status: nextStatus,
    metadata: {
      ...contract.metadata,
      simulation: true,
      lastSimulatedPauseWindowId: pauseWindow.id,
    },
  });

  const { affectedPeriodIds, affectedChargeIds } = await updatePeriodsAndChargesForPause({
    contract: updatedContract,
    pauseStartDate,
    pauseEndDate,
  });

  await maybeUpdateIntentSubscriptionStatus({
    contract: updatedContract,
    subscriptionStatus: nextStatus,
    pauseStartDate,
    pauseEndDate,
  });

  const events = await listSubscriptionEventsByContractId(contract.id);
  const event = await ensureSimulationEvent({
    events,
    contractId: contract.id,
    eventType: "subscription_pause_simulated",
    referenceId: `${pauseStartDate}:${pauseEndDate}`,
    simulationMetadata,
    payload: {
      pause_window_id: pauseWindow.id,
      pause_start_date: pauseStartDate,
      pause_end_date: pauseEndDate,
      contract_status: nextStatus,
      reason: input.reason?.trim() || null,
    },
  });

  return {
    subscriptionContractId: contract.id,
    pauseWindowId: pauseWindow.id,
    eventId: event.id,
    newStatus: nextStatus,
    nextRenewalBlocked:
      nextStatus === "paused" || isNextRenewalBlockedByPause(updatedContract.nextChargeAt, pauseStartDate, pauseEndDate),
    affectedPeriodIds,
    affectedChargeIds,
    simulationMetadata,
  };
}

export async function simulateSubscriptionCancel(input: {
  subscriptionContractId: string;
  adminUserId: string;
  cancelEffectiveDate: string;
  scenarioNote?: string | null;
  reason?: string | null;
}): Promise<SubscriptionLifecycleResult> {
  const subscriptionContractId = assertSimulationTargetId(input.subscriptionContractId);
  const cancelEffectiveDate = normalizeRequiredDate(input.cancelEffectiveDate, "cancelEffectiveDate");
  ensureMonthLast(cancelEffectiveDate, "cancelEffectiveDate");

  const simulationMetadata = buildSimulationMetadata({
    triggeredByAdminUserId: input.adminUserId,
    scenario: input.scenarioNote?.trim()
      ? `subscription_cancel:${input.scenarioNote.trim()}`
      : "subscription_cancel",
    sourceAdminUi: "/dashboard/admin/payments-v2/subscriptions",
  });

  const contract = await findSubscriptionContractById(subscriptionContractId);
  if (!contract) {
    throw new Error("Subscription contract not found");
  }

  if (!isContractLifecycleSimulationAllowed(contract)) {
    throw new Error(`Subscription contract status not allowed for cancel simulation: ${contract.status}`);
  }

  const today = getBerlinTodayDate();
  const nextStatus = cancelEffectiveDate <= today ? "cancelled" : "cancel_scheduled";
  if (!canTransitionSubscriptionContractStatus(contract.status, nextStatus)) {
    throw new Error(`Invalid contract transition for cancel simulation: ${contract.status} -> ${nextStatus}`);
  }

  const updatedContract = await updateSubscriptionContract(contract.id, {
    status: nextStatus,
    cancelEffectiveDate,
    endedAt: cancelEffectiveDate <= today ? toBerlinEndOfDayIso(cancelEffectiveDate) : contract.endedAt,
    metadata: {
      ...contract.metadata,
      simulation: true,
      lastSimulatedCancelEffectiveDate: cancelEffectiveDate,
    },
  });

  const { affectedPeriodIds, affectedChargeIds } = await updatePeriodsAndChargesForCancel({
    contract: updatedContract,
    cancelEffectiveDate,
  });

  await maybeUpdateIntentSubscriptionStatus({
    contract: updatedContract,
    subscriptionStatus: nextStatus,
    stopDate: cancelEffectiveDate,
  });

  const events = await listSubscriptionEventsByContractId(contract.id);
  const event = await ensureSimulationEvent({
    events,
    contractId: contract.id,
    eventType: "subscription_cancel_simulated",
    referenceId: cancelEffectiveDate,
    simulationMetadata,
    payload: {
      cancel_effective_date: cancelEffectiveDate,
      contract_status: nextStatus,
      ended_at: cancelEffectiveDate <= today ? toBerlinEndOfDayIso(cancelEffectiveDate) : null,
      reason: input.reason?.trim() || null,
    },
  });

  return {
    subscriptionContractId: contract.id,
    eventId: event.id,
    newStatus: nextStatus,
    nextRenewalBlocked:
      nextStatus === "cancelled" || isNextRenewalBlockedByCancel(updatedContract.nextChargeAt, cancelEffectiveDate),
    affectedPeriodIds,
    affectedChargeIds,
    simulationMetadata,
  };
}

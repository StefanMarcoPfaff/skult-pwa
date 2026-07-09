import "server-only";

import { listSubscriptionChargesByContractId, updateSubscriptionCharge } from "@/lib/payments/subscriptions/charges-repo";
import {
  createSubscriptionContract,
  findSubscriptionContractById,
  findSubscriptionContractByIntentId,
  findSubscriptionContractByProviderSubscriptionId,
  updateSubscriptionContract,
} from "@/lib/payments/subscriptions/contracts-repo";
import {
  getBerlinTodayDate,
  getFirstDayOfMonth,
  getFirstDayOfNextMonth,
  getLastDayOfMonth,
  normalizeSubscriptionDateString,
  toBerlinEndOfDayIso,
  toBerlinStartOfDayIso,
} from "@/lib/payments/subscriptions/dates";
import { createSubscriptionEvent, listSubscriptionEventsByContractId } from "@/lib/payments/subscriptions/events-repo";
import {
  createSubscriptionPauseWindow,
  listSubscriptionPauseWindowsByScope,
  updateSubscriptionPauseWindow,
} from "@/lib/payments/subscriptions/pause-windows-repo";
import {
  createSubscriptionPeriod,
  findSubscriptionPeriodByServiceMonth,
  listSubscriptionPeriodsByContractId,
  updateSubscriptionPeriod,
} from "@/lib/payments/subscriptions/periods-repo";
import type {
  SubscriptionContract,
  SubscriptionPauseMode,
  SubscriptionPauseScopeType,
  SubscriptionPauseWindow,
  SubscriptionPeriodStatus,
} from "@/lib/payments/subscriptions/types";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type LifecycleIntentRow = {
  id: string;
  course_id: string;
  email: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  subscription_contract_id: string | null;
};

type LifecycleCourseRow = {
  id: string;
  teacher_id: string | null;
  price_cents: number | null;
  currency: string | null;
  ends_at: string | null;
};

type PauseScope = {
  scopeType: SubscriptionPauseScopeType;
  scopeId: string;
  pauseMode: SubscriptionPauseMode;
};

function normalizeCurrency(currency: string | null | undefined): string {
  return (currency ?? "EUR").trim().toUpperCase() || "EUR";
}

function getPauseWindowStatus(startDate: string, endDate: string): "scheduled" | "active" | "completed" {
  const today = getBerlinTodayDate();
  if (endDate < today) return "completed";
  if (startDate <= today && today <= endDate) return "active";
  return "scheduled";
}

function getContractLifecycleStatusForWindow(startDate: string, endDate: string): "pause_scheduled" | "paused" | "active" {
  const windowStatus = getPauseWindowStatus(startDate, endDate);
  if (windowStatus === "active") return "paused";
  if (windowStatus === "scheduled") return "pause_scheduled";
  return "active";
}

function getContractLifecycleStatusForCancel(cancelEffectiveDate: string): "cancel_scheduled" | "cancelled" {
  return cancelEffectiveDate <= getBerlinTodayDate() ? "cancelled" : "cancel_scheduled";
}

function isTerminalChargeStatus(status: string): boolean {
  return ["paid", "refunded", "credited", "cancelled"].includes(status);
}

function* iterateServiceMonths(startDate: string, endDate: string): Generator<string> {
  let current = getFirstDayOfMonth(startDate);
  const last = getFirstDayOfMonth(endDate);
  while (current <= last) {
    yield current;
    current = getFirstDayOfNextMonth(current);
  }
}

async function loadIntent(intentId: string): Promise<LifecycleIntentRow | null> {
  const { data } = await createSupabaseAdmin()
    .from("course_registration_intents")
    .select("id,course_id,email,stripe_subscription_id,stripe_customer_id,subscription_contract_id")
    .eq("id", intentId)
    .maybeSingle<LifecycleIntentRow>();

  return data ?? null;
}

async function loadCourse(courseId: string): Promise<LifecycleCourseRow | null> {
  const { data } = await createSupabaseAdmin()
    .from("courses")
    .select("id,teacher_id,price_cents,currency,ends_at")
    .eq("id", courseId)
    .maybeSingle<LifecycleCourseRow>();

  return data ?? null;
}

async function linkIntentToContract(intentId: string, contractId: string): Promise<void> {
  await createSupabaseAdmin()
    .from("course_registration_intents")
    .update({ subscription_contract_id: contractId })
    .eq("id", intentId)
    .is("subscription_contract_id", null);
}

async function ensureContractForIntent(intentId: string): Promise<SubscriptionContract | null> {
  const intent = await loadIntent(intentId);
  if (!intent) return null;

  let contract =
    (intent.subscription_contract_id ? await findSubscriptionContractById(intent.subscription_contract_id) : null) ??
    (intent.stripe_subscription_id
      ? await findSubscriptionContractByProviderSubscriptionId({
          provider: "stripe",
          providerSubscriptionId: intent.stripe_subscription_id,
        })
      : null) ??
    (await findSubscriptionContractByIntentId(intent.id));

  if (contract) {
    await linkIntentToContract(intent.id, contract.id);
    return contract;
  }

  const course = await loadCourse(intent.course_id);
  if (!course?.teacher_id) return null;

  try {
    contract = await createSubscriptionContract({
      courseRegistrationIntentId: intent.id,
      courseId: intent.course_id,
      teacherId: course.teacher_id,
      customerEmail: intent.email ?? "unknown@example.invalid",
      provider: "stripe",
      providerSubscriptionId: intent.stripe_subscription_id,
      providerCustomerId: intent.stripe_customer_id,
      status: "active",
      baseAmountCents: course.price_cents ?? 0,
      currency: normalizeCurrency(course.currency),
      billingAnchorDay: 1,
      metadata: {
        createdFrom: "subscription_lifecycle_materialization",
      },
    });
  } catch {
    contract =
      (intent.stripe_subscription_id
        ? await findSubscriptionContractByProviderSubscriptionId({
            provider: "stripe",
            providerSubscriptionId: intent.stripe_subscription_id,
          })
        : null) ?? (await findSubscriptionContractByIntentId(intent.id));
  }

  if (contract) {
    await linkIntentToContract(intent.id, contract.id);
  }

  return contract;
}

async function ensurePauseWindow(input: {
  contract: SubscriptionContract;
  scope: PauseScope;
  startDate: string;
  endDate: string;
  source: "participant_button" | "course_button" | "course_end";
}): Promise<SubscriptionPauseWindow> {
  const existing =
    (await listSubscriptionPauseWindowsByScope({
      scopeType: input.scope.scopeType,
      scopeId: input.scope.scopeId,
    })).find(
      (window) =>
        window.subscriptionContractId === input.contract.id &&
        window.startDate === input.startDate &&
        window.endDate === input.endDate
    ) ?? null;
  const status = getPauseWindowStatus(input.startDate, input.endDate);
  const metadata = {
    ...(existing?.metadata ?? {}),
    source: input.source,
  };

  if (existing) {
    return updateSubscriptionPauseWindow(existing.id, {
      subscriptionContractId: input.contract.id,
      status,
      metadata,
    });
  }

  return createSubscriptionPauseWindow({
    subscriptionContractId: input.contract.id,
    scopeType: input.scope.scopeType,
    scopeId: input.scope.scopeId,
    startDate: input.startDate,
    endDate: input.endDate,
    status,
    metadata,
  });
}

async function ensurePausedPeriod(input: {
  contract: SubscriptionContract;
  serviceMonth: string;
  pauseMode: SubscriptionPauseMode;
  pauseWindowId: string;
}): Promise<string> {
  const periodStart = input.serviceMonth;
  const periodEnd = getLastDayOfMonth(input.serviceMonth);
  const existing = await findSubscriptionPeriodByServiceMonth({
    subscriptionContractId: input.contract.id,
    serviceMonth: input.serviceMonth,
  });
  const metadata = {
    ...(existing?.metadata ?? {}),
    pauseWindowId: input.pauseWindowId,
  };

  const periodStatus = existing?.status === "charged" ? "charged" : "paused";
  const period = existing
    ? await updateSubscriptionPeriod(existing.id, {
        periodStart,
        periodEnd,
        serviceMonth: input.serviceMonth,
        status: periodStatus,
        plannedChargeAt: toBerlinStartOfDayIso(input.serviceMonth),
        chargedAt: existing.status === "charged" ? existing.chargedAt : null,
        pauseMode: input.pauseMode,
        metadata,
      })
    : await createSubscriptionPeriod({
        subscriptionContractId: input.contract.id,
        periodStart,
        periodEnd,
        serviceMonth: input.serviceMonth,
        status: "paused",
        plannedChargeAt: toBerlinStartOfDayIso(input.serviceMonth),
        chargedAt: null,
        pauseMode: input.pauseMode,
        metadata,
      });

  const charges = await listSubscriptionChargesByContractId(input.contract.id);
  for (const charge of charges.filter((item) => item.subscriptionPeriodId === period.id)) {
    if (isTerminalChargeStatus(charge.status)) continue;
    await updateSubscriptionCharge(charge.id, { status: "cancelled" });
  }

  return period.id;
}

async function recordLifecycleEvent(input: {
  contract: SubscriptionContract;
  eventType: string;
  referenceId: string;
  payload: Record<string, unknown>;
}) {
  const events = await listSubscriptionEventsByContractId(input.contract.id);
  const existing = events.find(
    (event) => event.eventType === input.eventType && event.payload.reference_id === input.referenceId
  );
  if (existing) return;

  await createSubscriptionEvent({
    subscriptionContractId: input.contract.id,
    eventType: input.eventType,
    eventSource: "system",
    payload: {
      reference_id: input.referenceId,
      ...input.payload,
    },
  });
}

export async function mirrorParticipantPauseToSubscriptionModel(input: {
  courseRegistrationIntentId: string;
  pauseStartDate: string;
  pauseEndDateInclusive: string;
}): Promise<{ contractId: string; pauseWindowId: string; periodIds: string[] } | null> {
  const pauseStartDate = normalizeSubscriptionDateString(input.pauseStartDate);
  const pauseEndDateInclusive = normalizeSubscriptionDateString(input.pauseEndDateInclusive);
  if (!pauseStartDate || !pauseEndDateInclusive || pauseEndDateInclusive < pauseStartDate) return null;

  const contract = await ensureContractForIntent(input.courseRegistrationIntentId);
  if (!contract) return null;

  const pauseWindow = await ensurePauseWindow({
    contract,
    scope: {
      scopeType: "participant",
      scopeId: input.courseRegistrationIntentId,
      pauseMode: "participant_pause",
    },
    startDate: pauseStartDate,
    endDate: pauseEndDateInclusive,
    source: "participant_button",
  });
  const periodIds: string[] = [];
  for (const serviceMonth of iterateServiceMonths(pauseStartDate, pauseEndDateInclusive)) {
    periodIds.push(
      await ensurePausedPeriod({
        contract,
        serviceMonth,
        pauseMode: "participant_pause",
        pauseWindowId: pauseWindow.id,
      })
    );
  }

  const status = getContractLifecycleStatusForWindow(pauseStartDate, pauseEndDateInclusive);
  await updateSubscriptionContract(contract.id, {
    status,
    metadata: {
      ...contract.metadata,
      lastPauseWindowId: pauseWindow.id,
    },
  });
  await recordLifecycleEvent({
    contract,
    eventType: "participant_subscription_pause_scheduled",
    referenceId: `${input.courseRegistrationIntentId}:${pauseStartDate}:${pauseEndDateInclusive}`,
    payload: {
      pause_window_id: pauseWindow.id,
      pause_start_date: pauseStartDate,
      pause_end_date: pauseEndDateInclusive,
      period_ids: periodIds,
    },
  });

  return { contractId: contract.id, pauseWindowId: pauseWindow.id, periodIds };
}

export async function mirrorCoursePauseToSubscriptionModel(input: {
  courseId: string;
  courseRegistrationIntentIds: string[];
  pauseStartDate: string;
  pauseEndDateInclusive: string;
}): Promise<{ affectedContractIds: string[]; affectedPeriodIds: string[] }> {
  const pauseStartDate = normalizeSubscriptionDateString(input.pauseStartDate);
  const pauseEndDateInclusive = normalizeSubscriptionDateString(input.pauseEndDateInclusive);
  if (!pauseStartDate || !pauseEndDateInclusive || pauseEndDateInclusive < pauseStartDate) {
    return { affectedContractIds: [], affectedPeriodIds: [] };
  }

  const affectedContractIds: string[] = [];
  const affectedPeriodIds: string[] = [];
  for (const intentId of Array.from(new Set(input.courseRegistrationIntentIds))) {
    const contract = await ensureContractForIntent(intentId);
    if (!contract) continue;

    const pauseWindow = await ensurePauseWindow({
      contract,
      scope: {
        scopeType: "course",
        scopeId: input.courseId,
        pauseMode: "course_pause",
      },
      startDate: pauseStartDate,
      endDate: pauseEndDateInclusive,
      source: "course_button",
    });

    for (const serviceMonth of iterateServiceMonths(pauseStartDate, pauseEndDateInclusive)) {
      affectedPeriodIds.push(
        await ensurePausedPeriod({
          contract,
          serviceMonth,
          pauseMode: "course_pause",
          pauseWindowId: pauseWindow.id,
        })
      );
    }

    const status = getContractLifecycleStatusForWindow(pauseStartDate, pauseEndDateInclusive);
    await updateSubscriptionContract(contract.id, {
      status,
      metadata: {
        ...contract.metadata,
        lastCoursePauseWindowId: pauseWindow.id,
      },
    });
    await recordLifecycleEvent({
      contract,
      eventType: "course_subscription_pause_scheduled",
      referenceId: `${input.courseId}:${pauseStartDate}:${pauseEndDateInclusive}`,
      payload: {
        course_id: input.courseId,
        pause_window_id: pauseWindow.id,
        pause_start_date: pauseStartDate,
        pause_end_date: pauseEndDateInclusive,
      },
    });
    affectedContractIds.push(contract.id);
  }

  return { affectedContractIds, affectedPeriodIds };
}

export async function mirrorParticipantCancellationToSubscriptionModel(input: {
  courseRegistrationIntentId: string;
  cancelEffectiveDate: string;
  source: "participant_button" | "course_stop" | "course_fixed_end";
}): Promise<{ contractId: string; affectedPeriodIds: string[]; affectedChargeIds: string[] } | null> {
  const cancelEffectiveDate = normalizeSubscriptionDateString(input.cancelEffectiveDate);
  if (!cancelEffectiveDate) return null;

  const contract = await ensureContractForIntent(input.courseRegistrationIntentId);
  if (!contract) return null;

  const status = getContractLifecycleStatusForCancel(cancelEffectiveDate);
  const updatedContract = await updateSubscriptionContract(contract.id, {
    status,
    cancelEffectiveDate,
    endedAt: status === "cancelled" ? toBerlinEndOfDayIso(cancelEffectiveDate) : contract.endedAt,
    metadata: {
      ...contract.metadata,
      cancelSource: input.source,
      lastCancelEffectiveDate: cancelEffectiveDate,
    },
  });
  const periods = await listSubscriptionPeriodsByContractId(contract.id);
  const charges = await listSubscriptionChargesByContractId(contract.id);
  const affectedPeriodIds: string[] = [];
  const affectedChargeIds: string[] = [];

  for (const period of periods) {
    if (period.periodStart <= cancelEffectiveDate) continue;
    const nextStatus: SubscriptionPeriodStatus = "cancelled";
    const updated = await updateSubscriptionPeriod(period.id, {
      status: nextStatus,
      metadata: {
        ...period.metadata,
        cancelEffectiveDate,
        cancelSource: input.source,
      },
    });
    affectedPeriodIds.push(updated.id);

    for (const charge of charges.filter((item) => item.subscriptionPeriodId === period.id)) {
      if (isTerminalChargeStatus(charge.status)) continue;
      const updatedCharge = await updateSubscriptionCharge(charge.id, {
        status: "cancelled",
        metadata: {
          ...charge.metadata,
          cancelEffectiveDate,
          cancelSource: input.source,
        },
      });
      affectedChargeIds.push(updatedCharge.id);
    }
  }

  await recordLifecycleEvent({
    contract: updatedContract,
    eventType: "subscription_cancel_scheduled",
    referenceId: `${input.courseRegistrationIntentId}:${cancelEffectiveDate}:${input.source}`,
    payload: {
      course_registration_intent_id: input.courseRegistrationIntentId,
      cancel_effective_date: cancelEffectiveDate,
      status,
      affected_period_ids: affectedPeriodIds,
      affected_charge_ids: affectedChargeIds,
    },
  });

  return { contractId: contract.id, affectedPeriodIds, affectedChargeIds };
}

export function getCourseEndDateFromEndsAt(endsAt: string | null | undefined): string | null {
  const normalized = normalizeSubscriptionDateString(endsAt?.slice(0, 10) ?? null);
  return normalized ? getLastDayOfMonth(normalized) : null;
}

export function shouldMaterializeServicePeriodForCourse(input: {
  courseEndsAt: string | null | undefined;
  periodStart: string;
}): boolean {
  const courseEndDate = getCourseEndDateFromEndsAt(input.courseEndsAt);
  return !courseEndDate || input.periodStart <= courseEndDate;
}

export async function mirrorCourseEndToSubscriptionModel(input: {
  courseId: string;
  courseRegistrationIntentIds: string[];
  courseEndDate: string;
  source: "course_stop" | "course_fixed_end";
}): Promise<{ affectedContractIds: string[] }> {
  const courseEndDate = normalizeSubscriptionDateString(input.courseEndDate);
  if (!courseEndDate) return { affectedContractIds: [] };

  const affectedContractIds: string[] = [];
  for (const intentId of Array.from(new Set(input.courseRegistrationIntentIds))) {
    const result = await mirrorParticipantCancellationToSubscriptionModel({
      courseRegistrationIntentId: intentId,
      cancelEffectiveDate: courseEndDate,
      source: input.source,
    });
    if (result?.contractId) affectedContractIds.push(result.contractId);
  }

  return { affectedContractIds };
}

export function normalizeCourseEndDateToBerlinEndIso(value: string | null | undefined): string | null {
  const normalized = normalizeSubscriptionDateString(value);
  if (!normalized) return null;
  return toBerlinEndOfDayIso(getLastDayOfMonth(normalized));
}

export function normalizeCourseEndDateToMonthEnd(value: string | null | undefined): string | null {
  const normalized = normalizeSubscriptionDateString(value);
  if (!normalized) return null;
  return getLastDayOfMonth(normalized);
}

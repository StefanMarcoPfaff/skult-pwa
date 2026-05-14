import {
  SUBSCRIPTION_CHARGE_STATUSES,
  SUBSCRIPTION_CONTRACT_STATUSES,
  SUBSCRIPTION_CREDIT_STATUSES,
  SUBSCRIPTION_PAUSE_WINDOW_STATUSES,
  SUBSCRIPTION_PERIOD_STATUSES,
  type SubscriptionChargeStatus,
  type SubscriptionContractStatus,
  type SubscriptionCreditStatus,
  type SubscriptionPauseWindowStatus,
  type SubscriptionPeriodStatus,
} from "@/lib/payments/subscriptions/types";

const CONTRACT_STATUS_TRANSITIONS: Record<SubscriptionContractStatus, ReadonlySet<SubscriptionContractStatus>> = {
  draft: new Set(["pending_initial_payment", "active", "legacy_external", "cancelled"]),
  pending_initial_payment: new Set(["active", "cancelled", "payment_holding", "legacy_external"]),
  active: new Set(["pause_scheduled", "paused", "cancel_scheduled", "payment_holding", "cancelled", "ended"]),
  pause_scheduled: new Set(["active", "paused", "cancel_scheduled", "cancelled", "ended"]),
  paused: new Set(["active", "cancel_scheduled", "cancelled", "ended"]),
  cancel_scheduled: new Set(["active", "cancelled", "ended"]),
  cancelled: new Set(["ended"]),
  ended: new Set([]),
  payment_holding: new Set(["active", "cancel_scheduled", "cancelled", "ended"]),
  legacy_external: new Set(["active", "pause_scheduled", "paused", "cancel_scheduled", "cancelled", "ended"]),
};

const PERIOD_STATUS_TRANSITIONS: Record<SubscriptionPeriodStatus, ReadonlySet<SubscriptionPeriodStatus>> = {
  planned: new Set(["paused", "charge_pending", "cancelled"]),
  paused: new Set(["planned", "cancelled", "credited"]),
  charge_pending: new Set(["charged", "failed", "cancelled"]),
  charged: new Set(["partially_credited", "credited", "cancelled"]),
  partially_credited: new Set(["credited", "cancelled"]),
  credited: new Set(["cancelled"]),
  failed: new Set(["charge_pending", "cancelled"]),
  cancelled: new Set([]),
};

const CHARGE_STATUS_TRANSITIONS: Record<SubscriptionChargeStatus, ReadonlySet<SubscriptionChargeStatus>> = {
  draft: new Set(["scheduled", "pending_provider", "cancelled"]),
  scheduled: new Set(["pending_provider", "paid", "failed", "cancelled"]),
  pending_provider: new Set(["paid", "failed", "cancelled"]),
  paid: new Set(["refunded", "credited", "cancelled"]),
  failed: new Set(["scheduled", "pending_provider", "cancelled"]),
  refunded: new Set(["credited", "cancelled"]),
  credited: new Set(["cancelled"]),
  cancelled: new Set([]),
};

const PAUSE_WINDOW_STATUS_TRANSITIONS: Record<
  SubscriptionPauseWindowStatus,
  ReadonlySet<SubscriptionPauseWindowStatus>
> = {
  scheduled: new Set(["active", "cancelled", "completed"]),
  active: new Set(["completed", "cancelled"]),
  completed: new Set([]),
  cancelled: new Set([]),
};

const CREDIT_STATUS_TRANSITIONS: Record<SubscriptionCreditStatus, ReadonlySet<SubscriptionCreditStatus>> = {
  available: new Set(["partially_applied", "applied", "expired", "cancelled"]),
  partially_applied: new Set(["partially_applied", "applied", "expired", "cancelled"]),
  applied: new Set([]),
  expired: new Set([]),
  cancelled: new Set([]),
};

export function isSubscriptionContractStatus(value: string | null | undefined): value is SubscriptionContractStatus {
  return SUBSCRIPTION_CONTRACT_STATUSES.includes(value as SubscriptionContractStatus);
}

export function isSubscriptionPeriodStatus(value: string | null | undefined): value is SubscriptionPeriodStatus {
  return SUBSCRIPTION_PERIOD_STATUSES.includes(value as SubscriptionPeriodStatus);
}

export function isSubscriptionChargeStatus(value: string | null | undefined): value is SubscriptionChargeStatus {
  return SUBSCRIPTION_CHARGE_STATUSES.includes(value as SubscriptionChargeStatus);
}

export function isSubscriptionPauseWindowStatus(
  value: string | null | undefined
): value is SubscriptionPauseWindowStatus {
  return SUBSCRIPTION_PAUSE_WINDOW_STATUSES.includes(value as SubscriptionPauseWindowStatus);
}

export function isSubscriptionCreditStatus(value: string | null | undefined): value is SubscriptionCreditStatus {
  return SUBSCRIPTION_CREDIT_STATUSES.includes(value as SubscriptionCreditStatus);
}

export function canTransitionSubscriptionContractStatus(
  current: SubscriptionContractStatus,
  next: SubscriptionContractStatus
): boolean {
  return current === next || CONTRACT_STATUS_TRANSITIONS[current].has(next);
}

export function canTransitionSubscriptionPeriodStatus(
  current: SubscriptionPeriodStatus,
  next: SubscriptionPeriodStatus
): boolean {
  return current === next || PERIOD_STATUS_TRANSITIONS[current].has(next);
}

export function canTransitionSubscriptionChargeStatus(
  current: SubscriptionChargeStatus,
  next: SubscriptionChargeStatus
): boolean {
  return current === next || CHARGE_STATUS_TRANSITIONS[current].has(next);
}

export function canTransitionSubscriptionPauseWindowStatus(
  current: SubscriptionPauseWindowStatus,
  next: SubscriptionPauseWindowStatus
): boolean {
  return current === next || PAUSE_WINDOW_STATUS_TRANSITIONS[current].has(next);
}

export function canTransitionSubscriptionCreditStatus(
  current: SubscriptionCreditStatus,
  next: SubscriptionCreditStatus
): boolean {
  return current === next || CREDIT_STATUS_TRANSITIONS[current].has(next);
}

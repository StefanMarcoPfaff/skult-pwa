export const SUBSCRIPTION_DOMAIN_TIME_ZONE = "Europe/Berlin";

export const SUBSCRIPTION_CONTRACT_STATUSES = [
  "draft",
  "pending_initial_payment",
  "active",
  "pause_scheduled",
  "paused",
  "cancel_scheduled",
  "cancelled",
  "ended",
  "payment_holding",
  "legacy_external",
] as const;
export type SubscriptionContractStatus = (typeof SUBSCRIPTION_CONTRACT_STATUSES)[number];

export const SUBSCRIPTION_PERIOD_STATUSES = [
  "planned",
  "paused",
  "charge_pending",
  "charged",
  "partially_credited",
  "credited",
  "failed",
  "cancelled",
] as const;
export type SubscriptionPeriodStatus = (typeof SUBSCRIPTION_PERIOD_STATUSES)[number];

export const SUBSCRIPTION_CHARGE_STATUSES = [
  "draft",
  "scheduled",
  "pending_provider",
  "paid",
  "failed",
  "refunded",
  "credited",
  "cancelled",
] as const;
export type SubscriptionChargeStatus = (typeof SUBSCRIPTION_CHARGE_STATUSES)[number];

export const SUBSCRIPTION_CHARGE_TYPES = [
  "initial_proration",
  "monthly_recurring",
  "credit",
  "refund_adjustment",
  "manual_adjustment",
] as const;
export type SubscriptionChargeType = (typeof SUBSCRIPTION_CHARGE_TYPES)[number];

export const SUBSCRIPTION_PAUSE_WINDOW_STATUSES = [
  "scheduled",
  "active",
  "completed",
  "cancelled",
] as const;
export type SubscriptionPauseWindowStatus = (typeof SUBSCRIPTION_PAUSE_WINDOW_STATUSES)[number];

export const SUBSCRIPTION_PAUSE_SCOPE_TYPES = ["course", "participant", "contract"] as const;
export type SubscriptionPauseScopeType = (typeof SUBSCRIPTION_PAUSE_SCOPE_TYPES)[number];

export const SUBSCRIPTION_PAUSE_MODES = ["course_pause", "participant_pause"] as const;
export type SubscriptionPauseMode = (typeof SUBSCRIPTION_PAUSE_MODES)[number];

export const SUBSCRIPTION_CREDIT_STATUSES = [
  "available",
  "partially_applied",
  "applied",
  "expired",
  "cancelled",
] as const;
export type SubscriptionCreditStatus = (typeof SUBSCRIPTION_CREDIT_STATUSES)[number];

export const SUBSCRIPTION_CREDIT_ORIGIN_TYPES = [
  "refund",
  "overpayment",
  "manual_adjustment",
  "carry_forward",
] as const;
export type SubscriptionCreditOriginType = (typeof SUBSCRIPTION_CREDIT_ORIGIN_TYPES)[number];

export const SUBSCRIPTION_EVENT_SOURCES = ["system", "stripe", "admin", "migration"] as const;
export type SubscriptionEventSource = (typeof SUBSCRIPTION_EVENT_SOURCES)[number];

export type SubscriptionProvider = string;
export type SubscriptionDateString = string;
export type SubscriptionTimestampString = string;
export type SubscriptionMetadata = Record<string, unknown>;

export type SubscriptionContract = {
  id: string;
  courseRegistrationIntentId: string | null;
  courseId: string;
  teacherId: string;
  customerEmail: string;
  provider: SubscriptionProvider;
  providerSubscriptionId: string | null;
  providerCustomerId: string | null;
  providerMandateId: string | null;
  status: SubscriptionContractStatus;
  intervalUnit: "month";
  intervalCount: number;
  baseAmountCents: number;
  currency: string;
  billingAnchorDay: number;
  nextChargeAt: SubscriptionTimestampString | null;
  startedAt: SubscriptionTimestampString | null;
  endedAt: SubscriptionTimestampString | null;
  cancelEffectiveDate: SubscriptionDateString | null;
  metadata: SubscriptionMetadata;
  createdAt: SubscriptionTimestampString;
  updatedAt: SubscriptionTimestampString;
};

export type SubscriptionPeriod = {
  id: string;
  subscriptionContractId: string;
  periodStart: SubscriptionDateString;
  periodEnd: SubscriptionDateString;
  serviceMonth: SubscriptionDateString;
  status: SubscriptionPeriodStatus;
  plannedChargeAt: SubscriptionTimestampString | null;
  chargedAt: SubscriptionTimestampString | null;
  pauseMode: SubscriptionPauseMode | null;
  metadata: SubscriptionMetadata;
  createdAt: SubscriptionTimestampString;
  updatedAt: SubscriptionTimestampString;
};

export type SubscriptionCharge = {
  id: string;
  subscriptionContractId: string;
  subscriptionPeriodId: string | null;
  paymentTransactionId: string | null;
  provider: SubscriptionProvider;
  providerChargeId: string | null;
  providerInvoiceId: string | null;
  providerPaymentReference: string | null;
  chargeType: SubscriptionChargeType;
  grossAmountCents: number;
  currency: string;
  status: SubscriptionChargeStatus;
  chargedAt: SubscriptionTimestampString | null;
  metadata: SubscriptionMetadata;
  createdAt: SubscriptionTimestampString;
  updatedAt: SubscriptionTimestampString;
};

export type SubscriptionPauseWindow = {
  id: string;
  subscriptionContractId: string | null;
  scopeType: SubscriptionPauseScopeType;
  scopeId: string;
  startDate: SubscriptionDateString;
  endDate: SubscriptionDateString;
  status: SubscriptionPauseWindowStatus;
  metadata: SubscriptionMetadata;
  createdAt: SubscriptionTimestampString;
  updatedAt: SubscriptionTimestampString;
};

export type SubscriptionCredit = {
  id: string;
  subscriptionContractId: string;
  originType: SubscriptionCreditOriginType;
  originId: string | null;
  amountCents: number;
  remainingAmountCents: number;
  currency: string;
  status: SubscriptionCreditStatus;
  metadata: SubscriptionMetadata;
  createdAt: SubscriptionTimestampString;
  updatedAt: SubscriptionTimestampString;
};

export type SubscriptionEvent = {
  id: string;
  subscriptionContractId: string | null;
  subscriptionPeriodId: string | null;
  subscriptionChargeId: string | null;
  eventType: string;
  eventSource: SubscriptionEventSource;
  payload: SubscriptionMetadata;
  createdAt: SubscriptionTimestampString;
};

export type CreateSubscriptionContractInput = {
  courseRegistrationIntentId?: string | null;
  courseId: string;
  teacherId: string;
  customerEmail: string;
  provider: SubscriptionProvider;
  providerSubscriptionId?: string | null;
  providerCustomerId?: string | null;
  providerMandateId?: string | null;
  status?: SubscriptionContractStatus;
  intervalCount?: number;
  baseAmountCents: number;
  currency: string;
  billingAnchorDay?: number;
  nextChargeAt?: SubscriptionTimestampString | null;
  startedAt?: SubscriptionTimestampString | null;
  endedAt?: SubscriptionTimestampString | null;
  cancelEffectiveDate?: SubscriptionDateString | null;
  metadata?: SubscriptionMetadata;
};

export type CreateSubscriptionPeriodInput = {
  subscriptionContractId: string;
  periodStart: SubscriptionDateString;
  periodEnd: SubscriptionDateString;
  serviceMonth: SubscriptionDateString;
  status?: SubscriptionPeriodStatus;
  plannedChargeAt?: SubscriptionTimestampString | null;
  chargedAt?: SubscriptionTimestampString | null;
  pauseMode?: SubscriptionPauseMode | null;
  metadata?: SubscriptionMetadata;
};

export type CreateSubscriptionChargeInput = {
  subscriptionContractId: string;
  subscriptionPeriodId?: string | null;
  paymentTransactionId?: string | null;
  provider: SubscriptionProvider;
  providerChargeId?: string | null;
  providerInvoiceId?: string | null;
  providerPaymentReference?: string | null;
  chargeType: SubscriptionChargeType;
  grossAmountCents: number;
  currency: string;
  status?: SubscriptionChargeStatus;
  chargedAt?: SubscriptionTimestampString | null;
  metadata?: SubscriptionMetadata;
};

export type CreateSubscriptionPauseWindowInput = {
  subscriptionContractId?: string | null;
  scopeType: SubscriptionPauseScopeType;
  scopeId: string;
  startDate: SubscriptionDateString;
  endDate: SubscriptionDateString;
  status?: SubscriptionPauseWindowStatus;
  metadata?: SubscriptionMetadata;
};

export type CreateSubscriptionCreditInput = {
  subscriptionContractId: string;
  originType: SubscriptionCreditOriginType;
  originId?: string | null;
  amountCents: number;
  remainingAmountCents: number;
  currency: string;
  status?: SubscriptionCreditStatus;
  metadata?: SubscriptionMetadata;
};

export type CreateSubscriptionEventInput = {
  subscriptionContractId?: string | null;
  subscriptionPeriodId?: string | null;
  subscriptionChargeId?: string | null;
  eventType: string;
  eventSource: SubscriptionEventSource;
  payload?: SubscriptionMetadata;
};

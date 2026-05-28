import "server-only";

import { ensureCustomerReceiptForPayment } from "@/lib/documents/simulation-documents";
import {
  calculatePlatformFeeCents,
  calculateProviderPayoutCents,
  getPlatformFeeConfigForProvider,
} from "@/lib/platform-fees";
import {
  planMonthlyRecurringCharge,
  toCreateSubscriptionChargeInput,
} from "@/lib/payments/subscriptions/charge-planner";
import { findSubscriptionChargeById, createSubscriptionCharge, listSubscriptionChargesByContractId, updateSubscriptionCharge } from "@/lib/payments/subscriptions/charges-repo";
import { findSubscriptionContractById, updateSubscriptionContract } from "@/lib/payments/subscriptions/contracts-repo";
import {
  getFirstDayOfMonth,
  getFirstDayOfNextMonth,
  getLastDayOfMonth,
  normalizeSubscriptionDateString,
  resolveBillingAnchorDateForMonth,
  toBerlinStartOfDayIso,
} from "@/lib/payments/subscriptions/dates";
import { createSubscriptionEvent, listSubscriptionEventsByContractId } from "@/lib/payments/subscriptions/events-repo";
import { planNextSubscriptionPeriod, toCreateSubscriptionPeriodInput } from "@/lib/payments/subscriptions/period-planner";
import { listSubscriptionPauseWindowsByContractId, listSubscriptionPauseWindowsByScope } from "@/lib/payments/subscriptions/pause-windows-repo";
import {
  createSubscriptionPeriod,
  findSubscriptionPeriodByServiceMonth,
  updateSubscriptionPeriod,
} from "@/lib/payments/subscriptions/periods-repo";
import type {
  SubscriptionCharge,
  SubscriptionContract,
  SubscriptionEvent,
  SubscriptionPauseWindow,
  SubscriptionPeriod,
} from "@/lib/payments/subscriptions/types";
import { assertSimulationTargetId, buildSimulationMetadata, createSimulatedPaymentId } from "@/lib/payments/simulation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const INTERNAL_SIMULATION_PROVIDER = "internal_simulation";

type ProviderPayoutProfileRow = {
  id: string;
};

type PaymentTransactionRow = {
  id: string;
};

type LedgerEntryRow = {
  id: string;
};

type ParticipantIntentRecurringRow = {
  id: string;
  subscription_status: string | null;
  subscription_pause_start_date: string | null;
  subscription_pause_end_date: string | null;
  subscription_stop_date: string | null;
};

type RecurringSimulationResult = {
  subscriptionContractId: string;
  courseRegistrationIntentId: string | null;
  subscriptionPeriodId: string | null;
  subscriptionChargeId: string | null;
  paymentTransactionId: string | null;
  ledgerEntryId: string | null;
  customerReceiptDocumentId: string | null;
  customerReceiptPdfPath: string | null;
  customerReceiptPdfGenerated: boolean;
  customerReceiptPdfWarning: string | null;
  skippedReason: "pause" | "contract_ended" | "participant_pause" | "participant_ended" | null;
  simulationMetadata: ReturnType<typeof buildSimulationMetadata>;
};

type ExistingRecurringSimulation = {
  period: SubscriptionPeriod;
  charge: SubscriptionCharge;
  paymentTransactionId: string | null;
  ledgerEntryId: string | null;
};

function normalizeCurrency(currency: string | null | undefined): string {
  return (currency ?? "EUR").trim().toUpperCase() || "EUR";
}

function normalizeAmount(amountCents: number | null | undefined, fallbackAmountCents: number): number {
  if (typeof amountCents === "number" && Number.isFinite(amountCents)) {
    return Math.max(0, Math.round(amountCents));
  }

  return Math.max(0, Math.round(fallbackAmountCents));
}

function normalizePaidAt(value: string | null | undefined): string {
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  if (Number.isFinite(timestamp)) {
    return new Date(timestamp).toISOString();
  }

  return new Date().toISOString();
}

function normalizeTargetServiceMonth(input: string | null | undefined, fallbackTimestamp: string | null | undefined): string {
  const trimmed = input?.trim() ?? "";
  if (trimmed) {
    const normalized = normalizeSubscriptionDateString(`${trimmed}-01`);
    if (normalized) {
      return getFirstDayOfMonth(normalized);
    }
  }

  if (fallbackTimestamp) {
    const asDate = new Date(fallbackTimestamp);
    if (Number.isFinite(asDate.getTime())) {
      return `${asDate.getUTCFullYear()}-${String(asDate.getUTCMonth() + 1).padStart(2, "0")}-01`;
    }
  }

  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function monthRange(serviceMonth: string) {
  const start = getFirstDayOfMonth(serviceMonth);
  const end = getLastDayOfMonth(serviceMonth);
  return { start, end };
}

function getPreviousServiceMonth(serviceMonth: string): string {
  const [yearRaw, monthRaw] = serviceMonth.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid target service month: ${serviceMonth}`);
  }

  if (month === 1) {
    return `${year - 1}-12-01`;
  }

  return `${year}-${String(month - 1).padStart(2, "0")}-01`;
}

function isContractAllowedForRecurringSimulation(contract: SubscriptionContract): boolean {
  return ["active", "pause_scheduled", "paused", "cancel_scheduled", "cancelled"].includes(contract.status);
}

function isFullyCoveredByPauseWindow(window: SubscriptionPauseWindow, monthStart: string, monthEnd: string): boolean {
  if (!["scheduled", "active"].includes(window.status)) {
    return false;
  }

  return window.startDate <= monthStart && window.endDate >= monthEnd;
}

function isContractEndedBeforeMonth(contract: SubscriptionContract, monthStart: string): boolean {
  const endedDate = contract.endedAt ? new Date(contract.endedAt).toISOString().slice(0, 10) : null;
  if (endedDate && endedDate < monthStart) {
    return true;
  }

  if (contract.cancelEffectiveDate && contract.cancelEffectiveDate < monthStart) {
    return true;
  }

  return false;
}

function isContractEndedForTargetMonth(contract: SubscriptionContract, monthStart: string, monthEnd: string): boolean {
  if (contract.status === "cancelled" || contract.status === "ended") {
    if (!contract.cancelEffectiveDate) {
      return true;
    }

    return contract.cancelEffectiveDate < monthEnd;
  }

  return isContractEndedBeforeMonth(contract, monthStart);
}

async function ensureSimulationEvent(input: {
  events: SubscriptionEvent[];
  contractId: string;
  eventType: string;
  periodId?: string | null;
  chargeId?: string | null;
  simulationMetadata: ReturnType<typeof buildSimulationMetadata>;
  referenceId: string;
}) {
  const existing = input.events.find(
    (event) =>
      event.eventType === input.eventType &&
      event.subscriptionContractId === input.contractId &&
      (event.subscriptionPeriodId ?? null) === (input.periodId ?? null) &&
      (event.subscriptionChargeId ?? null) === (input.chargeId ?? null)
  );

  if (existing) {
    return existing;
  }

  const created = await createSubscriptionEvent({
    subscriptionContractId: input.contractId,
    subscriptionPeriodId: input.periodId ?? null,
    subscriptionChargeId: input.chargeId ?? null,
    eventType: input.eventType,
    eventSource: "admin",
    payload: {
      simulation: true,
      triggered_by_admin_user_id: input.simulationMetadata.triggered_by_admin_user_id,
      triggered_at: input.simulationMetadata.triggered_at,
      scenario: input.simulationMetadata.scenario,
      source_admin_ui: input.simulationMetadata.source_admin_ui,
      reference_id: input.referenceId,
    },
  });
  input.events.push(created);
  return created;
}

async function ensureRecurringPeriod(input: {
  contract: SubscriptionContract;
  serviceMonth: string;
  paidAt: string;
  paused: boolean;
  simulationMetadata: ReturnType<typeof buildSimulationMetadata>;
}): Promise<SubscriptionPeriod> {
  const existing = await findSubscriptionPeriodByServiceMonth({
    subscriptionContractId: input.contract.id,
    serviceMonth: input.serviceMonth,
  });
  const previousServiceMonth = getPreviousServiceMonth(input.serviceMonth);
  const planned = planNextSubscriptionPeriod({
    previousServiceMonth,
    billingAnchorDay: input.contract.billingAnchorDay,
  });
  const metadata = {
    ...(existing?.metadata ?? {}),
    simulation: true,
    scenario: input.simulationMetadata.scenario,
    sourceAdminUi: input.simulationMetadata.source_admin_ui,
  };

  if (existing) {
    if (input.paused) {
      if (existing.status === "paused") {
        return existing;
      }

      return updateSubscriptionPeriod(existing.id, {
        status: "paused",
        plannedChargeAt: planned.plannedChargeAt,
        chargedAt: null,
        pauseMode: "course_pause",
        metadata,
      });
    }

    if (
      existing.status === "charged" &&
      existing.chargedAt === input.paidAt &&
      existing.plannedChargeAt === planned.plannedChargeAt
    ) {
      return existing;
    }

    return updateSubscriptionPeriod(existing.id, {
      status: "charged",
      plannedChargeAt: planned.plannedChargeAt,
      chargedAt: input.paidAt,
      pauseMode: null,
      metadata,
    });
  }

  const createInput = toCreateSubscriptionPeriodInput(input.contract.id, planned);
  return createSubscriptionPeriod({
    ...createInput,
    status: input.paused ? "paused" : "charged",
    chargedAt: input.paused ? null : input.paidAt,
    pauseMode: input.paused ? "course_pause" : null,
    metadata,
  });
}

async function ensureRecurringCharge(input: {
  contract: SubscriptionContract;
  period: SubscriptionPeriod;
  amountCents: number;
  currency: string;
  providerPaymentReference: string;
  paidAt: string;
  simulationMetadata: ReturnType<typeof buildSimulationMetadata>;
}): Promise<SubscriptionCharge> {
  const plannedCharge = planMonthlyRecurringCharge({
    monthlyAmountCents: input.amountCents,
    currency: input.currency,
    serviceMonth: input.period.serviceMonth,
    periodStart: input.period.periodStart,
    periodEnd: input.period.periodEnd,
  });
  const existing = (await listSubscriptionChargesByContractId(input.contract.id)).find(
    (charge) =>
      charge.provider === INTERNAL_SIMULATION_PROVIDER &&
      charge.subscriptionPeriodId === input.period.id &&
      charge.chargeType === "monthly_recurring"
  );
  const metadata = {
    ...(existing?.metadata ?? {}),
    ...plannedCharge.metadata,
    simulation: true,
    scenario: input.simulationMetadata.scenario,
    sourceAdminUi: input.simulationMetadata.source_admin_ui,
  };

  if (existing) {
    if (
      existing.status === "paid" &&
      existing.grossAmountCents === input.amountCents &&
      existing.currency === input.currency &&
      existing.chargedAt === input.paidAt
    ) {
      return existing;
    }

    return updateSubscriptionCharge(existing.id, {
      provider: INTERNAL_SIMULATION_PROVIDER,
      providerPaymentReference: existing.providerPaymentReference ?? input.providerPaymentReference,
      grossAmountCents: input.amountCents,
      currency: input.currency,
      status: "paid",
      chargedAt: input.paidAt,
      metadata,
    });
  }

  const createInput = toCreateSubscriptionChargeInput({
    subscriptionContractId: input.contract.id,
    subscriptionPeriodId: input.period.id,
    provider: INTERNAL_SIMULATION_PROVIDER,
    plannedCharge,
  });

  return createSubscriptionCharge({
    ...createInput,
    providerPaymentReference: input.providerPaymentReference,
    grossAmountCents: input.amountCents,
    currency: input.currency,
    status: "paid",
    chargedAt: input.paidAt,
    metadata,
  });
}

async function ensurePaymentTransaction(input: {
  contractId: string;
  chargeId: string;
  providerPaymentId: string;
  amountCents: number;
  currency: string;
  paidAt: string;
}): Promise<string> {
  const admin = createSupabaseAdmin();
  const { data: existing } = await admin
    .from("payment_transactions")
    .select("id")
    .eq("provider", INTERNAL_SIMULATION_PROVIDER)
    .eq("subscription_contract_id", input.contractId)
    .eq("subscription_charge_id", input.chargeId)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<PaymentTransactionRow>();

  if (existing?.id) {
    return existing.id;
  }

  const { data: inserted } = await admin
    .from("payment_transactions")
    .insert({
      booking_id: null,
      course_registration_intent_id: null,
      provider: INTERNAL_SIMULATION_PROVIDER,
      provider_payment_id: input.providerPaymentId,
      provider_checkout_id: null,
      provider_customer_id: null,
      provider_subscription_id: null,
      amount_cents: input.amountCents,
      currency: input.currency,
      payment_method: "internal_simulation",
      status: "paid",
      paid_at: input.paidAt,
      failed_at: null,
      refunded_at: null,
      subscription_contract_id: input.contractId,
      subscription_charge_id: input.chargeId,
    })
    .select("id")
    .single<{ id: string }>();

  if (!inserted?.id) {
    throw new Error("Failed to create simulated recurring payment transaction");
  }

  return inserted.id;
}

async function ensureLedgerEntry(input: {
  paymentTransactionId: string;
  contractId: string;
  chargeId: string;
  providerPayoutProfileId: string | null;
  period: SubscriptionPeriod;
  amountCents: number;
  currency: string;
  platformFeePercent: number;
  paidAt: string;
}): Promise<string> {
  const admin = createSupabaseAdmin();
  const { data: existing } = await admin
    .from("ledger_entries")
    .select("id")
    .eq("source_type", "payment_transaction")
    .eq("source_id", input.paymentTransactionId)
    .eq("entry_type", "payment")
    .maybeSingle<LedgerEntryRow>();

  if (existing?.id) {
    return existing.id;
  }

  const platformFeeCents = calculatePlatformFeeCents(input.amountCents, input.platformFeePercent);
  const netAmountCents = calculateProviderPayoutCents(input.amountCents, input.platformFeePercent);
  const { data: inserted } = await admin
    .from("ledger_entries")
    .insert({
      provider_payout_profile_id: input.providerPayoutProfileId,
      source_type: "payment_transaction",
      source_id: input.paymentTransactionId,
      entry_type: "payment",
      gross_amount_cents: input.amountCents,
      platform_fee_cents: platformFeeCents,
      provider_fee_cents: 0,
      net_amount_cents: netAmountCents,
      currency: input.currency,
      payout_status: "pending",
      available_at: input.paidAt,
      subscription_contract_id: input.contractId,
      subscription_charge_id: input.chargeId,
      service_period_start: input.period.periodStart,
      service_period_end: input.period.periodEnd,
    })
    .select("id")
    .single<{ id: string }>();

  if (!inserted?.id) {
    throw new Error("Failed to create simulated recurring ledger entry");
  }

  return inserted.id;
}

async function linkChargeToPaymentTransaction(chargeId: string, paymentTransactionId: string): Promise<SubscriptionCharge> {
  const charge = await findSubscriptionChargeById(chargeId);
  if (!charge) {
    throw new Error(`Subscription charge not found: ${chargeId}`);
  }

  if (charge.paymentTransactionId === paymentTransactionId) {
    return charge;
  }

  return updateSubscriptionCharge(chargeId, {
    paymentTransactionId,
  });
}

async function loadRelevantPauseWindows(contract: SubscriptionContract): Promise<SubscriptionPauseWindow[]> {
  const [byContract, byCourse] = await Promise.all([
    listSubscriptionPauseWindowsByContractId(contract.id),
    listSubscriptionPauseWindowsByScope({
      scopeType: "course",
      scopeId: contract.courseId,
    }),
  ]);

  return [...byContract, ...byCourse];
}

async function loadParticipantPauseWindows(contract: SubscriptionContract): Promise<SubscriptionPauseWindow[]> {
  if (!contract.courseRegistrationIntentId) {
    return [];
  }

  return listSubscriptionPauseWindowsByScope({
    scopeType: "participant",
    scopeId: contract.courseRegistrationIntentId,
  });
}

async function loadParticipantIntent(contract: SubscriptionContract): Promise<ParticipantIntentRecurringRow | null> {
  if (!contract.courseRegistrationIntentId) {
    return null;
  }

  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("course_registration_intents")
    .select("id,subscription_status,subscription_pause_start_date,subscription_pause_end_date,subscription_stop_date")
    .eq("id", contract.courseRegistrationIntentId)
    .maybeSingle<ParticipantIntentRecurringRow>();

  return data ?? null;
}

async function findExistingRecurringSimulation(input: {
  contractId: string;
  serviceMonth: string;
}): Promise<ExistingRecurringSimulation | null> {
  const period = await findSubscriptionPeriodByServiceMonth({
    subscriptionContractId: input.contractId,
    serviceMonth: input.serviceMonth,
  });

  if (!period) {
    return null;
  }

  const charge = (await listSubscriptionChargesByContractId(input.contractId)).find(
    (item) =>
      item.subscriptionPeriodId === period.id &&
      item.provider === INTERNAL_SIMULATION_PROVIDER &&
      item.chargeType === "monthly_recurring" &&
      item.status === "paid"
  );

  if (!charge) {
    return null;
  }

  const admin = createSupabaseAdmin();
  const paymentTransactionId = charge.paymentTransactionId ?? null;
  let ledgerEntryId: string | null = null;

  if (paymentTransactionId) {
    const { data: ledgerEntry } = await admin
      .from("ledger_entries")
      .select("id")
      .eq("source_type", "payment_transaction")
      .eq("source_id", paymentTransactionId)
      .eq("entry_type", "payment")
      .maybeSingle<LedgerEntryRow>();

    ledgerEntryId = ledgerEntry?.id ?? null;
  }

  return {
    period,
    charge,
    paymentTransactionId,
    ledgerEntryId,
  };
}

export async function simulateSubscriptionRecurringPayment(input: {
  subscriptionContractId: string;
  adminUserId: string;
  targetMonth?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  paidAt?: string | null;
  scenarioNote?: string | null;
}): Promise<RecurringSimulationResult> {
  const subscriptionContractId = assertSimulationTargetId(input.subscriptionContractId);
  const paidAt = normalizePaidAt(input.paidAt);
  const simulationMetadata = buildSimulationMetadata({
    triggeredByAdminUserId: input.adminUserId,
    triggeredAt: paidAt,
    scenario: input.scenarioNote?.trim()
      ? `subscription_recurring_payment:${input.scenarioNote.trim()}`
      : "subscription_recurring_payment",
    sourceAdminUi: "/dashboard/admin/payments-v2/subscriptions",
  });

  const contract = await findSubscriptionContractById(subscriptionContractId);
  if (!contract) {
    throw new Error("Subscription contract not found");
  }

  if (!isContractAllowedForRecurringSimulation(contract)) {
    throw new Error(`Subscription contract status not allowed for recurring simulation: ${contract.status}`);
  }

  const targetServiceMonth = normalizeTargetServiceMonth(input.targetMonth, contract.nextChargeAt ?? paidAt);
  const { start: monthStart, end: monthEnd } = monthRange(targetServiceMonth);
  const events = await listSubscriptionEventsByContractId(contract.id);
  const existingSimulation = await findExistingRecurringSimulation({
    contractId: contract.id,
    serviceMonth: targetServiceMonth,
  });

  if (existingSimulation) {
    const customerReceipt =
      existingSimulation.paymentTransactionId
        ? await ensureCustomerReceiptForPayment({
            paymentTransactionId: existingSimulation.paymentTransactionId,
            supabase: createSupabaseAdmin(),
          })
        : null;

    return {
      subscriptionContractId: contract.id,
      courseRegistrationIntentId: contract.courseRegistrationIntentId,
      subscriptionPeriodId: existingSimulation.period.id,
      subscriptionChargeId: existingSimulation.charge.id,
      paymentTransactionId: existingSimulation.paymentTransactionId,
      ledgerEntryId: existingSimulation.ledgerEntryId,
      customerReceiptDocumentId: customerReceipt?.documentId ?? null,
      customerReceiptPdfPath: customerReceipt?.pdfPath ?? null,
      customerReceiptPdfGenerated: customerReceipt?.pdfGenerated ?? false,
      customerReceiptPdfWarning: customerReceipt?.pdfWarning ?? null,
      skippedReason: null,
      simulationMetadata,
    };
  }

  if (isContractEndedForTargetMonth(contract, monthStart, monthEnd)) {
    await ensureSimulationEvent({
      events,
      contractId: contract.id,
      eventType: "recurring_charge_skipped_contract_ended",
      simulationMetadata,
      referenceId: targetServiceMonth,
    });

    return {
      subscriptionContractId: contract.id,
      courseRegistrationIntentId: contract.courseRegistrationIntentId,
      subscriptionPeriodId: null,
      subscriptionChargeId: null,
      paymentTransactionId: null,
      ledgerEntryId: null,
      customerReceiptDocumentId: null,
      customerReceiptPdfPath: null,
      customerReceiptPdfGenerated: false,
      customerReceiptPdfWarning: null,
      skippedReason: "contract_ended",
      simulationMetadata,
    };
  }

  const pauseWindows = await loadRelevantPauseWindows(contract);
  const pauseWindow = pauseWindows.find((window) => isFullyCoveredByPauseWindow(window, monthStart, monthEnd)) ?? null;
  if (pauseWindow) {
    const period = await ensureRecurringPeriod({
      contract,
      serviceMonth: targetServiceMonth,
      paidAt,
      paused: true,
      simulationMetadata,
    });

    await ensureSimulationEvent({
      events,
      contractId: contract.id,
      eventType: "recurring_charge_skipped_due_to_pause",
      periodId: period.id,
      simulationMetadata,
      referenceId: pauseWindow.id,
    });

    const nextServiceMonth = getFirstDayOfNextMonth(targetServiceMonth);
    await updateSubscriptionContract(contract.id, {
      nextChargeAt: toBerlinStartOfDayIso(resolveBillingAnchorDateForMonth(nextServiceMonth, contract.billingAnchorDay)),
    });

    return {
      subscriptionContractId: contract.id,
      courseRegistrationIntentId: contract.courseRegistrationIntentId,
      subscriptionPeriodId: period.id,
      subscriptionChargeId: null,
      paymentTransactionId: null,
      ledgerEntryId: null,
      customerReceiptDocumentId: null,
      customerReceiptPdfPath: null,
      customerReceiptPdfGenerated: false,
      customerReceiptPdfWarning: null,
      skippedReason: "pause",
      simulationMetadata,
    };
  }

  const participantIntent = await loadParticipantIntent(contract);
  const participantPauseWindows = await loadParticipantPauseWindows(contract);
  const participantPauseWindow =
    participantPauseWindows.find((window) => isFullyCoveredByPauseWindow(window, monthStart, monthEnd)) ?? null;
  const participantPauseFromIntent =
    participantIntent &&
    ["paused", "pause_scheduled"].includes(participantIntent.subscription_status ?? "") &&
    participantIntent.subscription_pause_start_date &&
    participantIntent.subscription_pause_end_date &&
    participantIntent.subscription_pause_start_date <= monthStart &&
    participantIntent.subscription_pause_end_date >= monthEnd;
  if (participantPauseWindow || participantPauseFromIntent) {
    await ensureSimulationEvent({
      events,
      contractId: contract.id,
      eventType: "recurring_charge_skipped_due_to_participant_pause",
      simulationMetadata,
      referenceId: participantPauseWindow?.id ?? `${participantIntent?.id ?? contract.id}:${monthStart}`,
    });

    return {
      subscriptionContractId: contract.id,
      courseRegistrationIntentId: contract.courseRegistrationIntentId,
      subscriptionPeriodId: null,
      subscriptionChargeId: null,
      paymentTransactionId: null,
      ledgerEntryId: null,
      customerReceiptDocumentId: null,
      customerReceiptPdfPath: null,
      customerReceiptPdfGenerated: false,
      customerReceiptPdfWarning: null,
      skippedReason: "participant_pause",
      simulationMetadata,
    };
  }

  if (participantIntent?.subscription_stop_date && participantIntent.subscription_stop_date < monthEnd) {
    await ensureSimulationEvent({
      events,
      contractId: contract.id,
      eventType: "recurring_charge_skipped_due_to_participant_end",
      simulationMetadata,
      referenceId: participantIntent.subscription_stop_date,
    });

    return {
      subscriptionContractId: contract.id,
      courseRegistrationIntentId: contract.courseRegistrationIntentId,
      subscriptionPeriodId: null,
      subscriptionChargeId: null,
      paymentTransactionId: null,
      ledgerEntryId: null,
      customerReceiptDocumentId: null,
      customerReceiptPdfPath: null,
      customerReceiptPdfGenerated: false,
      customerReceiptPdfWarning: null,
      skippedReason: "participant_ended",
      simulationMetadata,
    };
  }

  const admin = createSupabaseAdmin();
  const { data: providerPayoutProfile } = await admin
      .from("provider_payout_profiles")
      .select("id")
      .eq("teacher_id", contract.teacherId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<ProviderPayoutProfileRow>();
  const platformFeeConfig = await getPlatformFeeConfigForProvider(admin, contract.teacherId);

  const amountCents = normalizeAmount(input.amountCents, contract.baseAmountCents);
  const currency = normalizeCurrency(input.currency ?? contract.currency);
  const period = await ensureRecurringPeriod({
    contract,
    serviceMonth: targetServiceMonth,
    paidAt,
    paused: false,
    simulationMetadata,
  });

  const providerPaymentReference = createSimulatedPaymentId();
  const charge = await ensureRecurringCharge({
    contract,
    period,
    amountCents,
    currency,
    providerPaymentReference,
    paidAt,
    simulationMetadata,
  });
  const paymentTransactionId = await ensurePaymentTransaction({
    contractId: contract.id,
    chargeId: charge.id,
    providerPaymentId: providerPaymentReference,
    amountCents,
    currency,
    paidAt,
  });
  await linkChargeToPaymentTransaction(charge.id, paymentTransactionId);
  const ledgerEntryId = await ensureLedgerEntry({
    paymentTransactionId,
    contractId: contract.id,
    chargeId: charge.id,
    providerPayoutProfileId: providerPayoutProfile?.id ?? null,
    period,
    amountCents,
    currency,
    platformFeePercent: platformFeeConfig.platformFeePercent,
    paidAt,
  });

  const nextServiceMonth = getFirstDayOfNextMonth(targetServiceMonth);
  await updateSubscriptionContract(contract.id, {
    nextChargeAt: toBerlinStartOfDayIso(resolveBillingAnchorDateForMonth(nextServiceMonth, contract.billingAnchorDay)),
  });

  await ensureSimulationEvent({
    events,
    contractId: contract.id,
    eventType: "recurring_period_created",
    periodId: period.id,
    simulationMetadata,
    referenceId: period.id,
  });
  await ensureSimulationEvent({
    events,
    contractId: contract.id,
    eventType: "recurring_charge_recorded",
    periodId: period.id,
    chargeId: charge.id,
    simulationMetadata,
    referenceId: charge.id,
  });
  await ensureSimulationEvent({
    events,
    contractId: contract.id,
    eventType: "recurring_payment_simulated",
    chargeId: charge.id,
    simulationMetadata,
    referenceId: paymentTransactionId,
  });

  const customerReceipt = await ensureCustomerReceiptForPayment({
    paymentTransactionId,
    supabase: admin,
  });

  return {
    subscriptionContractId: contract.id,
    courseRegistrationIntentId: contract.courseRegistrationIntentId,
    subscriptionPeriodId: period.id,
    subscriptionChargeId: charge.id,
    paymentTransactionId,
    ledgerEntryId,
    customerReceiptDocumentId: customerReceipt.documentId,
    customerReceiptPdfPath: customerReceipt.pdfPath,
    customerReceiptPdfGenerated: customerReceipt.pdfGenerated,
    customerReceiptPdfWarning: customerReceipt.pdfWarning,
    skippedReason: null,
    simulationMetadata,
  };
}

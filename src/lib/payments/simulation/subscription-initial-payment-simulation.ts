import "server-only";

import { calculatePlatformFeeAmount, calculateProviderPayoutAmount } from "@/lib/platform-fees";
import {
  planInitialProrationCharge,
  planMonthlyRecurringCharge,
  toCreateSubscriptionChargeInput,
  type PlannedSubscriptionCharge,
} from "@/lib/payments/subscriptions/charge-planner";
import {
  createSubscriptionCharge,
  findSubscriptionChargeById,
  listSubscriptionChargesByContractId,
  updateSubscriptionCharge,
} from "@/lib/payments/subscriptions/charges-repo";
import {
  createPendingInitialPaymentContract,
  activateContractForSuccessfulInitialPayment,
} from "@/lib/payments/subscriptions/contracts-service";
import {
  findSubscriptionContractById,
  findSubscriptionContractByIntentId,
} from "@/lib/payments/subscriptions/contracts-repo";
import { getBerlinTodayDate } from "@/lib/payments/subscriptions/dates";
import {
  createSubscriptionEvent,
  listSubscriptionEventsByContractId,
} from "@/lib/payments/subscriptions/events-repo";
import {
  planInitialSubscriptionPeriod,
  planNextSubscriptionPeriod,
  toCreateSubscriptionPeriodInput,
} from "@/lib/payments/subscriptions/period-planner";
import {
  createSubscriptionPeriod,
  findSubscriptionPeriodByServiceMonth,
  updateSubscriptionPeriod,
} from "@/lib/payments/subscriptions/periods-repo";
import type {
  SubscriptionCharge,
  SubscriptionContract,
  SubscriptionEvent,
  SubscriptionPeriod,
} from "@/lib/payments/subscriptions/types";
import {
  assertSimulationTargetId,
  buildSimulationMetadata,
  createSimulatedEventId,
  createSimulatedPaymentId,
} from "@/lib/payments/simulation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const INTERNAL_SIMULATION_PROVIDER = "internal_simulation";

type CourseRegistrationIntentRow = {
  id: string;
  course_id: string;
  email: string;
  status: string;
  subscription_status: string | null;
  subscription_contract_id: string | null;
};

type CourseRow = {
  id: string;
  teacher_id: string | null;
  price_cents: number | null;
  currency: string | null;
};

type ProfileRow = {
  provider_type: "independent_teacher" | "studio_provider" | null;
};

type ProviderPayoutProfileRow = {
  id: string;
};

type PaymentTransactionRow = {
  id: string;
  subscription_charge_id: string | null;
};

type LedgerEntryRow = {
  id: string;
};

type SubscriptionSimulationResult = {
  courseRegistrationIntentId: string;
  subscriptionContractId: string;
  subscriptionPeriodId: string;
  subscriptionChargeId: string;
  paymentTransactionId: string;
  ledgerEntryId: string;
  simulationMetadata: ReturnType<typeof buildSimulationMetadata>;
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

function resolveContractStartDate(paidAt: string): string {
  return getBerlinTodayDate(new Date(paidAt));
}

function selectInitialChargePlan(input: {
  actualAmountCents: number;
  monthlyAmountCents: number;
  currency: string;
  contractStartDate: string;
  period: SubscriptionPeriod;
}): PlannedSubscriptionCharge {
  const prorationCharge = planInitialProrationCharge({
    monthlyAmountCents: input.monthlyAmountCents,
    contractStartDate: input.contractStartDate,
    currency: input.currency,
  });
  const monthlyRecurringCharge = planMonthlyRecurringCharge({
    monthlyAmountCents: input.monthlyAmountCents,
    currency: input.currency,
    serviceMonth: input.period.serviceMonth,
    periodStart: input.period.periodStart,
    periodEnd: input.period.periodEnd,
  });

  if (input.actualAmountCents === monthlyRecurringCharge.grossAmountCents) {
    return monthlyRecurringCharge;
  }

  if (input.actualAmountCents === prorationCharge.grossAmountCents) {
    return prorationCharge;
  }

  if (input.actualAmountCents < monthlyRecurringCharge.grossAmountCents) {
    return prorationCharge;
  }

  return monthlyRecurringCharge;
}

async function ensureSubscriptionContract(input: {
  intent: CourseRegistrationIntentRow;
  course: CourseRow;
  providerSubscriptionId: string;
  paidAt: string;
  simulationMetadata: ReturnType<typeof buildSimulationMetadata>;
}): Promise<SubscriptionContract> {
  const admin = createSupabaseAdmin();
  const existingById = input.intent.subscription_contract_id
    ? await findSubscriptionContractById(input.intent.subscription_contract_id)
    : null;
  const existingByIntent = existingById ?? (await findSubscriptionContractByIntentId(input.intent.id));

  const contract =
    existingByIntent ??
    (await createPendingInitialPaymentContract({
      courseRegistrationIntentId: input.intent.id,
      courseId: input.course.id,
      teacherId: input.course.teacher_id!,
      customerEmail: input.intent.email,
      provider: INTERNAL_SIMULATION_PROVIDER,
      providerSubscriptionId: input.providerSubscriptionId,
      baseAmountCents: input.course.price_cents ?? 0,
      currency: normalizeCurrency(input.course.currency),
      billingAnchorDay: 1,
      metadata: {
        simulation: true,
        sourceAdminUi: input.simulationMetadata.source_admin_ui,
        triggeredByAdminUserId: input.simulationMetadata.triggered_by_admin_user_id,
        scenario: input.simulationMetadata.scenario,
      },
    }));

  if (!input.intent.subscription_contract_id) {
    await admin
      .from("course_registration_intents")
      .update({
        subscription_contract_id: contract.id,
      })
      .eq("id", input.intent.id)
      .is("subscription_contract_id", null);
  }

  const contractStartDate = resolveContractStartDate(input.paidAt);
  const initialPeriodPlan = planInitialSubscriptionPeriod({
    contractStartDate,
    billingAnchorDay: contract.billingAnchorDay,
  });
  const nextPeriodPlan = planNextSubscriptionPeriod({
    previousServiceMonth: initialPeriodPlan.serviceMonth,
    billingAnchorDay: contract.billingAnchorDay,
  });

  return activateContractForSuccessfulInitialPayment({
    contractId: contract.id,
    startedAt: input.paidAt,
    firstPaidAt: input.paidAt,
    nextChargeAt: nextPeriodPlan.plannedChargeAt,
    providerSubscriptionId: contract.providerSubscriptionId ?? input.providerSubscriptionId,
    metadata: {
      simulation: true,
      simulatedInitialPaymentAt: input.paidAt,
      scenario: input.simulationMetadata.scenario,
      sourceAdminUi: input.simulationMetadata.source_admin_ui,
      triggeredByAdminUserId: input.simulationMetadata.triggered_by_admin_user_id,
    },
  });
}

async function ensureInitialPeriod(input: {
  contract: SubscriptionContract;
  paidAt: string;
  simulationMetadata: ReturnType<typeof buildSimulationMetadata>;
}): Promise<SubscriptionPeriod> {
  const contractStartDate = resolveContractStartDate(input.contract.startedAt ?? input.paidAt);
  const periodPlan = planInitialSubscriptionPeriod({
    contractStartDate,
    billingAnchorDay: input.contract.billingAnchorDay,
  });
  const existing = await findSubscriptionPeriodByServiceMonth({
    subscriptionContractId: input.contract.id,
    serviceMonth: periodPlan.serviceMonth,
  });
  const metadata = {
    ...(existing?.metadata ?? {}),
    simulation: true,
    scenario: input.simulationMetadata.scenario,
    sourceAdminUi: input.simulationMetadata.source_admin_ui,
  };

  if (existing) {
    if (
      existing.status === "charged" &&
      existing.chargedAt === input.paidAt &&
      existing.plannedChargeAt === periodPlan.plannedChargeAt
    ) {
      return existing;
    }

    return updateSubscriptionPeriod(existing.id, {
      status: "charged",
      chargedAt: input.paidAt,
      plannedChargeAt: periodPlan.plannedChargeAt,
      metadata,
    });
  }

  const createInput = toCreateSubscriptionPeriodInput(input.contract.id, periodPlan);
  return createSubscriptionPeriod({
    ...createInput,
    status: "charged",
    chargedAt: input.paidAt,
    metadata,
  });
}

async function ensureInitialCharge(input: {
  contract: SubscriptionContract;
  period: SubscriptionPeriod;
  amountCents: number;
  currency: string;
  providerPaymentReference: string;
  paidAt: string;
  simulationMetadata: ReturnType<typeof buildSimulationMetadata>;
}): Promise<SubscriptionCharge> {
  const contractStartDate = resolveContractStartDate(input.contract.startedAt ?? input.paidAt);
  const plannedCharge = selectInitialChargePlan({
    actualAmountCents: input.amountCents,
    monthlyAmountCents: input.contract.baseAmountCents,
    currency: input.currency,
    contractStartDate,
    period: input.period,
  });
  const existing = (await listSubscriptionChargesByContractId(input.contract.id)).find(
    (charge) =>
      charge.provider === INTERNAL_SIMULATION_PROVIDER &&
      charge.subscriptionPeriodId === input.period.id &&
      charge.status === "paid" &&
      charge.grossAmountCents === input.amountCents &&
      charge.chargeType === plannedCharge.chargeType
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
      existing.providerPaymentReference === input.providerPaymentReference &&
      existing.currency === input.currency &&
      existing.chargedAt === input.paidAt
    ) {
      return existing;
    }

    return updateSubscriptionCharge(existing.id, {
      provider: INTERNAL_SIMULATION_PROVIDER,
      providerPaymentReference: existing.providerPaymentReference ?? input.providerPaymentReference,
      subscriptionPeriodId: input.period.id,
      chargeType: plannedCharge.chargeType,
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
  intentId: string;
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
    .select("id,subscription_charge_id")
    .eq("provider", INTERNAL_SIMULATION_PROVIDER)
    .eq("course_registration_intent_id", input.intentId)
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
      course_registration_intent_id: input.intentId,
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
    throw new Error("Failed to create simulated initial payment transaction");
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
  providerType: "independent_teacher" | "studio_provider" | null;
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

  const platformFeeCents = calculatePlatformFeeAmount(input.amountCents, input.providerType);
  const netAmountCents = calculateProviderPayoutAmount(input.amountCents, input.providerType);
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
    throw new Error("Failed to create simulated ledger entry");
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

export async function simulateSubscriptionInitialPaymentSuccess(input: {
  courseRegistrationIntentId: string;
  adminUserId: string;
  amountCents?: number | null;
  currency?: string | null;
  paidAt?: string | null;
  scenarioNote?: string | null;
}): Promise<SubscriptionSimulationResult> {
  const courseRegistrationIntentId = assertSimulationTargetId(input.courseRegistrationIntentId);
  const paidAt = normalizePaidAt(input.paidAt);
  const simulationMetadata = buildSimulationMetadata({
    triggeredByAdminUserId: input.adminUserId,
    triggeredAt: paidAt,
    scenario: input.scenarioNote?.trim()
      ? `subscription_initial_payment_success:${input.scenarioNote.trim()}`
      : "subscription_initial_payment_success",
    sourceAdminUi: "/dashboard/admin/payments-v2/subscriptions",
  });
  const admin = createSupabaseAdmin();

  const { data: intent } = await admin
    .from("course_registration_intents")
    .select("id,course_id,email,status,subscription_status,subscription_contract_id")
    .eq("id", courseRegistrationIntentId)
    .maybeSingle<CourseRegistrationIntentRow>();

  if (!intent) {
    throw new Error("Course registration intent not found");
  }

  const { data: course } = await admin
    .from("courses")
    .select("id,teacher_id,price_cents,currency")
    .eq("id", intent.course_id)
    .maybeSingle<CourseRow>();

  if (!course?.teacher_id) {
    throw new Error("Course not found or missing teacher");
  }

  const [{ data: profile }, { data: providerPayoutProfile }] = await Promise.all([
    admin.from("profiles").select("provider_type").eq("id", course.teacher_id).maybeSingle<ProfileRow>(),
    admin
      .from("provider_payout_profiles")
      .select("id")
      .eq("teacher_id", course.teacher_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<ProviderPayoutProfileRow>(),
  ]);

  const amountCents = normalizeAmount(input.amountCents, course.price_cents ?? 0);
  const currency = normalizeCurrency(input.currency ?? course.currency);
  const providerReferenceId = createSimulatedPaymentId();
  const providerSubscriptionId = createSimulatedEventId();

  const contract = await ensureSubscriptionContract({
    intent,
    course,
    providerSubscriptionId,
    paidAt,
    simulationMetadata,
  });
  const period = await ensureInitialPeriod({
    contract,
    paidAt,
    simulationMetadata,
  });
  const charge = await ensureInitialCharge({
    contract,
    period,
    amountCents,
    currency,
    providerPaymentReference: providerReferenceId,
    paidAt,
    simulationMetadata,
  });
  const paymentTransactionId = await ensurePaymentTransaction({
    intentId: intent.id,
    contractId: contract.id,
    chargeId: charge.id,
    providerPaymentId: providerReferenceId,
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
    providerType: profile?.provider_type ?? null,
    paidAt,
  });

  await admin
    .from("course_registration_intents")
    .update({
      subscription_contract_id: intent.subscription_contract_id ?? contract.id,
      subscription_status: "active",
    })
    .eq("id", intent.id);

  const events = await listSubscriptionEventsByContractId(contract.id);
  await ensureSimulationEvent({
    events,
    contractId: contract.id,
    eventType: "contract_activated",
    simulationMetadata,
    referenceId: contract.id,
  });
  await ensureSimulationEvent({
    events,
    contractId: contract.id,
    eventType: "initial_period_created",
    periodId: period.id,
    simulationMetadata,
    referenceId: period.id,
  });
  await ensureSimulationEvent({
    events,
    contractId: contract.id,
    eventType: "initial_charge_recorded",
    periodId: period.id,
    chargeId: charge.id,
    simulationMetadata,
    referenceId: charge.id,
  });
  await ensureSimulationEvent({
    events,
    contractId: contract.id,
    eventType: "initial_payment_simulated",
    chargeId: charge.id,
    simulationMetadata,
    referenceId: paymentTransactionId,
  });

  return {
    courseRegistrationIntentId: intent.id,
    subscriptionContractId: contract.id,
    subscriptionPeriodId: period.id,
    subscriptionChargeId: charge.id,
    paymentTransactionId,
    ledgerEntryId,
    simulationMetadata,
  };
}

import "server-only";

import type Stripe from "stripe";
import { listSubscriptionChargesByContractId, createSubscriptionCharge, findSubscriptionChargeByProviderReference, updateSubscriptionCharge } from "@/lib/payments/subscriptions/charges-repo";
import { planInitialProrationCharge, planMonthlyRecurringCharge, toCreateSubscriptionChargeInput, type PlannedSubscriptionCharge } from "@/lib/payments/subscriptions/charge-planner";
import { findSubscriptionContractById, findSubscriptionContractByIntentId, findSubscriptionContractByProviderSubscriptionId } from "@/lib/payments/subscriptions/contracts-repo";
import { activateContractForSuccessfulInitialPayment } from "@/lib/payments/subscriptions/contracts-service";
import { getBerlinTodayDate } from "@/lib/payments/subscriptions/dates";
import { createSubscriptionEvent, listSubscriptionEventsByContractId } from "@/lib/payments/subscriptions/events-repo";
import { planInitialSubscriptionPeriod, planNextSubscriptionPeriod, toCreateSubscriptionPeriodInput } from "@/lib/payments/subscriptions/period-planner";
import { createSubscriptionPeriod, findSubscriptionPeriodByServiceMonth, updateSubscriptionPeriod } from "@/lib/payments/subscriptions/periods-repo";
import type { SubscriptionCharge, SubscriptionContract, SubscriptionEvent, SubscriptionPeriod } from "@/lib/payments/subscriptions/types";

function normalizeTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function getExpandedSubscription(session: Stripe.Checkout.Session): Stripe.Subscription | null {
  return typeof session.subscription === "object" && session.subscription ? session.subscription : null;
}

function getProviderSubscriptionId(session: Stripe.Checkout.Session): string | null {
  return typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
}

function getProviderCustomerId(session: Stripe.Checkout.Session): string | null {
  return typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
}

function getProviderChargeId(session: Stripe.Checkout.Session): string | null {
  return typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
}

function getProviderInvoiceId(session: Stripe.Checkout.Session): string | null {
  return typeof session.invoice === "string" ? session.invoice : session.invoice?.id ?? null;
}

function resolveNextChargeAt(session: Stripe.Checkout.Session, fallback: string | null): string | null {
  const currentPeriodEnd = (getExpandedSubscription(session) as Stripe.Subscription & {
    current_period_end?: number;
  } | null)?.current_period_end;
  if (typeof currentPeriodEnd === "number" && Number.isFinite(currentPeriodEnd) && currentPeriodEnd > 0) {
    return new Date(currentPeriodEnd * 1000).toISOString();
  }

  return fallback;
}

function resolveContractStartDate(startedAt: string) {
  return getBerlinTodayDate(new Date(startedAt));
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

async function resolveSubscriptionContract(input: {
  contractId?: string | null;
  courseRegistrationIntentId: string;
  providerSubscriptionId?: string | null;
}): Promise<SubscriptionContract | null> {
  if (input.contractId) {
    const byId = await findSubscriptionContractById(input.contractId);
    if (byId) return byId;
  }

  const byIntent = await findSubscriptionContractByIntentId(input.courseRegistrationIntentId);
  if (byIntent) return byIntent;

  if (input.providerSubscriptionId) {
    return findSubscriptionContractByProviderSubscriptionId({
      provider: "stripe",
      providerSubscriptionId: input.providerSubscriptionId,
    });
  }

  return null;
}

async function ensureInitialPeriod(input: {
  contract: SubscriptionContract;
  startedAt: string;
  paymentTransactionId?: string | null;
  checkoutSessionId: string;
}): Promise<SubscriptionPeriod> {
  const contractStartDate = resolveContractStartDate(input.startedAt);
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
    initialPaymentTransactionId: input.paymentTransactionId ?? existing?.metadata.initialPaymentTransactionId ?? null,
    initialCheckoutSessionId: input.checkoutSessionId,
  };

  if (existing) {
    if (
      existing.status !== "charged" ||
      existing.chargedAt !== input.startedAt ||
      existing.plannedChargeAt !== periodPlan.plannedChargeAt
    ) {
      return updateSubscriptionPeriod(existing.id, {
        status: "charged",
        chargedAt: input.startedAt,
        plannedChargeAt: periodPlan.plannedChargeAt,
        metadata,
      });
    }

    return existing;
  }

  const createInput = toCreateSubscriptionPeriodInput(input.contract.id, periodPlan);
  return createSubscriptionPeriod({
    ...createInput,
    status: "charged",
    chargedAt: input.startedAt,
    metadata,
  });
}

async function ensureInitialCharge(input: {
  contract: SubscriptionContract;
  period: SubscriptionPeriod;
  stripeSession: Stripe.Checkout.Session;
  paidAt: string;
  paymentTransactionId?: string | null;
}): Promise<SubscriptionCharge> {
  const actualAmountCents = Math.max(0, input.stripeSession.amount_total ?? input.contract.baseAmountCents);
  const contractStartDate = resolveContractStartDate(input.contract.startedAt ?? input.paidAt);
  const plannedCharge = selectInitialChargePlan({
    actualAmountCents,
    monthlyAmountCents: input.contract.baseAmountCents,
    currency: input.contract.currency,
    contractStartDate,
    period: input.period,
  });
  const providerChargeId = getProviderChargeId(input.stripeSession);
  const providerInvoiceId = getProviderInvoiceId(input.stripeSession);
  const providerPaymentReference = input.stripeSession.id;
  const existingByProviderReference =
    providerChargeId || providerInvoiceId || providerPaymentReference
      ? await findSubscriptionChargeByProviderReference({
          provider: "stripe",
          providerChargeId,
          providerInvoiceId,
          providerPaymentReference,
        })
      : null;
  const existingByContract = existingByProviderReference
    ? null
    : (await listSubscriptionChargesByContractId(input.contract.id)).find(
        (charge) =>
          (input.paymentTransactionId && charge.paymentTransactionId === input.paymentTransactionId) ||
          (charge.subscriptionPeriodId === input.period.id && charge.chargeType === plannedCharge.chargeType)
      ) ?? null;
  const existing = existingByProviderReference ?? existingByContract;
  const metadata = {
    ...(existing?.metadata ?? {}),
    ...plannedCharge.metadata,
    mirroredGrossAmountCents: actualAmountCents,
    initialCheckoutSessionId: input.stripeSession.id,
  };

  if (existing) {
    const needsUpdate =
      existing.subscriptionPeriodId !== input.period.id ||
      existing.paymentTransactionId !== (input.paymentTransactionId ?? null) ||
      existing.status !== "paid" ||
      existing.grossAmountCents !== actualAmountCents ||
      existing.currency !== input.contract.currency ||
      existing.chargedAt !== input.paidAt ||
      existing.providerChargeId !== providerChargeId ||
      existing.providerInvoiceId !== providerInvoiceId ||
      existing.providerPaymentReference !== providerPaymentReference;

    if (!needsUpdate) {
      return existing;
    }

    return updateSubscriptionCharge(existing.id, {
      subscriptionPeriodId: input.period.id,
      paymentTransactionId: input.paymentTransactionId ?? null,
      provider: "stripe",
      providerChargeId,
      providerInvoiceId,
      providerPaymentReference,
      chargeType: plannedCharge.chargeType,
      grossAmountCents: actualAmountCents,
      currency: input.contract.currency,
      status: "paid",
      chargedAt: input.paidAt,
      metadata,
    });
  }

  const createInput = toCreateSubscriptionChargeInput({
    subscriptionContractId: input.contract.id,
    subscriptionPeriodId: input.period.id,
    provider: "stripe",
    plannedCharge,
  });

  return createSubscriptionCharge({
    ...createInput,
    paymentTransactionId: input.paymentTransactionId ?? null,
    providerChargeId,
    providerInvoiceId,
    providerPaymentReference,
    grossAmountCents: actualAmountCents,
    currency: input.contract.currency,
    status: "paid",
    chargedAt: input.paidAt,
    metadata,
  });
}

async function ensureSubscriptionEvent(input: {
  events: SubscriptionEvent[];
  contractId: string;
  eventType: string;
  subscriptionPeriodId?: string | null;
  subscriptionChargeId?: string | null;
  payload: Record<string, unknown>;
}): Promise<SubscriptionEvent> {
  const existing = input.events.find(
    (event) =>
      event.eventType === input.eventType &&
      event.subscriptionContractId === input.contractId &&
      (event.subscriptionPeriodId ?? null) === (input.subscriptionPeriodId ?? null) &&
      (event.subscriptionChargeId ?? null) === (input.subscriptionChargeId ?? null)
  );

  if (existing) {
    return existing;
  }

  const created = await createSubscriptionEvent({
    subscriptionContractId: input.contractId,
    subscriptionPeriodId: input.subscriptionPeriodId ?? null,
    subscriptionChargeId: input.subscriptionChargeId ?? null,
    eventType: input.eventType,
    eventSource: "system",
    payload: input.payload,
  });
  input.events.push(created);
  return created;
}

export async function materializeSuccessfulInitialSubscriptionPayment(input: {
  courseRegistrationIntentId: string;
  stripeSession: Stripe.Checkout.Session;
  paidAt: string;
  paymentTransactionId?: string | null;
}): Promise<{
  contractId: string;
  periodId: string;
  chargeId: string;
}> {
  const providerSubscriptionId = getProviderSubscriptionId(input.stripeSession);
  const metadataContractId = typeof input.stripeSession.metadata?.subscriptionContractId === "string"
    ? input.stripeSession.metadata.subscriptionContractId
    : null;
  const contract = await resolveSubscriptionContract({
    contractId: metadataContractId,
    courseRegistrationIntentId: input.courseRegistrationIntentId,
    providerSubscriptionId,
  });

  if (!contract) {
    throw new Error(`Subscription contract not found for intent ${input.courseRegistrationIntentId}`);
  }

  const startedAt = normalizeTimestamp(contract.startedAt) ?? normalizeTimestamp(input.paidAt) ?? new Date().toISOString();
  const contractStartDate = resolveContractStartDate(startedAt);
  const initialPeriodPlan = planInitialSubscriptionPeriod({
    contractStartDate,
    billingAnchorDay: contract.billingAnchorDay,
  });
  const nextPeriodPlan = planNextSubscriptionPeriod({
    previousServiceMonth: initialPeriodPlan.serviceMonth,
    billingAnchorDay: contract.billingAnchorDay,
  });

  const activatedContract = await activateContractForSuccessfulInitialPayment({
    contractId: contract.id,
    startedAt,
    firstPaidAt: normalizeTimestamp(input.paidAt) ?? startedAt,
    nextChargeAt: resolveNextChargeAt(input.stripeSession, nextPeriodPlan.plannedChargeAt),
    providerSubscriptionId,
    providerCustomerId: getProviderCustomerId(input.stripeSession),
    metadata: {
      dualWriteInitialPaymentMaterializedAt: new Date().toISOString(),
      initialCheckoutSessionId: input.stripeSession.id,
    },
  });

  const period = await ensureInitialPeriod({
    contract: activatedContract,
    startedAt,
    paymentTransactionId: input.paymentTransactionId ?? null,
    checkoutSessionId: input.stripeSession.id,
  });
  const charge = await ensureInitialCharge({
    contract: activatedContract,
    period,
    stripeSession: input.stripeSession,
    paidAt: normalizeTimestamp(input.paidAt) ?? startedAt,
    paymentTransactionId: input.paymentTransactionId ?? null,
  });

  const events = await listSubscriptionEventsByContractId(activatedContract.id);
  await ensureSubscriptionEvent({
    events,
    contractId: activatedContract.id,
    eventType: "contract_activated",
    payload: {
      courseRegistrationIntentId: input.courseRegistrationIntentId,
      startedAt: activatedContract.startedAt,
      firstPaidAt: activatedContract.metadata.firstPaidAt ?? normalizeTimestamp(input.paidAt) ?? startedAt,
      nextChargeAt: activatedContract.nextChargeAt,
      providerSubscriptionId: activatedContract.providerSubscriptionId,
      checkoutSessionId: input.stripeSession.id,
    },
  });
  await ensureSubscriptionEvent({
    events,
    contractId: activatedContract.id,
    subscriptionPeriodId: period.id,
    eventType: "initial_period_created",
    payload: {
      serviceMonth: period.serviceMonth,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      status: period.status,
      checkoutSessionId: input.stripeSession.id,
    },
  });
  await ensureSubscriptionEvent({
    events,
    contractId: activatedContract.id,
    subscriptionPeriodId: period.id,
    subscriptionChargeId: charge.id,
    eventType: "initial_charge_recorded",
    payload: {
      chargeType: charge.chargeType,
      grossAmountCents: charge.grossAmountCents,
      currency: charge.currency,
      paymentTransactionId: charge.paymentTransactionId,
      providerChargeId: charge.providerChargeId,
      providerInvoiceId: charge.providerInvoiceId,
      providerPaymentReference: charge.providerPaymentReference,
      chargedAt: charge.chargedAt,
      checkoutSessionId: input.stripeSession.id,
    },
  });

  return {
    contractId: activatedContract.id,
    periodId: period.id,
    chargeId: charge.id,
  };
}

import "server-only";

import type Stripe from "stripe";
import {
  calculatePlatformFeeCents,
  calculateProviderPayoutCents,
  getPlatformFeeConfigForProvider,
} from "@/lib/platform-fees";
import { planInitialProrationCharge } from "@/lib/payments/subscriptions/charge-planner";
import { shouldMaterializeServicePeriodForCourse } from "@/lib/payments/subscriptions/lifecycle-materialization";
import {
  createSubscriptionCharge,
  findSubscriptionChargeByProviderReference,
  updateSubscriptionCharge,
} from "@/lib/payments/subscriptions/charges-repo";
import {
  createSubscriptionContract,
  findSubscriptionContractById,
  findSubscriptionContractByIntentId,
  findSubscriptionContractByProviderSubscriptionId,
  updateSubscriptionContract,
} from "@/lib/payments/subscriptions/contracts-repo";
import { createSubscriptionEvent, listSubscriptionEventsByContractId } from "@/lib/payments/subscriptions/events-repo";
import {
  createSubscriptionPeriod,
  findSubscriptionPeriodByServiceMonth,
  updateSubscriptionPeriod,
} from "@/lib/payments/subscriptions/periods-repo";
import {
  getFirstDayOfMonth,
  getLastDayOfMonth,
  toBerlinStartOfDayIso,
} from "@/lib/payments/subscriptions/dates";
import type {
  SubscriptionCharge,
  SubscriptionContract,
  SubscriptionPeriod,
  SubscriptionPeriodStatus,
} from "@/lib/payments/subscriptions/types";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type StripeInvoiceMirrorStatus = "paid" | "failed";

type MaterializeStripeSubscriptionInvoiceInput = {
  invoice: Stripe.Invoice;
  status: StripeInvoiceMirrorStatus;
  paymentTransactionId?: string | null;
};

type MaterializeStripeSubscriptionInvoiceResult = {
  contractId: string;
  periodId: string;
  chargeId: string;
};

type PaymentTransactionMirrorRow = {
  id: string;
  course_registration_intent_id: string | null;
  provider_subscription_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
};

type LedgerEntryMirrorRow = {
  id: string;
  platform_fee_cents: number | null;
  net_amount_cents: number | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
};

type CourseRegistrationIntentMirrorRow = {
  id: string;
  course_id: string | null;
  email: string | null;
  subscription_contract_id: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
};

type CourseMirrorRow = {
  id: string;
  teacher_id: string | null;
  price_cents: number | null;
  currency: string | null;
  ends_at: string | null;
};

type StripeInvoiceLineWithSubscriptionPeriod = Stripe.InvoiceLineItem & {
  subscription?: string | Stripe.Subscription | null;
  period?: {
    start?: number | null;
    end?: number | null;
  } | null;
};

type ServicePeriod = {
  periodStart: string;
  periodEnd: string;
  serviceMonth: string;
  source: "invoice_line_period" | "invoice_period";
};

const SUBSCRIPTION_METADATA_KEYS = {
  contractId: "subscriptionContractId",
  registrationIntentId: "registrationIntentId",
  courseRegistrationIntentId: "course_registration_intent_id",
} as const;

function normalizeCurrency(currency: string | null | undefined): string {
  return (currency ?? "EUR").trim().toUpperCase() || "EUR";
}

function normalizeUnixTimestamp(unixTimestamp: number | null | undefined): string | null {
  if (typeof unixTimestamp !== "number" || !Number.isFinite(unixTimestamp) || unixTimestamp <= 0) {
    return null;
  }

  return new Date(unixTimestamp * 1000).toISOString();
}

function getMetadataValue(metadata: Stripe.Metadata | null | undefined, key: string): string | null {
  const value = metadata?.[key];
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function getMergedInvoiceMetadata(invoice: Stripe.Invoice): Stripe.Metadata {
  return {
    ...(invoice.metadata ?? {}),
    ...(invoice.parent?.subscription_details?.metadata ?? {}),
  };
}

function toObjectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }

  return null;
}

function getProviderSubscriptionId(invoice: Stripe.Invoice): string | null {
  return toObjectId(invoice.parent?.subscription_details?.subscription);
}

function getProviderCustomerId(invoice: Stripe.Invoice): string | null {
  return toObjectId(invoice.customer);
}

function toBerlinDateFromUnix(unixTimestamp: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(unixTimestamp * 1000));
}

function previousDate(dateString: string): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function getLineSubscriptionId(line: StripeInvoiceLineWithSubscriptionPeriod): string | null {
  return toObjectId(line.subscription);
}

function getServicePeriodFromInvoice(invoice: Stripe.Invoice, providerSubscriptionId: string): ServicePeriod | null {
  const invoiceLines = (invoice.lines?.data ?? []) as StripeInvoiceLineWithSubscriptionPeriod[];
  const lineWithMatchingSubscription =
    invoiceLines.find((line) => getLineSubscriptionId(line) === providerSubscriptionId && line.period?.start && line.period?.end) ??
    invoiceLines.find((line) => line.period?.start && line.period?.end);

  const startUnix = lineWithMatchingSubscription?.period?.start ?? invoice.period_start;
  const endUnix = lineWithMatchingSubscription?.period?.end ?? invoice.period_end;
  if (!startUnix || !endUnix) {
    return null;
  }

  const periodStart = toBerlinDateFromUnix(startUnix);
  const exclusivePeriodEnd = toBerlinDateFromUnix(endUnix);
  const periodEnd = previousDate(exclusivePeriodEnd);
  const serviceMonth = getFirstDayOfMonth(periodStart);

  return {
    periodStart,
    periodEnd: periodEnd >= periodStart ? periodEnd : getLastDayOfMonth(periodStart),
    serviceMonth,
    source: lineWithMatchingSubscription ? "invoice_line_period" : "invoice_period",
  };
}

function getInvoiceAmountCents(invoice: Stripe.Invoice, status: StripeInvoiceMirrorStatus): number {
  const amount = status === "paid" ? invoice.amount_paid ?? invoice.amount_due : invoice.amount_due ?? invoice.amount_paid;
  return Math.max(0, amount ?? 0);
}

function getInvoicePaidAt(invoice: Stripe.Invoice, status: StripeInvoiceMirrorStatus): string | null {
  if (status !== "paid") return null;
  return normalizeUnixTimestamp(invoice.status_transitions?.paid_at) ?? normalizeUnixTimestamp(invoice.created);
}

function getFailureCode(invoice: Stripe.Invoice): string | null {
  const error = invoice.last_finalization_error;
  return typeof error?.code === "string" ? error.code : null;
}

function getFailureMessage(invoice: Stripe.Invoice): string | null {
  const error = invoice.last_finalization_error;
  return typeof error?.message === "string" ? error.message : null;
}

async function findPaymentTransaction(input: {
  paymentTransactionId?: string | null;
  providerSubscriptionId?: string | null;
  invoiceId?: string | null;
}): Promise<PaymentTransactionMirrorRow | null> {
  const admin = createSupabaseAdmin();
  const selectFields =
    "id,course_registration_intent_id,provider_subscription_id,stripe_payment_intent_id,stripe_charge_id";

  if (input.paymentTransactionId) {
    const { data } = await admin
      .from("payment_transactions")
      .select(selectFields)
      .eq("id", input.paymentTransactionId)
      .maybeSingle<PaymentTransactionMirrorRow>();

    if (data) return data;
  }

  if (input.invoiceId) {
    const { data } = await admin
      .from("payment_transactions")
      .select(selectFields)
      .eq("provider", "stripe")
      .eq("provider_payment_id", input.invoiceId)
      .maybeSingle<PaymentTransactionMirrorRow>();

    if (data) return data;
  }

  if (input.providerSubscriptionId) {
    const { data } = await admin
      .from("payment_transactions")
      .select(selectFields)
      .eq("provider", "stripe")
      .eq("provider_subscription_id", input.providerSubscriptionId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<PaymentTransactionMirrorRow>();

    if (data) return data;
  }

  return null;
}

async function findLedgerEntry(paymentTransactionId: string | null | undefined): Promise<LedgerEntryMirrorRow | null> {
  if (!paymentTransactionId) return null;

  const { data } = await createSupabaseAdmin()
    .from("ledger_entries")
    .select("id,platform_fee_cents,net_amount_cents,stripe_payment_intent_id,stripe_charge_id")
    .eq("source_type", "payment_transaction")
    .eq("source_id", paymentTransactionId)
    .eq("entry_type", "payment")
    .maybeSingle<LedgerEntryMirrorRow>();

  return data ?? null;
}

async function loadIntent(intentId: string | null): Promise<CourseRegistrationIntentMirrorRow | null> {
  if (!intentId) return null;

  const { data } = await createSupabaseAdmin()
    .from("course_registration_intents")
    .select("id,course_id,email,subscription_contract_id,stripe_subscription_id,stripe_customer_id")
    .eq("id", intentId)
    .maybeSingle<CourseRegistrationIntentMirrorRow>();

  return data ?? null;
}

async function loadCourse(courseId: string | null): Promise<CourseMirrorRow | null> {
  if (!courseId) return null;

  const { data } = await createSupabaseAdmin()
    .from("courses")
    .select("id,teacher_id,price_cents,currency,ends_at")
    .eq("id", courseId)
    .maybeSingle<CourseMirrorRow>();

  return data ?? null;
}

async function linkIntentToContract(intentId: string | null, contractId: string): Promise<void> {
  if (!intentId) return;

  await createSupabaseAdmin()
    .from("course_registration_intents")
    .update({ subscription_contract_id: contractId })
    .eq("id", intentId)
    .is("subscription_contract_id", null);
}

async function createContractFromInvoiceContext(input: {
  intent: CourseRegistrationIntentMirrorRow;
  course: CourseMirrorRow;
  invoice: Stripe.Invoice;
  providerSubscriptionId: string;
  providerCustomerId: string | null;
  amountCents: number;
  currency: string;
  servicePeriod: ServicePeriod;
  metadata: Stripe.Metadata;
  status: StripeInvoiceMirrorStatus;
}): Promise<SubscriptionContract | null> {
  if (!input.intent.course_id || !input.course.teacher_id) return null;

  try {
    return await createSubscriptionContract({
      courseRegistrationIntentId: input.intent.id,
      courseId: input.intent.course_id,
      teacherId: input.course.teacher_id,
      customerEmail: input.intent.email ?? "unknown@example.invalid",
      provider: "stripe",
      providerSubscriptionId: input.providerSubscriptionId,
      providerCustomerId: input.providerCustomerId,
      status: input.status === "paid" ? "active" : "pending_initial_payment",
      baseAmountCents: input.course.price_cents ?? input.amountCents,
      currency: input.course.currency ? normalizeCurrency(input.course.currency) : input.currency,
      billingAnchorDay: 1,
      startedAt: toBerlinStartOfDayIso(input.servicePeriod.serviceMonth),
      metadata: {
        createdFrom: "stripe_invoice_webhook",
        stripeInvoiceId: input.invoice.id,
        stripeBillingReason: input.invoice.billing_reason ?? null,
        checkoutSessionId: getMetadataValue(input.metadata, "checkoutSessionId"),
      },
    });
  } catch {
    return (
      (await findSubscriptionContractByProviderSubscriptionId({
        provider: "stripe",
        providerSubscriptionId: input.providerSubscriptionId,
      })) ?? (await findSubscriptionContractByIntentId(input.intent.id))
    );
  }
}

async function resolveSubscriptionContract(input: {
  invoice: Stripe.Invoice;
  providerSubscriptionId: string;
  providerCustomerId: string | null;
  paymentTransaction: PaymentTransactionMirrorRow | null;
  amountCents: number;
  currency: string;
  servicePeriod: ServicePeriod;
  metadata: Stripe.Metadata;
  status: StripeInvoiceMirrorStatus;
}): Promise<SubscriptionContract | null> {
  const metadataContractId = getMetadataValue(input.metadata, SUBSCRIPTION_METADATA_KEYS.contractId);
  const metadataIntentId =
    getMetadataValue(input.metadata, SUBSCRIPTION_METADATA_KEYS.courseRegistrationIntentId) ??
    getMetadataValue(input.metadata, SUBSCRIPTION_METADATA_KEYS.registrationIntentId);
  const transactionIntentId = input.paymentTransaction?.course_registration_intent_id ?? null;
  const intentId = metadataIntentId ?? transactionIntentId;

  let contract =
    (metadataContractId ? await findSubscriptionContractById(metadataContractId) : null) ??
    (await findSubscriptionContractByProviderSubscriptionId({
      provider: "stripe",
      providerSubscriptionId: input.providerSubscriptionId,
    })) ??
    (intentId ? await findSubscriptionContractByIntentId(intentId) : null);

  if (!contract) {
    const intent = await loadIntent(intentId);
    const course = await loadCourse(intent?.course_id ?? null);
    if (intent && course) {
      contract = await createContractFromInvoiceContext({
        intent,
        course,
        invoice: input.invoice,
        providerSubscriptionId: input.providerSubscriptionId,
        providerCustomerId: input.providerCustomerId,
        amountCents: input.amountCents,
        currency: input.currency,
        servicePeriod: input.servicePeriod,
        metadata: input.metadata,
        status: input.status,
      });
    }
  }

  if (!contract) return null;

  const shouldPatchProviderIds =
    contract.providerSubscriptionId !== input.providerSubscriptionId ||
    contract.providerCustomerId !== input.providerCustomerId ||
    (input.status === "paid" && !["active", "pause_scheduled", "paused", "cancel_scheduled"].includes(contract.status));

  if (shouldPatchProviderIds) {
    contract = await updateSubscriptionContract(contract.id, {
      providerSubscriptionId: input.providerSubscriptionId,
      providerCustomerId: input.providerCustomerId,
      status: input.status === "paid" ? "active" : contract.status,
      startedAt: contract.startedAt ?? toBerlinStartOfDayIso(input.servicePeriod.serviceMonth),
      metadata: {
        ...contract.metadata,
        lastStripeInvoiceId: input.invoice.id,
      },
    });
  }

  await linkIntentToContract(contract.courseRegistrationIntentId ?? intentId, contract.id);
  return contract;
}

async function ensurePeriod(input: {
  contract: SubscriptionContract;
  servicePeriod: ServicePeriod;
  status: StripeInvoiceMirrorStatus;
  chargedAt: string | null;
  invoice: Stripe.Invoice;
}): Promise<SubscriptionPeriod> {
  const existing = await findSubscriptionPeriodByServiceMonth({
    subscriptionContractId: input.contract.id,
    serviceMonth: input.servicePeriod.serviceMonth,
  });
  const periodStatus: SubscriptionPeriodStatus =
    input.status === "paid" ? "charged" : existing?.status === "charged" ? "charged" : "failed";
  const periodPayload = {
    periodStart: input.servicePeriod.periodStart,
    periodEnd: input.servicePeriod.periodEnd,
    serviceMonth: input.servicePeriod.serviceMonth,
    status: periodStatus,
    plannedChargeAt: toBerlinStartOfDayIso(input.servicePeriod.serviceMonth),
    chargedAt: input.status === "paid" ? input.chargedAt : existing?.chargedAt ?? null,
    metadata: {
      ...(existing?.metadata ?? {}),
      stripeInvoiceId: input.invoice.id,
      stripeBillingReason: input.invoice.billing_reason ?? null,
      servicePeriodSource: input.servicePeriod.source,
    },
  };

  if (existing) {
    return updateSubscriptionPeriod(existing.id, periodPayload);
  }

  return createSubscriptionPeriod({
    subscriptionContractId: input.contract.id,
    ...periodPayload,
  });
}

async function ensureCharge(input: {
  contract: SubscriptionContract;
  period: SubscriptionPeriod;
  invoice: Stripe.Invoice;
  status: StripeInvoiceMirrorStatus;
  paymentTransaction: PaymentTransactionMirrorRow | null;
  ledgerEntry: LedgerEntryMirrorRow | null;
  amountCents: number;
  currency: string;
  platformFeeCents: number;
  providerNetCents: number;
  chargedAt: string | null;
  servicePeriod: ServicePeriod;
}): Promise<SubscriptionCharge> {
  const existing = await findSubscriptionChargeByProviderReference({
    provider: "stripe",
    providerInvoiceId: input.invoice.id,
    providerPaymentReference: input.invoice.id,
  });
  const stripePaymentIntentId =
    input.paymentTransaction?.stripe_payment_intent_id ?? input.ledgerEntry?.stripe_payment_intent_id ?? null;
  const stripeChargeId = input.paymentTransaction?.stripe_charge_id ?? input.ledgerEntry?.stripe_charge_id ?? null;
  const isInitialProration = input.servicePeriod.periodStart > input.servicePeriod.serviceMonth;
  const prorationMetadata = isInitialProration
    ? planInitialProrationCharge({
        monthlyAmountCents: input.contract.baseAmountCents,
        contractStartDate: input.servicePeriod.periodStart,
        currency: input.currency,
      }).metadata
    : {};
  const payload = {
    subscriptionContractId: input.contract.id,
    subscriptionPeriodId: input.period.id,
    paymentTransactionId: input.paymentTransaction?.id ?? null,
    ledgerEntryId: input.ledgerEntry?.id ?? null,
    provider: "stripe",
    providerChargeId: stripeChargeId,
    providerInvoiceId: input.invoice.id,
    providerPaymentReference: input.invoice.id,
    chargeType: isInitialProration ? ("initial_proration" as const) : ("monthly_recurring" as const),
    grossAmountCents: input.amountCents,
    platformFeeCents: input.ledgerEntry?.platform_fee_cents ?? input.platformFeeCents,
    providerNetCents: input.ledgerEntry?.net_amount_cents ?? input.providerNetCents,
    currency: input.currency,
    status: input.status,
    chargedAt: input.chargedAt,
    stripeInvoiceId: input.invoice.id,
    stripePaymentIntentId,
    stripeChargeId,
    failureCode: input.status === "failed" ? getFailureCode(input.invoice) : null,
    failureMessage: input.status === "failed" ? getFailureMessage(input.invoice) : null,
    nextPaymentAttempt:
      input.status === "failed" ? normalizeUnixTimestamp(input.invoice.next_payment_attempt) : null,
    metadata: {
      ...(existing?.metadata ?? {}),
      ...prorationMetadata,
      stripeBillingReason: input.invoice.billing_reason ?? null,
      stripeInvoiceStatus: input.invoice.status ?? null,
      stripeCollectionMethod: input.invoice.collection_method ?? null,
      actualStripeInvoiceAmountCents: input.amountCents,
    },
  };

  if (existing) {
    return updateSubscriptionCharge(existing.id, payload);
  }

  return createSubscriptionCharge(payload);
}

async function ensureInvoiceEvent(input: {
  contract: SubscriptionContract;
  period: SubscriptionPeriod;
  charge: SubscriptionCharge;
  invoice: Stripe.Invoice;
  status: StripeInvoiceMirrorStatus;
}): Promise<void> {
  const eventType = input.status === "paid" ? "stripe_invoice_paid" : "stripe_invoice_payment_failed";
  const events = await listSubscriptionEventsByContractId(input.contract.id);
  const alreadyRecorded = events.some((event) => {
    if (event.eventType !== eventType) return false;
    const payload = event.payload as Record<string, unknown>;
    return payload.stripeInvoiceId === input.invoice.id;
  });

  if (alreadyRecorded) return;

  await createSubscriptionEvent({
    subscriptionContractId: input.contract.id,
    subscriptionPeriodId: input.period.id,
    subscriptionChargeId: input.charge.id,
    eventType,
    eventSource: "stripe",
    payload: {
      stripeInvoiceId: input.invoice.id,
      stripeInvoiceStatus: input.invoice.status ?? null,
      stripeBillingReason: input.invoice.billing_reason ?? null,
    },
  });
}

export async function materializeStripeSubscriptionInvoice(
  input: MaterializeStripeSubscriptionInvoiceInput
): Promise<MaterializeStripeSubscriptionInvoiceResult | null> {
  const providerSubscriptionId = getProviderSubscriptionId(input.invoice);
  if (!providerSubscriptionId) {
    return null;
  }

  const servicePeriod = getServicePeriodFromInvoice(input.invoice, providerSubscriptionId);
  if (!servicePeriod) {
    return null;
  }

  const metadata = getMergedInvoiceMetadata(input.invoice);
  const amountCents = getInvoiceAmountCents(input.invoice, input.status);
  const currency = normalizeCurrency(input.invoice.currency);
  const providerCustomerId = getProviderCustomerId(input.invoice);
  const paymentTransaction = await findPaymentTransaction({
    paymentTransactionId: input.paymentTransactionId,
    providerSubscriptionId,
    invoiceId: input.invoice.id,
  });
  const contract = await resolveSubscriptionContract({
    invoice: input.invoice,
    providerSubscriptionId,
    providerCustomerId,
    paymentTransaction,
    amountCents,
    currency,
    servicePeriod,
    metadata,
    status: input.status,
  });

  if (!contract) {
    return null;
  }

  const course = await loadCourse(contract.courseId);
  if (
    course?.ends_at &&
    !shouldMaterializeServicePeriodForCourse({
      courseEndsAt: course.ends_at,
      periodStart: servicePeriod.periodStart,
    })
  ) {
    return null;
  }

  const ledgerEntry = await findLedgerEntry(paymentTransaction?.id);
  const platformFeeConfig = await getPlatformFeeConfigForProvider(createSupabaseAdmin(), contract.teacherId);
  const platformFeeCents = calculatePlatformFeeCents(amountCents, platformFeeConfig.platformFeePercent);
  const providerNetCents = calculateProviderPayoutCents(amountCents, platformFeeConfig.platformFeePercent);
  const chargedAt = getInvoicePaidAt(input.invoice, input.status);
  const period = await ensurePeriod({
    contract,
    servicePeriod,
    status: input.status,
    chargedAt,
    invoice: input.invoice,
  });
  const charge = await ensureCharge({
    contract,
    period,
    invoice: input.invoice,
    status: input.status,
    paymentTransaction,
    ledgerEntry,
    amountCents,
    currency,
    platformFeeCents,
    providerNetCents,
    chargedAt,
    servicePeriod,
  });
  await ensureInvoiceEvent({
    contract,
    period,
    charge,
    invoice: input.invoice,
    status: input.status,
  });

  return {
    contractId: contract.id,
    periodId: period.id,
    chargeId: charge.id,
  };
}

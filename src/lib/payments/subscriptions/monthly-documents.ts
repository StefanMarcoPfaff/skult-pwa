import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCustomerReceiptDocumentData,
  buildProviderPayoutStatementDocumentData,
  buildProviderPlatformFeeInvoiceDocumentData,
} from "@/lib/documents/document-data";
import {
  createFinancialDocumentRecord,
  ensureFinancialDocumentPdfAsset,
} from "@/lib/documents/financial-documents";
import type { DocumentType, FinancialDocumentMetadata, FinancialDocumentRecord } from "@/lib/documents/types";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

const SUBSCRIPTION_DOCUMENT_RETRY_LIMIT = 20;
const SUBSCRIPTION_DOCUMENT_SCAN_MULTIPLIER = 5;

type SubscriptionDocumentScope =
  | "subscription_monthly_payout"
  | "subscription_monthly_platform_fee"
  | "subscription_monthly_customer_receipt";

type PayoutBatchRow = {
  id: string;
  transfer_type: string | null;
  provider_payout_profile_id: string | null;
  provider_id: string | null;
  service_month: string | null;
  total_amount_cents: number;
  gross_amount_cents: number;
  platform_fee_cents: number;
  provider_net_amount_cents: number;
  charge_count: number;
  currency: string;
  status: string;
  executed_at: string | null;
  stripe_transfer_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type SubscriptionChargeRow = {
  id: string;
  subscription_contract_id: string;
  subscription_period_id: string | null;
  payment_transaction_id: string | null;
  ledger_entry_id: string | null;
  provider_payout_profile_id: string | null;
  payout_batch_id: string | null;
  provider: string;
  provider_charge_id: string | null;
  provider_invoice_id: string | null;
  provider_payment_reference: string | null;
  charge_type: string;
  gross_amount_cents: number;
  platform_fee_cents: number;
  provider_net_cents: number;
  currency: string;
  status: string;
  charged_at: string | null;
  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  transfer_status: string;
  stripe_transfer_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type SubscriptionPeriodRow = {
  id: string;
  period_start: string;
  period_end: string;
  service_month: string;
  status: string;
};

type SubscriptionContractRow = {
  id: string;
  course_registration_intent_id: string | null;
  course_id: string;
  teacher_id: string;
  customer_email: string;
};

type PaymentTransactionRow = {
  id: string;
  course_registration_intent_id: string | null;
  provider: string | null;
  provider_payment_id: string | null;
  provider_checkout_id: string | null;
  stripe_charge_id: string | null;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  paid_at: string | null;
  created_at: string;
};

type CourseRegistrationIntentRow = {
  id: string;
  course_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

type CourseRow = {
  id: string;
  title: string | null;
  kind: string | null;
  instructor_name: string | null;
  teacher_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  location_details: string | null;
};

type CourseBreakdownRow = {
  courseId: string;
  courseTitle: string;
  chargeCount: number;
  grossAmountCents: number;
  platformFeeCents: number;
  providerNetCents: number;
};

type LoadedBatchContext = {
  batch: PayoutBatchRow;
  providerId: string;
  serviceMonth: string;
  periodStart: string;
  periodEnd: string;
  charges: SubscriptionChargeRow[];
  periodById: Map<string, SubscriptionPeriodRow>;
  contractById: Map<string, SubscriptionContractRow>;
  paymentById: Map<string, PaymentTransactionRow>;
  intentById: Map<string, CourseRegistrationIntentRow>;
  courseById: Map<string, CourseRow>;
  courseBreakdown: CourseBreakdownRow[];
};

type DocumentFinalizeResult = {
  documentId: string;
  pdfPath: string | null;
  pdfGenerated: boolean;
  pdfWarning: string | null;
};

export type EnsureSubscriptionMonthlyDocumentsForBatchResult = {
  payoutBatchId: string;
  skipped: boolean;
  providerPayoutStatement: DocumentFinalizeResult | null;
  providerPlatformFeeInvoice: DocumentFinalizeResult | null;
  customerReceipts: DocumentFinalizeResult[];
  error: string | null;
};

export type ProcessSubscriptionMonthlyDocumentsResult = {
  consideredCount: number;
  processedCount: number;
  failedCount: number;
  results: EnsureSubscriptionMonthlyDocumentsForBatchResult[];
};

function asTypedSupabase(client: SupabaseClient): SupabaseClient<Database> {
  return client as SupabaseClient<Database>;
}

function normalizeCurrency(currency: string | null | undefined): string {
  return (currency ?? "EUR").trim().toUpperCase() || "EUR";
}

function normalizeText(value: string | null | undefined, fallback = ""): string {
  const trimmed = String(value ?? "").trim();
  return trimmed || fallback;
}

function buildFullName(firstName: string | null | undefined, lastName: string | null | undefined): string | null {
  const fullName = [normalizeText(firstName), normalizeText(lastName)].filter(Boolean).join(" ").trim();
  return fullName || null;
}

function getLastDayOfMonth(dateString: string): string {
  const [yearText, monthText] = dateString.slice(0, 10).split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return dateString.slice(0, 10);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function getMetadataObject(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadRowsByIds<T extends { id: string }>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  ids: string[]
): Promise<Map<string, T>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from(table).select(select).in("id", ids).returns<T[]>();
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row] as const));
}

async function findExistingDocumentByBatchScope(input: {
  supabase: SupabaseClient;
  payoutBatchId: string;
  documentType: DocumentType;
  documentScope: SubscriptionDocumentScope;
}): Promise<FinancialDocumentRecord | null> {
  const { data, error } = await input.supabase
    .from("financial_documents")
    .select("*")
    .eq("document_type", input.documentType)
    .eq("payout_batch_id", input.payoutBatchId)
    .returns<FinancialDocumentRecord[]>();
  if (error) throw error;

  return (
    (data ?? []).find((document) => getMetadataObject(document.metadata).documentScope === input.documentScope) ?? null
  );
}

async function findExistingCustomerReceiptForCharge(input: {
  supabase: SupabaseClient;
  subscriptionChargeId: string;
}): Promise<FinancialDocumentRecord | null> {
  const { data, error } = await input.supabase
    .from("financial_documents")
    .select("*")
    .eq("document_type", "customer_receipt")
    .eq("subscription_charge_id", input.subscriptionChargeId)
    .returns<FinancialDocumentRecord[]>();
  if (error) throw error;

  return (
    (data ?? []).find(
      (document) => getMetadataObject(document.metadata).documentScope === "subscription_monthly_customer_receipt"
    ) ?? null
  );
}

async function finalizeDocument(input: {
  supabase: SupabaseClient;
  record: FinancialDocumentRecord;
}): Promise<DocumentFinalizeResult> {
  const result = await ensureFinancialDocumentPdfAsset(input.record, input.supabase);
  return {
    documentId: result.record.id,
    pdfPath: result.pdfPath,
    pdfGenerated: result.pdfGenerated,
    pdfWarning: result.warning,
  };
}

async function updateExistingDocument(input: {
  supabase: SupabaseClient;
  documentId: string;
  patch: Partial<FinancialDocumentRecord>;
}): Promise<FinancialDocumentRecord> {
  const { data, error } = await input.supabase
    .from("financial_documents")
    .update(input.patch as never)
    .eq("id", input.documentId)
    .select("*")
    .single<FinancialDocumentRecord>();
  if (error) throw error;
  return data;
}

function buildCourseBreakdown(context: LoadedBatchContext): CourseBreakdownRow[] {
  const byCourseId = new Map<string, CourseBreakdownRow>();
  for (const charge of context.charges) {
    const contract = context.contractById.get(charge.subscription_contract_id);
    if (!contract) continue;
    const course = context.courseById.get(contract.course_id);
    const courseId = contract.course_id;
    const existing =
      byCourseId.get(courseId) ??
      ({
        courseId,
        courseTitle: normalizeText(course?.title, "Laufendes Angebot"),
        chargeCount: 0,
        grossAmountCents: 0,
        platformFeeCents: 0,
        providerNetCents: 0,
      } satisfies CourseBreakdownRow);
    existing.chargeCount += 1;
    existing.grossAmountCents += Math.max(0, charge.gross_amount_cents);
    existing.platformFeeCents += Math.max(0, charge.platform_fee_cents);
    existing.providerNetCents += Math.max(0, charge.provider_net_cents);
    byCourseId.set(courseId, existing);
  }
  return Array.from(byCourseId.values()).sort((left, right) => left.courseTitle.localeCompare(right.courseTitle));
}

async function loadBatchContext(input: {
  supabase: SupabaseClient;
  payoutBatchId: string;
}): Promise<LoadedBatchContext | null> {
  const { data: batch, error: batchError } = await input.supabase
    .from("payout_batches")
    .select(
      "id,transfer_type,provider_payout_profile_id,provider_id,service_month,total_amount_cents,gross_amount_cents,platform_fee_cents,provider_net_amount_cents,charge_count,currency,status,executed_at,stripe_transfer_id,metadata,created_at"
    )
    .eq("id", input.payoutBatchId)
    .maybeSingle<PayoutBatchRow>();
  if (batchError) throw batchError;
  if (
    !batch?.id ||
    batch.transfer_type !== "subscription_monthly_provider_transfer" ||
    batch.status !== "paid" ||
    !batch.stripe_transfer_id ||
    !batch.provider_id ||
    !batch.service_month
  ) {
    return null;
  }

  const { data: charges, error: chargesError } = await input.supabase
    .from("subscription_charges")
    .select(
      "id,subscription_contract_id,subscription_period_id,payment_transaction_id,ledger_entry_id,provider_payout_profile_id,payout_batch_id,provider,provider_charge_id,provider_invoice_id,provider_payment_reference,charge_type,gross_amount_cents,platform_fee_cents,provider_net_cents,currency,status,charged_at,stripe_invoice_id,stripe_payment_intent_id,stripe_charge_id,transfer_status,stripe_transfer_id,metadata,created_at"
    )
    .eq("payout_batch_id", input.payoutBatchId)
    .eq("status", "paid")
    .eq("transfer_status", "transfer_created")
    .not("stripe_transfer_id", "is", null)
    .returns<SubscriptionChargeRow[]>();
  if (chargesError) throw chargesError;

  const chargeRows = charges ?? [];
  if (chargeRows.length === 0) return null;

  const periodIds = Array.from(
    new Set(chargeRows.map((charge) => charge.subscription_period_id).filter((id): id is string => Boolean(id)))
  );
  const contractIds = Array.from(new Set(chargeRows.map((charge) => charge.subscription_contract_id)));
  const paymentIds = Array.from(
    new Set(chargeRows.map((charge) => charge.payment_transaction_id).filter((id): id is string => Boolean(id)))
  );

  const [periodById, contractById, paymentById] = await Promise.all([
    loadRowsByIds<SubscriptionPeriodRow>(
      input.supabase,
      "subscription_periods",
      "id,period_start,period_end,service_month,status",
      periodIds
    ),
    loadRowsByIds<SubscriptionContractRow>(
      input.supabase,
      "subscription_contracts",
      "id,course_registration_intent_id,course_id,teacher_id,customer_email",
      contractIds
    ),
    loadRowsByIds<PaymentTransactionRow>(
      input.supabase,
      "payment_transactions",
      "id,course_registration_intent_id,provider,provider_payment_id,provider_checkout_id,stripe_charge_id,stripe_payment_intent_id,amount_cents,currency,status,paid_at,created_at",
      paymentIds
    ),
  ]);

  const intentIds = Array.from(
    new Set(
      Array.from(contractById.values())
        .map((contract) => contract.course_registration_intent_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const courseIds = Array.from(new Set(Array.from(contractById.values()).map((contract) => contract.course_id)));
  const [intentById, courseById] = await Promise.all([
    loadRowsByIds<CourseRegistrationIntentRow>(
      input.supabase,
      "course_registration_intents",
      "id,course_id,first_name,last_name,email",
      intentIds
    ),
    loadRowsByIds<CourseRow>(
      input.supabase,
      "courses",
      "id,title,kind,instructor_name,teacher_id,starts_at,ends_at,location,location_details",
      courseIds
    ),
  ]);

  const serviceMonth = batch.service_month;
  const context: LoadedBatchContext = {
    batch,
    providerId: batch.provider_id,
    serviceMonth,
    periodStart: serviceMonth,
    periodEnd: getLastDayOfMonth(serviceMonth),
    charges: chargeRows,
    periodById,
    contractById,
    paymentById,
    intentById,
    courseById,
    courseBreakdown: [],
  };
  context.courseBreakdown = buildCourseBreakdown(context);
  return context;
}

function buildBatchMetadata(input: {
  context: LoadedBatchContext;
  documentScope: SubscriptionDocumentScope;
}): Record<string, unknown> {
  return {
    documentScope: input.documentScope,
    paymentModel: "stripe_platform_subscription_custom_connect",
    serviceMonth: input.context.serviceMonth,
    stripeTransferId: input.context.batch.stripe_transfer_id,
    payoutBatchId: input.context.batch.id,
    subscriptionChargeIds: input.context.charges.map((charge) => charge.id),
    chargeCount: input.context.charges.length,
    courseBreakdown: input.context.courseBreakdown,
  };
}

async function ensureProviderBatchDocument(input: {
  supabase: SupabaseClient;
  context: LoadedBatchContext;
  documentType: "provider_payout_statement" | "provider_platform_fee_invoice";
  documentScope: "subscription_monthly_payout" | "subscription_monthly_platform_fee";
}): Promise<DocumentFinalizeResult> {
  const isPayoutStatement = input.documentType === "provider_payout_statement";
  const metadataBuilder = isPayoutStatement
    ? buildProviderPayoutStatementDocumentData
    : buildProviderPlatformFeeInvoiceDocumentData;
  const metadata = await metadataBuilder({
    supabase: asTypedSupabase(input.supabase),
    providerId: input.context.providerId,
    offer: {
      title: "Laufende Angebote",
      kind: "course",
      startsAt: input.context.periodStart,
      endsAt: input.context.periodEnd,
    },
    periodStart: input.context.periodStart,
    periodEnd: input.context.periodEnd,
    payoutBatchId: input.context.batch.id,
    stripeTransferId: input.context.batch.stripe_transfer_id,
    currency: input.context.batch.currency,
    grossAmountCents: input.context.batch.gross_amount_cents,
    platformFeeCents: input.context.batch.platform_fee_cents,
    providerPayoutCents: input.context.batch.provider_net_amount_cents,
    metadata: buildBatchMetadata({
      context: input.context,
      documentScope: input.documentScope,
    }),
  });

  const existing = await findExistingDocumentByBatchScope({
    supabase: input.supabase,
    payoutBatchId: input.context.batch.id,
    documentType: input.documentType,
    documentScope: input.documentScope,
  });

  const payload = {
    document_type: input.documentType,
    status: "issued" as const,
    provider_id: input.context.providerId,
    payout_batch_id: input.context.batch.id,
    period_start: input.context.periodStart,
    period_end: input.context.periodEnd,
    currency: normalizeCurrency(input.context.batch.currency),
    gross_amount_cents: input.context.batch.gross_amount_cents,
    platform_fee_cents: input.context.batch.platform_fee_cents,
    provider_payout_cents: isPayoutStatement ? input.context.batch.provider_net_amount_cents : 0,
    metadata: metadata as FinancialDocumentMetadata,
    issued_at: input.context.batch.executed_at ?? new Date().toISOString(),
  };

  const record = existing
    ? await updateExistingDocument({
        supabase: input.supabase,
        documentId: existing.id,
        patch: payload,
      })
    : await createFinancialDocumentRecord(payload, input.supabase);

  return finalizeDocument({ supabase: input.supabase, record });
}

async function ensureCustomerReceiptForCharge(input: {
  supabase: SupabaseClient;
  context: LoadedBatchContext;
  charge: SubscriptionChargeRow;
}): Promise<DocumentFinalizeResult> {
  const contract = input.context.contractById.get(input.charge.subscription_contract_id);
  if (!contract) {
    throw new Error(`Subscription contract missing for charge ${input.charge.id}`);
  }
  const period = input.charge.subscription_period_id
    ? input.context.periodById.get(input.charge.subscription_period_id)
    : null;
  if (!period) {
    throw new Error(`Subscription period missing for charge ${input.charge.id}`);
  }
  const course = input.context.courseById.get(contract.course_id);
  const intent = contract.course_registration_intent_id
    ? input.context.intentById.get(contract.course_registration_intent_id)
    : null;
  const payment = input.charge.payment_transaction_id
    ? input.context.paymentById.get(input.charge.payment_transaction_id)
    : null;
  const customerName = buildFullName(intent?.first_name, intent?.last_name);
  const customerEmail = normalizeText(intent?.email ?? contract.customer_email) || null;
  const isInitialProration = input.charge.charge_type === "initial_proration";

  const metadata = await buildCustomerReceiptDocumentData({
    supabase: asTypedSupabase(input.supabase),
    providerId: contract.teacher_id,
    customer: {
      name: customerName,
      email: customerEmail,
    },
    offer: {
      courseId: contract.course_id,
      title: course?.title ?? null,
      kind: course?.kind ?? null,
      instructorName: course?.instructor_name ?? null,
      startsAt: period.period_start,
      endsAt: period.period_end,
      location: course?.location ?? null,
      locationDetails: course?.location_details ?? null,
    },
    periodStart: period.period_start,
    periodEnd: period.period_end,
    courseId: contract.course_id,
    courseRegistrationIntentId: contract.course_registration_intent_id,
    subscriptionContractId: contract.id,
    paymentTransactionId: input.charge.payment_transaction_id,
    payment: payment
      ? {
          provider: payment.provider,
          providerPaymentId: payment.provider_payment_id,
          providerCheckoutId: payment.provider_checkout_id,
          stripeChargeId: input.charge.stripe_charge_id ?? payment.stripe_charge_id,
          stripePaymentIntentId: input.charge.stripe_payment_intent_id ?? payment.stripe_payment_intent_id,
          status: payment.status,
          paidAt: payment.paid_at ?? input.charge.charged_at,
          createdAt: payment.created_at,
        }
      : {
          provider: input.charge.provider,
          providerPaymentId: input.charge.provider_charge_id,
          providerCheckoutId: null,
          stripeChargeId: input.charge.stripe_charge_id,
          stripePaymentIntentId: input.charge.stripe_payment_intent_id,
          status: input.charge.status,
          paidAt: input.charge.charged_at,
          createdAt: input.charge.created_at,
        },
    currency: input.charge.currency,
    grossAmountCents: input.charge.gross_amount_cents,
    platformFeeCents: 0,
    providerPayoutCents: 0,
    metadata: {
      documentScope: "subscription_monthly_customer_receipt",
      paymentModel: "stripe_platform_subscription_custom_connect",
      serviceMonth: period.service_month,
      subscriptionChargeId: input.charge.id,
      subscriptionPeriodId: period.id,
      subscriptionContractId: contract.id,
      stripeInvoiceId: input.charge.stripe_invoice_id ?? input.charge.provider_invoice_id,
      stripePaymentIntentId: input.charge.stripe_payment_intent_id,
      stripeChargeId: input.charge.stripe_charge_id,
      chargeType: input.charge.charge_type,
      isInitialProration,
      notes: isInitialProration ? ["Anteilig berechneter erster Monat"] : undefined,
    },
  });

  const existing = await findExistingCustomerReceiptForCharge({
    supabase: input.supabase,
    subscriptionChargeId: input.charge.id,
  });

  const payload = {
    document_type: "customer_receipt" as const,
    status: "issued" as const,
    provider_id: contract.teacher_id,
    customer_email: customerEmail,
    course_id: contract.course_id,
    course_registration_intent_id: contract.course_registration_intent_id,
    subscription_contract_id: contract.id,
    subscription_charge_id: input.charge.id,
    payment_transaction_id: input.charge.payment_transaction_id,
    ledger_entry_id: input.charge.ledger_entry_id,
    period_start: period.period_start,
    period_end: period.period_end,
    currency: normalizeCurrency(input.charge.currency),
    gross_amount_cents: input.charge.gross_amount_cents,
    platform_fee_cents: 0,
    provider_payout_cents: 0,
    metadata: metadata as FinancialDocumentMetadata,
    issued_at: input.charge.charged_at ?? payment?.paid_at ?? new Date().toISOString(),
  };

  const record = existing
    ? await updateExistingDocument({
        supabase: input.supabase,
        documentId: existing.id,
        patch: payload,
      })
    : await createFinancialDocumentRecord(payload, input.supabase);

  return finalizeDocument({ supabase: input.supabase, record });
}

export async function ensureSubscriptionMonthlyDocumentsForBatch(input: {
  payoutBatchId: string;
  supabase?: SupabaseClient;
}): Promise<EnsureSubscriptionMonthlyDocumentsForBatchResult> {
  const supabase = input.supabase ?? createSupabaseAdmin();
  const result: EnsureSubscriptionMonthlyDocumentsForBatchResult = {
    payoutBatchId: input.payoutBatchId,
    skipped: false,
    providerPayoutStatement: null,
    providerPlatformFeeInvoice: null,
    customerReceipts: [],
    error: null,
  };

  try {
    const context = await loadBatchContext({ supabase, payoutBatchId: input.payoutBatchId });
    if (!context) {
      return {
        ...result,
        skipped: true,
      };
    }

    const [providerPayoutStatement, providerPlatformFeeInvoice] = await Promise.all([
      ensureProviderBatchDocument({
        supabase,
        context,
        documentType: "provider_payout_statement",
        documentScope: "subscription_monthly_payout",
      }),
      ensureProviderBatchDocument({
        supabase,
        context,
        documentType: "provider_platform_fee_invoice",
        documentScope: "subscription_monthly_platform_fee",
      }),
    ]);

    const customerReceipts: DocumentFinalizeResult[] = [];
    for (const charge of context.charges) {
      customerReceipts.push(await ensureCustomerReceiptForCharge({ supabase, context, charge }));
    }

    return {
      ...result,
      providerPayoutStatement,
      providerPlatformFeeInvoice,
      customerReceipts,
    };
  } catch (error) {
    return {
      ...result,
      error: errorMessage(error),
    };
  }
}

async function loadPendingSubscriptionPayoutBatchIds(input: {
  supabase: SupabaseClient;
  limit: number;
}): Promise<string[]> {
  const scanLimit = input.limit * SUBSCRIPTION_DOCUMENT_SCAN_MULTIPLIER;
  const { data: batches, error } = await input.supabase
    .from("payout_batches")
    .select("id")
    .eq("transfer_type", "subscription_monthly_provider_transfer")
    .eq("status", "paid")
    .not("stripe_transfer_id", "is", null)
    .order("executed_at", { ascending: true, nullsFirst: false })
    .limit(scanLimit)
    .returns<Array<{ id: string }>>();
  if (error) throw error;

  const batchIds = (batches ?? []).map((batch) => batch.id);
  if (batchIds.length === 0) return [];

  const { data: documents, error: documentsError } = await input.supabase
    .from("financial_documents")
    .select("id,document_type,payout_batch_id,metadata,pdf_path")
    .in("payout_batch_id", batchIds)
    .in("document_type", ["provider_payout_statement", "provider_platform_fee_invoice"])
    .returns<Array<Pick<FinancialDocumentRecord, "id" | "document_type" | "payout_batch_id" | "metadata" | "pdf_path">>>();
  if (documentsError) throw documentsError;

  return batchIds
    .filter((batchId) => {
      const batchDocuments = (documents ?? []).filter((document) => document.payout_batch_id === batchId);
      const hasPayout = batchDocuments.some(
        (document) =>
          document.document_type === "provider_payout_statement" &&
          getMetadataObject(document.metadata).documentScope === "subscription_monthly_payout" &&
          document.pdf_path
      );
      const hasFee = batchDocuments.some(
        (document) =>
          document.document_type === "provider_platform_fee_invoice" &&
          getMetadataObject(document.metadata).documentScope === "subscription_monthly_platform_fee" &&
          document.pdf_path
      );
      return !hasPayout || !hasFee;
    })
    .slice(0, input.limit);
}

export async function processSubscriptionMonthlyDocumentsForTransferredBatches(input?: {
  payoutBatchIds?: string[];
  limit?: number;
}): Promise<ProcessSubscriptionMonthlyDocumentsResult> {
  const supabase = createSupabaseAdmin();
  const limit = Math.min(Math.max(1, input?.limit ?? SUBSCRIPTION_DOCUMENT_RETRY_LIMIT), SUBSCRIPTION_DOCUMENT_RETRY_LIMIT);
  const pendingBatchIds = await loadPendingSubscriptionPayoutBatchIds({ supabase, limit });
  const payoutBatchIds = Array.from(new Set([...(input?.payoutBatchIds ?? []), ...pendingBatchIds])).slice(0, limit);

  const results: EnsureSubscriptionMonthlyDocumentsForBatchResult[] = [];
  for (const payoutBatchId of payoutBatchIds) {
    const result = await ensureSubscriptionMonthlyDocumentsForBatch({ payoutBatchId, supabase });
    results.push(result);
    if (result.error) {
      console.warn("[subscription-monthly-documents] batch failed", result);
    }
  }

  return {
    consideredCount: payoutBatchIds.length,
    processedCount: results.filter((result) => !result.skipped && !result.error).length,
    failedCount: results.filter((result) => Boolean(result.error)).length,
    results,
  };
}

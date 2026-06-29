import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCustomerReceiptDocumentData,
  buildPlatformRevenueStatementDocumentData,
  buildProviderPayoutStatementDocumentData,
  buildProviderPlatformFeeInvoiceDocumentData,
} from "@/lib/documents/document-data";
import {
  createFinancialDocumentRecord,
  ensureFinancialDocumentPdfAsset,
} from "@/lib/documents/financial-documents";
import type { DocumentType, FinancialDocumentRecord } from "@/lib/documents/types";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type PaymentTransactionDocumentRow = {
  id: string;
  booking_id: string | null;
  course_registration_intent_id: string | null;
  subscription_contract_id: string | null;
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

type BookingDocumentRow = {
  id: string;
  course_id: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  customer_billing_name: string | null;
  customer_billing_street: string | null;
  customer_billing_house_number: string | null;
  customer_billing_postal_code: string | null;
  customer_billing_city: string | null;
  customer_billing_country: string | null;
  created_at: string;
};

type CourseRegistrationIntentDocumentRow = {
  id: string;
  course_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  subscription_contract_id: string | null;
};

type SubscriptionContractDocumentRow = {
  id: string;
  course_registration_intent_id: string | null;
  course_id: string;
  teacher_id: string;
  customer_email: string;
};

type CourseDocumentRow = {
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

type LedgerEntryDocumentRow = {
  id: string;
  source_type: string;
  source_id: string;
  gross_amount_cents: number;
  platform_fee_cents: number;
  net_amount_cents: number;
  currency: string;
  payout_status: string;
  payout_batch_id: string | null;
  subscription_contract_id: string | null;
  service_period_start: string | null;
  service_period_end: string | null;
};

type PayoutItemDocumentRow = {
  id: string;
  payout_batch_id: string;
  ledger_entry_id: string;
};

type EnsureCustomerReceiptResult = {
  documentId: string;
  record: FinancialDocumentRecord;
  pdfPath: string | null;
  pdfGenerated: boolean;
  pdfWarning: string | null;
};

type EnsureProviderPayoutDocumentsResult = {
  providerPayoutStatementDocumentId: string;
  providerPayoutStatementPdfPath: string | null;
  providerPayoutStatementPdfGenerated: boolean;
  providerPayoutStatementPdfWarning: string | null;
  providerPlatformFeeInvoiceDocumentId: string;
  providerPlatformFeeInvoicePdfPath: string | null;
  providerPlatformFeeInvoicePdfGenerated: boolean;
  providerPlatformFeeInvoicePdfWarning: string | null;
  platformRevenueStatementDocumentId: string;
  platformRevenueStatementPdfPath: string | null;
  platformRevenueStatementPdfGenerated: boolean;
  platformRevenueStatementPdfWarning: string | null;
};

type LoadedDocumentContext = {
  paymentTransaction: PaymentTransactionDocumentRow | null;
  booking: BookingDocumentRow | null;
  intent: CourseRegistrationIntentDocumentRow | null;
  subscriptionContract: SubscriptionContractDocumentRow | null;
  course: CourseDocumentRow | null;
  providerId: string | null;
  courseId: string | null;
  courseRegistrationIntentId: string | null;
  bookingId: string | null;
  subscriptionContractId: string | null;
  customerName: string | null;
  customerEmail: string | null;
};

function getAdminSupabase(): SupabaseClient {
  return createSupabaseAdmin();
}

function asTypedSupabase(client: SupabaseClient): SupabaseClient<Database> {
  return client as SupabaseClient<Database>;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function buildFullName(firstName: string | null | undefined, lastName: string | null | undefined): string | null {
  const fullName = [normalizeOptionalText(firstName), normalizeOptionalText(lastName)].filter(Boolean).join(" ").trim();
  return fullName || null;
}

async function finalizeFinancialDocumentRecord(input: {
  supabase: SupabaseClient;
  record: FinancialDocumentRecord;
}): Promise<{
  record: FinancialDocumentRecord;
  pdfPath: string | null;
  pdfGenerated: boolean;
  pdfWarning: string | null;
}> {
  const pdfResult = await ensureFinancialDocumentPdfAsset(input.record, input.supabase);

  return {
    record: pdfResult.record,
    pdfPath: pdfResult.pdfPath,
    pdfGenerated: pdfResult.pdfGenerated,
    pdfWarning: pdfResult.warning,
  };
}

async function findExistingFinancialDocumentByColumn(input: {
  supabase: SupabaseClient;
  documentType: DocumentType;
  column: "payment_transaction_id" | "ledger_entry_id" | "payout_item_id";
  value: string | null;
}): Promise<FinancialDocumentRecord | null> {
  if (!input.value) {
    return null;
  }

  const { data, error } = await input.supabase
    .from("financial_documents")
    .select("*")
    .eq("document_type", input.documentType)
    .eq(input.column, input.value)
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<FinancialDocumentRecord[]>();

  if (error) {
    throw error;
  }

  return data?.[0] ?? null;
}

async function loadDocumentContext(input: {
  supabase: SupabaseClient;
  paymentTransactionId?: string | null;
  bookingId?: string | null;
  courseRegistrationIntentId?: string | null;
  subscriptionContractId?: string | null;
  courseId?: string | null;
}): Promise<LoadedDocumentContext> {
  const supabase = input.supabase;
  const paymentTransaction =
    input.paymentTransactionId
      ? (
          await supabase
            .from("payment_transactions")
            .select("id,booking_id,course_registration_intent_id,subscription_contract_id,provider,provider_payment_id,provider_checkout_id,stripe_charge_id,stripe_payment_intent_id,amount_cents,currency,status,paid_at,created_at")
            .eq("id", input.paymentTransactionId)
            .maybeSingle<PaymentTransactionDocumentRow>()
        ).data ?? null
      : null;

  const bookingId = input.bookingId ?? paymentTransaction?.booking_id ?? null;
  const subscriptionContractId =
    input.subscriptionContractId ?? paymentTransaction?.subscription_contract_id ?? null;

  const subscriptionContract =
    subscriptionContractId
      ? (
          await supabase
            .from("subscription_contracts")
            .select("id,course_registration_intent_id,course_id,teacher_id,customer_email")
            .eq("id", subscriptionContractId)
            .maybeSingle<SubscriptionContractDocumentRow>()
        ).data ?? null
      : null;

  const courseRegistrationIntentId =
    input.courseRegistrationIntentId ??
    paymentTransaction?.course_registration_intent_id ??
    subscriptionContract?.course_registration_intent_id ??
    null;

  const [booking, intent] = await Promise.all([
    bookingId
      ? supabase
          .from("bookings")
          .select("id,course_id,customer_first_name,customer_last_name,customer_email,customer_billing_name,customer_billing_street,customer_billing_house_number,customer_billing_postal_code,customer_billing_city,customer_billing_country,created_at")
          .eq("id", bookingId)
          .maybeSingle<BookingDocumentRow>()
      : Promise.resolve({ data: null as BookingDocumentRow | null, error: null }),
    courseRegistrationIntentId
      ? supabase
          .from("course_registration_intents")
          .select("id,course_id,first_name,last_name,email,subscription_contract_id")
          .eq("id", courseRegistrationIntentId)
          .maybeSingle<CourseRegistrationIntentDocumentRow>()
      : Promise.resolve({ data: null as CourseRegistrationIntentDocumentRow | null, error: null }),
  ]);

  if (booking.error) throw booking.error;
  if (intent.error) throw intent.error;

  const courseId =
    input.courseId ??
    booking.data?.course_id ??
    intent.data?.course_id ??
    subscriptionContract?.course_id ??
    null;

  const course =
    courseId
      ? (
          await supabase
            .from("courses")
            .select("id,title,kind,instructor_name,teacher_id,starts_at,ends_at,location,location_details")
            .eq("id", courseId)
            .maybeSingle<CourseDocumentRow>()
        ).data ?? null
      : null;

  return {
    paymentTransaction,
    booking: booking.data ?? null,
    intent: intent.data ?? null,
    subscriptionContract,
    course,
    providerId: course?.teacher_id ?? subscriptionContract?.teacher_id ?? null,
    courseId,
    courseRegistrationIntentId,
    bookingId,
    subscriptionContractId: subscriptionContract?.id ?? subscriptionContractId ?? null,
    customerName:
      buildFullName(booking.data?.customer_first_name, booking.data?.customer_last_name) ??
      buildFullName(intent.data?.first_name, intent.data?.last_name),
    customerEmail:
      normalizeOptionalText(booking.data?.customer_email) ??
      normalizeOptionalText(intent.data?.email) ??
      normalizeOptionalText(subscriptionContract?.customer_email),
  };
}

export async function ensureCustomerReceiptForPayment(input: {
  paymentTransactionId: string;
  supabase?: SupabaseClient;
}): Promise<EnsureCustomerReceiptResult> {
  const supabase = input.supabase ?? getAdminSupabase();
  const existing = await findExistingFinancialDocumentByColumn({
    supabase,
    documentType: "customer_receipt",
    column: "payment_transaction_id",
    value: input.paymentTransactionId,
  });

  if (existing) {
    const finalized = await finalizeFinancialDocumentRecord({
      supabase,
      record: existing,
    });

    return {
      documentId: finalized.record.id,
      record: finalized.record,
      pdfPath: finalized.pdfPath,
      pdfGenerated: finalized.pdfGenerated,
      pdfWarning: finalized.pdfWarning,
    };
  }

  const context = await loadDocumentContext({
    supabase,
    paymentTransactionId: input.paymentTransactionId,
  });

  if (!context.paymentTransaction) {
    throw new Error(`Payment transaction not found for customer receipt: ${input.paymentTransactionId}`);
  }

  const { count: guestCount } = context.bookingId
    ? await supabase
        .from("workshop_booking_guests")
        .select("id", { count: "exact", head: true })
        .eq("booking_id", context.bookingId)
    : { count: 0 };
  const bookedSeatCount = context.bookingId ? 1 + Math.max(0, guestCount ?? 0) : null;

  const metadata = await buildCustomerReceiptDocumentData({
    supabase: asTypedSupabase(supabase),
    providerId: context.providerId,
    customer: {
      name: context.customerName,
      email: context.customerEmail,
      billingName: context.booking?.customer_billing_name ?? null,
      billingStreet: context.booking?.customer_billing_street ?? null,
      billingHouseNumber: context.booking?.customer_billing_house_number ?? null,
      billingPostalCode: context.booking?.customer_billing_postal_code ?? null,
      billingCity: context.booking?.customer_billing_city ?? null,
      billingCountry: context.booking?.customer_billing_country ?? null,
    },
    offer: {
      courseId: context.courseId,
      title: context.course?.title ?? null,
      kind: context.course?.kind ?? null,
      instructorName: context.course?.instructor_name ?? null,
      startsAt: context.course?.starts_at ?? null,
      endsAt: context.course?.ends_at ?? null,
      location: context.course?.location ?? null,
      locationDetails: context.course?.location_details ?? null,
      seatCount: bookedSeatCount,
    },
    periodStart: context.course?.starts_at ?? null,
    periodEnd: context.course?.ends_at ?? context.course?.starts_at ?? null,
    bookingId: context.bookingId,
    bookingCreatedAt: context.booking?.created_at ?? null,
    courseId: context.courseId,
    courseRegistrationIntentId: context.courseRegistrationIntentId,
    subscriptionContractId: context.subscriptionContractId,
    paymentTransactionId: context.paymentTransaction.id,
    payment: {
      provider: context.paymentTransaction.provider,
      providerPaymentId: context.paymentTransaction.provider_payment_id,
      providerCheckoutId: context.paymentTransaction.provider_checkout_id,
      stripeChargeId: context.paymentTransaction.stripe_charge_id,
      stripePaymentIntentId: context.paymentTransaction.stripe_payment_intent_id,
      status: context.paymentTransaction.status,
      paidAt: context.paymentTransaction.paid_at,
      createdAt: context.paymentTransaction.created_at,
    },
    currency: context.paymentTransaction.currency,
    grossAmountCents: context.paymentTransaction.amount_cents,
    platformFeeCents: 0,
    providerPayoutCents: 0,
  });

  const record = await createFinancialDocumentRecord({
    document_type: "customer_receipt",
    status: "issued",
    provider_id: context.providerId,
    customer_email: context.customerEmail,
    booking_id: context.bookingId,
    course_id: context.courseId,
    course_registration_intent_id: context.courseRegistrationIntentId,
    subscription_contract_id: context.subscriptionContractId,
    payment_transaction_id: context.paymentTransaction.id,
    currency: context.paymentTransaction.currency,
    gross_amount_cents: context.paymentTransaction.amount_cents,
    platform_fee_cents: 0,
    provider_payout_cents: 0,
    metadata,
    issued_at: context.paymentTransaction.paid_at ?? new Date().toISOString(),
  });

  const finalized = await finalizeFinancialDocumentRecord({
    supabase,
    record,
  });

  return {
    documentId: finalized.record.id,
    record: finalized.record,
    pdfPath: finalized.pdfPath,
    pdfGenerated: finalized.pdfGenerated,
    pdfWarning: finalized.pdfWarning,
  };
}

async function ensureProviderPayoutDocumentRecord(input: {
  supabase: SupabaseClient;
  documentType: "provider_payout_statement" | "provider_platform_fee_invoice";
  ledgerEntry: LedgerEntryDocumentRow;
  payoutItemId: string | null;
  payoutBatchId: string | null;
  context: LoadedDocumentContext;
}): Promise<FinancialDocumentRecord> {
  const existing =
    (await findExistingFinancialDocumentByColumn({
      supabase: input.supabase,
      documentType: input.documentType,
      column: "payout_item_id",
      value: input.payoutItemId,
    })) ??
    (await findExistingFinancialDocumentByColumn({
      supabase: input.supabase,
      documentType: input.documentType,
      column: "ledger_entry_id",
      value: input.ledgerEntry.id,
    }));

  if (existing) {
    return existing;
  }

  const metadataBuilder =
    input.documentType === "provider_payout_statement"
      ? buildProviderPayoutStatementDocumentData
      : buildProviderPlatformFeeInvoiceDocumentData;

  const metadata = await metadataBuilder({
    supabase: asTypedSupabase(input.supabase),
    providerId: input.context.providerId,
    customer: {
      name: input.context.customerName,
      email: input.context.customerEmail,
    },
    offer: {
      courseId: input.context.courseId,
      title: input.context.course?.title ?? null,
      kind: input.context.course?.kind ?? null,
      instructorName: input.context.course?.instructor_name ?? null,
      startsAt: input.context.course?.starts_at ?? null,
      endsAt: input.context.course?.ends_at ?? null,
      location: input.context.course?.location ?? null,
      locationDetails: input.context.course?.location_details ?? null,
    },
    periodStart: input.ledgerEntry.service_period_start,
    periodEnd: input.ledgerEntry.service_period_end,
    bookingId: input.context.bookingId,
    bookingCreatedAt: input.context.booking?.created_at ?? null,
    courseId: input.context.courseId,
    courseRegistrationIntentId: input.context.courseRegistrationIntentId,
    subscriptionContractId: input.context.subscriptionContractId,
    payoutBatchId: input.payoutBatchId,
    payoutItemId: input.payoutItemId,
    paymentTransactionId: input.context.paymentTransaction?.id ?? null,
    payment: input.context.paymentTransaction
      ? {
          provider: input.context.paymentTransaction.provider,
          providerPaymentId: input.context.paymentTransaction.provider_payment_id,
          providerCheckoutId: input.context.paymentTransaction.provider_checkout_id,
          stripeChargeId: input.context.paymentTransaction.stripe_charge_id,
          stripePaymentIntentId: input.context.paymentTransaction.stripe_payment_intent_id,
          status: input.context.paymentTransaction.status,
          paidAt: input.context.paymentTransaction.paid_at,
          createdAt: input.context.paymentTransaction.created_at,
        }
      : null,
    ledgerEntryId: input.ledgerEntry.id,
    currency: input.ledgerEntry.currency,
    grossAmountCents: input.ledgerEntry.gross_amount_cents,
    platformFeeCents: input.ledgerEntry.platform_fee_cents,
    providerPayoutCents: input.ledgerEntry.net_amount_cents,
  });

  return createFinancialDocumentRecord({
    document_type: input.documentType,
    status: "issued",
    provider_id: input.context.providerId,
    customer_email: input.context.customerEmail,
    booking_id: input.context.bookingId,
    course_id: input.context.courseId,
    course_registration_intent_id: input.context.courseRegistrationIntentId,
    subscription_contract_id: input.context.subscriptionContractId,
    payout_batch_id: input.payoutBatchId,
    payout_item_id: input.payoutItemId,
    payment_transaction_id: input.context.paymentTransaction?.id ?? null,
    ledger_entry_id: input.ledgerEntry.id,
    period_start: input.ledgerEntry.service_period_start,
    period_end: input.ledgerEntry.service_period_end,
    currency: input.ledgerEntry.currency,
    gross_amount_cents: input.ledgerEntry.gross_amount_cents,
    platform_fee_cents: input.ledgerEntry.platform_fee_cents,
    provider_payout_cents: input.ledgerEntry.net_amount_cents,
    metadata,
    issued_at: new Date().toISOString(),
  });
}

export async function ensurePlatformRevenueDocumentForLedgerEntry(input: {
  ledgerEntryId: string;
  supabase?: SupabaseClient;
}): Promise<FinancialDocumentRecord> {
  const supabase = input.supabase ?? getAdminSupabase();
  const { data: ledgerEntry, error: ledgerError } = await supabase
    .from("ledger_entries")
    .select(
      "id,source_type,source_id,gross_amount_cents,platform_fee_cents,net_amount_cents,currency,payout_status,payout_batch_id,subscription_contract_id,service_period_start,service_period_end"
    )
    .eq("id", input.ledgerEntryId)
    .maybeSingle<LedgerEntryDocumentRow>();

  if (ledgerError) throw ledgerError;
  if (!ledgerEntry?.id) {
    throw new Error(`Ledger entry not found for platform revenue document: ${input.ledgerEntryId}`);
  }

  const paymentTransactionId = ledgerEntry.source_type === "payment_transaction" ? ledgerEntry.source_id : null;
  const existing =
    (await findExistingFinancialDocumentByColumn({
      supabase,
      documentType: "platform_revenue_statement",
      column: "ledger_entry_id",
      value: ledgerEntry.id,
    })) ??
    (await findExistingFinancialDocumentByColumn({
      supabase,
      documentType: "platform_revenue_statement",
      column: "payment_transaction_id",
      value: paymentTransactionId,
    }));

  if (existing) {
    return existing;
  }

  const context = await loadDocumentContext({
    supabase,
    paymentTransactionId,
    subscriptionContractId: ledgerEntry.subscription_contract_id,
  });

  const metadata = await buildPlatformRevenueStatementDocumentData({
    supabase: asTypedSupabase(supabase),
    providerId: context.providerId,
    customer: {
      name: context.customerName,
      email: context.customerEmail,
    },
    offer: {
      courseId: context.courseId,
      title: context.course?.title ?? null,
      kind: context.course?.kind ?? null,
      instructorName: context.course?.instructor_name ?? null,
      startsAt: context.course?.starts_at ?? null,
      endsAt: context.course?.ends_at ?? null,
      location: context.course?.location ?? null,
      locationDetails: context.course?.location_details ?? null,
    },
    periodStart: ledgerEntry.service_period_start,
    periodEnd: ledgerEntry.service_period_end,
    bookingId: context.bookingId,
    bookingCreatedAt: context.booking?.created_at ?? null,
    courseId: context.courseId,
    courseRegistrationIntentId: context.courseRegistrationIntentId,
    subscriptionContractId: context.subscriptionContractId,
    paymentTransactionId,
    payment: context.paymentTransaction
      ? {
          provider: context.paymentTransaction.provider,
          providerPaymentId: context.paymentTransaction.provider_payment_id,
          providerCheckoutId: context.paymentTransaction.provider_checkout_id,
          stripeChargeId: context.paymentTransaction.stripe_charge_id,
          stripePaymentIntentId: context.paymentTransaction.stripe_payment_intent_id,
          status: context.paymentTransaction.status,
          paidAt: context.paymentTransaction.paid_at,
          createdAt: context.paymentTransaction.created_at,
        }
      : null,
    ledgerEntryId: ledgerEntry.id,
    currency: ledgerEntry.currency,
    grossAmountCents: ledgerEntry.gross_amount_cents,
    platformFeeCents: ledgerEntry.platform_fee_cents,
    providerPayoutCents: ledgerEntry.net_amount_cents,
  });

  return createFinancialDocumentRecord({
    document_type: "platform_revenue_statement",
    status: "issued",
    provider_id: context.providerId,
    customer_email: context.customerEmail,
    booking_id: context.bookingId,
    course_id: context.courseId,
    course_registration_intent_id: context.courseRegistrationIntentId,
    subscription_contract_id: context.subscriptionContractId,
    payment_transaction_id: paymentTransactionId,
    ledger_entry_id: ledgerEntry.id,
    period_start: ledgerEntry.service_period_start,
    period_end: ledgerEntry.service_period_end,
    currency: ledgerEntry.currency,
    gross_amount_cents: ledgerEntry.gross_amount_cents,
    platform_fee_cents: ledgerEntry.platform_fee_cents,
    provider_payout_cents: ledgerEntry.net_amount_cents,
    metadata,
    issued_at: new Date().toISOString(),
  });
}

export async function ensureProviderPayoutDocumentsForLedgerEntry(input: {
  ledgerEntryId: string;
  supabase?: SupabaseClient;
}): Promise<EnsureProviderPayoutDocumentsResult> {
  const supabase = input.supabase ?? getAdminSupabase();
  const { data: ledgerEntry, error: ledgerError } = await supabase
    .from("ledger_entries")
    .select(
      "id,source_type,source_id,gross_amount_cents,platform_fee_cents,net_amount_cents,currency,payout_status,payout_batch_id,subscription_contract_id,service_period_start,service_period_end"
    )
    .eq("id", input.ledgerEntryId)
    .maybeSingle<LedgerEntryDocumentRow>();

  if (ledgerError) throw ledgerError;
  if (!ledgerEntry?.id) {
    throw new Error(`Ledger entry not found for payout documents: ${input.ledgerEntryId}`);
  }

  const { data: payoutItem, error: payoutItemError } = await supabase
    .from("payout_items")
    .select("id,payout_batch_id,ledger_entry_id")
    .eq("ledger_entry_id", ledgerEntry.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<PayoutItemDocumentRow>();

  if (payoutItemError) throw payoutItemError;

  const paymentTransactionId = ledgerEntry.source_type === "payment_transaction" ? ledgerEntry.source_id : null;
  const payoutBatchId = payoutItem?.payout_batch_id ?? ledgerEntry.payout_batch_id ?? null;
  const context = await loadDocumentContext({
    supabase,
    paymentTransactionId,
    subscriptionContractId: ledgerEntry.subscription_contract_id,
  });

  const [providerPayoutStatement, providerPlatformFeeInvoice, platformRevenueStatement] = await Promise.all([
    ensureProviderPayoutDocumentRecord({
      supabase,
      documentType: "provider_payout_statement",
      ledgerEntry,
      payoutItemId: payoutItem?.id ?? null,
      payoutBatchId,
      context,
    }),
    ensureProviderPayoutDocumentRecord({
      supabase,
      documentType: "provider_platform_fee_invoice",
      ledgerEntry,
      payoutItemId: payoutItem?.id ?? null,
      payoutBatchId,
      context,
    }),
    ensurePlatformRevenueDocumentForLedgerEntry({
      ledgerEntryId: ledgerEntry.id,
      supabase,
    }),
  ]);

  const [providerPayoutStatementFinalized, providerPlatformFeeInvoiceFinalized, platformRevenueStatementFinalized] =
    await Promise.all([
      finalizeFinancialDocumentRecord({
        supabase,
        record: providerPayoutStatement,
      }),
      finalizeFinancialDocumentRecord({
        supabase,
        record: providerPlatformFeeInvoice,
      }),
      finalizeFinancialDocumentRecord({
        supabase,
        record: platformRevenueStatement,
      }),
    ]);

  return {
    providerPayoutStatementDocumentId: providerPayoutStatementFinalized.record.id,
    providerPayoutStatementPdfPath: providerPayoutStatementFinalized.pdfPath,
    providerPayoutStatementPdfGenerated: providerPayoutStatementFinalized.pdfGenerated,
    providerPayoutStatementPdfWarning: providerPayoutStatementFinalized.pdfWarning,
    providerPlatformFeeInvoiceDocumentId: providerPlatformFeeInvoiceFinalized.record.id,
    providerPlatformFeeInvoicePdfPath: providerPlatformFeeInvoiceFinalized.pdfPath,
    providerPlatformFeeInvoicePdfGenerated: providerPlatformFeeInvoiceFinalized.pdfGenerated,
    providerPlatformFeeInvoicePdfWarning: providerPlatformFeeInvoiceFinalized.pdfWarning,
    platformRevenueStatementDocumentId: platformRevenueStatementFinalized.record.id,
    platformRevenueStatementPdfPath: platformRevenueStatementFinalized.pdfPath,
    platformRevenueStatementPdfGenerated: platformRevenueStatementFinalized.pdfGenerated,
    platformRevenueStatementPdfWarning: platformRevenueStatementFinalized.pdfWarning,
  };
}

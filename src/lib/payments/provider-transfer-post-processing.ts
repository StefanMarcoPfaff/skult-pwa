import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendCustomerReceiptEmail } from "@/lib/customer-receipt-emails";
import {
  ensureCustomerReceiptForPayment,
  ensureProviderPayoutDocumentsForLedgerEntry,
} from "@/lib/documents/simulation-documents";
import { sendProviderPayoutReceivedEmail } from "@/lib/provider-payout-emails";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const POST_TRANSFER_RETRY_LIMIT = 25;
const POST_TRANSFER_SCAN_MULTIPLIER = 10;

type LedgerEntryRow = {
  id: string;
  provider_payout_profile_id: string | null;
  source_id: string;
  gross_amount_cents: number;
  platform_fee_cents: number;
  net_amount_cents: number;
  currency: string;
  payout_status: string;
  stripe_transfer_id: string | null;
};

type PaymentTransactionRow = {
  id: string;
  booking_id: string | null;
  status: string;
};

type ProviderPayoutProfileRow = {
  id: string;
  teacher_id: string | null;
};

type BookingRow = {
  id: string;
  course_id: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
};

type CourseRow = {
  id: string;
  title: string | null;
  kind: string | null;
};

type FinancialDocumentMailStateRow = {
  id: string;
  document_type: string;
  ledger_entry_id: string | null;
  payment_transaction_id: string | null;
  customer_email: string | null;
  sent_at: string | null;
  metadata: Record<string, unknown>;
};

type TransferContext = {
  ledgerEntry: LedgerEntryRow;
  paymentTransaction: PaymentTransactionRow;
  providerPayoutProfile: ProviderPayoutProfileRow | null;
  booking: BookingRow | null;
  course: CourseRow | null;
  providerEmail: string | null;
  seatCount: number;
};

export type ProviderTransferPostProcessingResult = {
  ledgerEntryId: string;
  paymentTransactionId: string | null;
  providerDocumentsGenerated: boolean;
  providerEmailSent: boolean;
  customerReceiptGenerated: boolean;
  customerReceiptEmailSent: boolean;
  skipped: boolean;
  error: string | null;
};

export type ProcessProviderTransferPostProcessingResult = {
  consideredCount: number;
  processedCount: number;
  failedCount: number;
  results: ProviderTransferPostProcessingResult[];
};

function normalizeCurrency(currency: string | null | undefined): string {
  return (currency ?? "EUR").trim().toUpperCase() || "EUR";
}

function buildFullName(firstName: string | null | undefined, lastName: string | null | undefined): string | null {
  const fullName = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ").trim();
  return fullName || null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadTransferContext(input: {
  ledgerEntryId: string;
  supabase: SupabaseClient;
}): Promise<TransferContext | null> {
  const { data: ledgerEntry, error: ledgerError } = await input.supabase
    .from("ledger_entries")
    .select(
      "id,provider_payout_profile_id,source_id,gross_amount_cents,platform_fee_cents,net_amount_cents,currency,payout_status,stripe_transfer_id"
    )
    .eq("id", input.ledgerEntryId)
    .eq("entry_type", "payment")
    .eq("source_type", "payment_transaction")
    .maybeSingle<LedgerEntryRow>();

  if (ledgerError) throw ledgerError;
  if (
    !ledgerEntry?.id ||
    ledgerEntry.payout_status !== "transfer_created" ||
    !ledgerEntry.stripe_transfer_id
  ) {
    return null;
  }

  const [{ data: paymentTransaction, error: paymentError }, { data: providerPayoutProfile, error: profileError }] =
    await Promise.all([
      input.supabase
        .from("payment_transactions")
        .select("id,booking_id,status")
        .eq("id", ledgerEntry.source_id)
        .maybeSingle<PaymentTransactionRow>(),
      ledgerEntry.provider_payout_profile_id
        ? input.supabase
            .from("provider_payout_profiles")
            .select("id,teacher_id")
            .eq("id", ledgerEntry.provider_payout_profile_id)
            .maybeSingle<ProviderPayoutProfileRow>()
        : Promise.resolve({ data: null as ProviderPayoutProfileRow | null, error: null }),
    ]);

  if (paymentError) throw paymentError;
  if (profileError) throw profileError;
  if (!paymentTransaction?.id || paymentTransaction.status !== "paid") {
    return null;
  }

  const { data: booking, error: bookingError } = paymentTransaction.booking_id
    ? await input.supabase
        .from("bookings")
        .select("id,course_id,customer_first_name,customer_last_name,customer_email")
        .eq("id", paymentTransaction.booking_id)
        .maybeSingle<BookingRow>()
    : { data: null as BookingRow | null, error: null };
  if (bookingError) throw bookingError;

  const { data: course, error: courseError } = booking?.course_id
    ? await input.supabase
        .from("courses")
        .select("id,title,kind")
        .eq("id", booking.course_id)
        .maybeSingle<CourseRow>()
    : { data: null as CourseRow | null, error: null };
  if (courseError) throw courseError;
  if (course?.kind !== "workshop" && course?.kind !== "exclusive_offer") {
    return null;
  }

  const { count: guestCount, error: guestCountError } = booking?.id
    ? await input.supabase
        .from("workshop_booking_guests")
        .select("id", { count: "exact", head: true })
        .eq("booking_id", booking.id)
    : { count: 0, error: null };
  if (guestCountError) throw guestCountError;

  const providerEmail = providerPayoutProfile?.teacher_id
    ? (await input.supabase.auth.admin.getUserById(providerPayoutProfile.teacher_id)).data.user?.email?.trim() ?? null
    : null;

  return {
    ledgerEntry,
    paymentTransaction,
    providerPayoutProfile: providerPayoutProfile ?? null,
    booking: booking ?? null,
    course: course ?? null,
    providerEmail,
    seatCount: 1 + Math.max(0, guestCount ?? 0),
  };
}

async function findFinancialDocumentById(input: {
  documentId: string;
  supabase: SupabaseClient;
}): Promise<FinancialDocumentMailStateRow | null> {
  const { data, error } = await input.supabase
    .from("financial_documents")
    .select("id,document_type,ledger_entry_id,payment_transaction_id,customer_email,sent_at,metadata")
    .eq("id", input.documentId)
    .maybeSingle<FinancialDocumentMailStateRow>();

  if (error) throw error;
  return data ?? null;
}

async function claimDocumentMail(input: {
  documentId: string;
  sentAt: string;
  supabase: SupabaseClient;
}): Promise<boolean> {
  const { data, error } = await input.supabase
    .from("financial_documents")
    .update({ sent_at: input.sentAt } as never)
    .eq("id", input.documentId)
    .is("sent_at", null)
    .select("id")
    .limit(1);

  if (error) throw error;
  return Boolean(data && data.length > 0);
}

async function markDocumentMailError(input: {
  documentIds: string[];
  sentAt: string;
  message: string;
  supabase: SupabaseClient;
}) {
  for (const documentId of input.documentIds) {
    const document = await findFinancialDocumentById({ documentId, supabase: input.supabase });
    if (!document) continue;

    await input.supabase
      .from("financial_documents")
      .update({
        sent_at: null,
        metadata: {
          ...(document.metadata ?? {}),
          postTransferMailError: input.message,
          postTransferMailErrorAt: new Date().toISOString(),
        },
      } as never)
      .eq("id", documentId)
      .eq("sent_at", input.sentAt);
  }
}

async function clearDocumentMailError(input: {
  documentIds: string[];
  sentAt: string;
  supabase: SupabaseClient;
}) {
  for (const documentId of input.documentIds) {
    const document = await findFinancialDocumentById({ documentId, supabase: input.supabase });
    if (!document) continue;

    const { postTransferMailError, postTransferMailErrorAt, ...metadata } = document.metadata ?? {};
    if (!postTransferMailError && !postTransferMailErrorAt) continue;

    await input.supabase
      .from("financial_documents")
      .update({
        metadata,
      } as never)
      .eq("id", documentId)
      .eq("sent_at", input.sentAt);
  }
}

async function sendProviderEmailOnce(input: {
  context: TransferContext;
  providerPayoutStatementDocumentId: string;
  providerPlatformFeeInvoiceDocumentId: string;
  supabase: SupabaseClient;
}): Promise<boolean> {
  if (!input.context.providerEmail) return false;

  const [statement, invoice] = await Promise.all([
    findFinancialDocumentById({
      documentId: input.providerPayoutStatementDocumentId,
      supabase: input.supabase,
    }),
    findFinancialDocumentById({
      documentId: input.providerPlatformFeeInvoiceDocumentId,
      supabase: input.supabase,
    }),
  ]);
  if (!statement || !invoice) return false;
  if (statement.sent_at && invoice.sent_at) return false;

  if (statement.sent_at && !invoice.sent_at) {
    await claimDocumentMail({
      documentId: invoice.id,
      sentAt: statement.sent_at,
      supabase: input.supabase,
    });
    console.warn("[provider-transfer-post-processing] repaired provider invoice sent_at from statement", {
      ledgerEntryId: input.context.ledgerEntry.id,
      providerPayoutStatementDocumentId: statement.id,
      providerPlatformFeeInvoiceDocumentId: invoice.id,
    });
    return false;
  }

  if (!statement.sent_at && invoice.sent_at) {
    await claimDocumentMail({
      documentId: statement.id,
      sentAt: invoice.sent_at,
      supabase: input.supabase,
    });
    console.warn("[provider-transfer-post-processing] repaired provider statement sent_at from invoice", {
      ledgerEntryId: input.context.ledgerEntry.id,
      providerPayoutStatementDocumentId: statement.id,
      providerPlatformFeeInvoiceDocumentId: invoice.id,
    });
    return false;
  }

  const sentAt = new Date().toISOString();
  const claimed = await claimDocumentMail({
    documentId: statement.id,
    sentAt,
    supabase: input.supabase,
  });
  if (!claimed) return false;

  const invoiceClaimed = await claimDocumentMail({
    documentId: invoice.id,
    sentAt,
    supabase: input.supabase,
  });
  if (!invoiceClaimed) {
    await markDocumentMailError({
      documentIds: [statement.id],
      sentAt,
      message: "Provider platform fee invoice mail claim failed.",
      supabase: input.supabase,
    });
    return false;
  }
  const claimedDocumentIds = [
    statement.id,
    invoice.id,
  ];

  try {
    const result = await sendProviderPayoutReceivedEmail({
      to: input.context.providerEmail,
      payoutAmountCents: Math.max(0, input.context.ledgerEntry.net_amount_cents),
      currency: normalizeCurrency(input.context.ledgerEntry.currency),
      payoutBatchId: null,
      payoutItemId: null,
      ledgerEntryId: input.context.ledgerEntry.id,
      offerTitle: input.context.course?.title ?? null,
      seatCount: input.context.seatCount,
      grossAmountCents: Math.max(0, input.context.ledgerEntry.gross_amount_cents),
      platformFeeCents: Math.max(0, input.context.ledgerEntry.platform_fee_cents),
      requireAttachments: true,
    });

    if (result?.error) throw result.error;
    await clearDocumentMailError({
      documentIds: claimedDocumentIds,
      sentAt,
      supabase: input.supabase,
    });
    return true;
  } catch (error) {
    await markDocumentMailError({
      documentIds: claimedDocumentIds,
      sentAt,
      message: errorMessage(error),
      supabase: input.supabase,
    });
    throw error;
  }
}

async function sendCustomerReceiptOnce(input: {
  context: TransferContext;
  customerReceiptDocumentId: string;
  supabase: SupabaseClient;
}): Promise<boolean> {
  const receipt = await findFinancialDocumentById({
    documentId: input.customerReceiptDocumentId,
    supabase: input.supabase,
  });
  if (!receipt || receipt.sent_at) return false;

  const customerEmail = input.context.booking?.customer_email?.trim() || receipt.customer_email?.trim() || null;
  if (!customerEmail) return false;

  const sentAt = new Date().toISOString();
  const claimed = await claimDocumentMail({
    documentId: receipt.id,
    sentAt,
    supabase: input.supabase,
  });
  if (!claimed) return false;

  try {
    const result = await sendCustomerReceiptEmail({
      to: customerEmail,
      customerName: buildFullName(input.context.booking?.customer_first_name, input.context.booking?.customer_last_name),
      offerTitle: input.context.course?.title ?? null,
      bookingId: input.context.booking?.id ?? null,
      paymentTransactionId: input.context.paymentTransaction.id,
    });

    if (result?.error) throw result.error;
    await clearDocumentMailError({
      documentIds: [receipt.id],
      sentAt,
      supabase: input.supabase,
    });
    return true;
  } catch (error) {
    await markDocumentMailError({
      documentIds: [receipt.id],
      sentAt,
      message: errorMessage(error),
      supabase: input.supabase,
    });
    throw error;
  }
}

export async function processProviderTransferPostProcessingForLedgerEntry(input: {
  ledgerEntryId: string;
  supabase?: SupabaseClient;
}): Promise<ProviderTransferPostProcessingResult> {
  const supabase = input.supabase ?? createSupabaseAdmin();
  const result: ProviderTransferPostProcessingResult = {
    ledgerEntryId: input.ledgerEntryId,
    paymentTransactionId: null,
    providerDocumentsGenerated: false,
    providerEmailSent: false,
    customerReceiptGenerated: false,
    customerReceiptEmailSent: false,
    skipped: false,
    error: null,
  };

  try {
    const context = await loadTransferContext({ ledgerEntryId: input.ledgerEntryId, supabase });
    if (!context) {
      return {
        ...result,
        skipped: true,
      };
    }

    result.paymentTransactionId = context.paymentTransaction.id;

    const [providerDocuments, customerReceipt] = await Promise.all([
      ensureProviderPayoutDocumentsForLedgerEntry({
        ledgerEntryId: context.ledgerEntry.id,
        supabase,
      }),
      ensureCustomerReceiptForPayment({
        paymentTransactionId: context.paymentTransaction.id,
        supabase,
      }),
    ]);

    result.providerDocumentsGenerated = Boolean(
      providerDocuments.providerPayoutStatementDocumentId &&
        providerDocuments.providerPlatformFeeInvoiceDocumentId
    );
    result.customerReceiptGenerated = Boolean(customerReceipt.documentId);

    result.providerEmailSent = await sendProviderEmailOnce({
      context,
      providerPayoutStatementDocumentId: providerDocuments.providerPayoutStatementDocumentId,
      providerPlatformFeeInvoiceDocumentId: providerDocuments.providerPlatformFeeInvoiceDocumentId,
      supabase,
    });
    result.customerReceiptEmailSent = await sendCustomerReceiptOnce({
      context,
      customerReceiptDocumentId: customerReceipt.documentId,
      supabase,
    });

    return result;
  } catch (error) {
    const message = errorMessage(error);
    console.warn("[provider-transfer-post-processing] failed", {
      ledgerEntryId: input.ledgerEntryId,
      paymentTransactionId: result.paymentTransactionId,
      error: message,
    });

    return {
      ...result,
      error: message,
    };
  }
}

async function loadPendingPostProcessingLedgerEntryIds(input: {
  limit: number;
  supabase: SupabaseClient;
}): Promise<string[]> {
  const scanLimit = input.limit * POST_TRANSFER_SCAN_MULTIPLIER;
  const { data: ledgerEntries, error } = await input.supabase
    .from("ledger_entries")
    .select("id,source_id")
    .eq("entry_type", "payment")
    .eq("source_type", "payment_transaction")
    .eq("payout_status", "transfer_created")
    .not("stripe_transfer_id", "is", null)
    .order("created_at", { ascending: true, nullsFirst: false })
    .limit(scanLimit)
    .returns<Array<{ id: string; source_id: string }>>();
  if (error) throw error;

  const rows = ledgerEntries ?? [];
  if (rows.length === 0) return [];

  const ledgerEntryIds = rows.map((row) => row.id);
  const paymentTransactionIds = rows.map((row) => row.source_id);
  const { data: documents, error: documentsError } = await input.supabase
    .from("financial_documents")
    .select("id,document_type,ledger_entry_id,payment_transaction_id,customer_email,sent_at,metadata")
    .or(
      [
        `ledger_entry_id.in.(${ledgerEntryIds.join(",")})`,
        `payment_transaction_id.in.(${paymentTransactionIds.join(",")})`,
      ].join(",")
    )
    .in("document_type", ["customer_receipt", "provider_payout_statement", "provider_platform_fee_invoice"])
    .returns<FinancialDocumentMailStateRow[]>();

  if (documentsError) throw documentsError;

  return rows
    .filter((row) => {
      const providerDocuments = (documents ?? []).filter((document) => document.ledger_entry_id === row.id);
      const customerReceipts = (documents ?? []).filter(
        (document) =>
          document.document_type === "customer_receipt" &&
          document.payment_transaction_id === row.source_id
      );
      const hasSentProviderStatement = providerDocuments.some(
        (document) => document.document_type === "provider_payout_statement" && document.sent_at
      );
      const hasSentProviderFeeInvoice = providerDocuments.some(
        (document) => document.document_type === "provider_platform_fee_invoice" && document.sent_at
      );
      const hasSentCustomerReceipt = customerReceipts.some((document) => document.sent_at);
      const hasProviderStatement = providerDocuments.some(
        (document) => document.document_type === "provider_payout_statement"
      );
      const hasProviderFeeInvoice = providerDocuments.some(
        (document) => document.document_type === "provider_platform_fee_invoice"
      );
      const hasCustomerReceipt = customerReceipts.length > 0;

      return (
        !hasProviderStatement ||
        !hasProviderFeeInvoice ||
        !hasCustomerReceipt ||
        !hasSentProviderStatement ||
        !hasSentProviderFeeInvoice ||
        !hasSentCustomerReceipt
      );
    })
    .map((row) => row.id)
    .slice(0, input.limit);
}

export async function processProviderTransferPostProcessing(input?: {
  ledgerEntryIds?: string[];
  limit?: number;
}): Promise<ProcessProviderTransferPostProcessingResult> {
  const supabase = createSupabaseAdmin();
  const limit = Math.min(Math.max(1, input?.limit ?? POST_TRANSFER_RETRY_LIMIT), POST_TRANSFER_RETRY_LIMIT);
  const pendingLedgerEntryIds = await loadPendingPostProcessingLedgerEntryIds({
    limit,
    supabase,
  });
  const ledgerEntryIds = Array.from(new Set([...(input?.ledgerEntryIds ?? []), ...pendingLedgerEntryIds])).slice(0, limit);

  const results: ProviderTransferPostProcessingResult[] = [];
  for (const ledgerEntryId of ledgerEntryIds) {
    const result = await processProviderTransferPostProcessingForLedgerEntry({
      ledgerEntryId,
      supabase,
    });
    results.push(result);

    if (result.error) {
      console.warn("[provider-transfer-post-processing] retryable ledger post-processing error", result);
    }
  }

  return {
    consideredCount: ledgerEntryIds.length,
    processedCount: results.filter((result) => !result.skipped && !result.error).length,
    failedCount: results.filter((result) => Boolean(result.error)).length,
    results,
  };
}

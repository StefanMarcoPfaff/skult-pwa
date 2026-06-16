import "server-only";

import { ensureProviderPayoutDocumentsForLedgerEntry } from "@/lib/documents/simulation-documents";
import { sendProviderPayoutReceivedEmail } from "@/lib/provider-payout-emails";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const INTERNAL_SIMULATION_PROVIDER = "internal_simulation";
const INTERNAL_SIMULATION_METHOD = "internal_simulation";
// In Stripe Custom Connect, payout_batches/payout_items are settlement mirrors:
// Stripe moves the money, RESER records the accounting state for dashboards and documents.
// The functions in this file remain internal simulation/admin tooling and must not be
// treated as production money movement.
const PAYOUT_BATCH_ALLOWED_METHODS = [
  "bank_transfer",
  "paypal",
  "stripe",
  "manual",
  "other",
  INTERNAL_SIMULATION_METHOD,
] as const;

type PayableLedgerEntryRow = {
  id: string;
  provider_payout_profile_id: string | null;
  source_type: string;
  source_id: string;
  subscription_contract_id: string | null;
  net_amount_cents: number;
  currency: string;
  payout_status: string;
  payout_batch_id: string | null;
};

type ProviderPayoutProfileRow = {
  id: string;
  teacher_id: string | null;
  provider: string | null;
  payout_method: string | null;
};

type PayoutBatchRow = {
  id: string;
};

type SimulationGroup = {
  providerPayoutProfileId: string | null;
  payoutProvider: string;
  sourcePayoutMethod: string;
  payoutMethod: string;
  currency: string;
  entries: PayableLedgerEntryRow[];
};

type SelectedPayoutLedgerRow = {
  id: string;
  provider_payout_profile_id: string | null;
  source_type: string;
  source_id: string;
  subscription_contract_id: string | null;
  net_amount_cents: number;
  currency: string;
  payout_status: string;
  payout_batch_id: string | null;
};

type PayoutLedgerContext = {
  providerId: string | null;
  payoutMethod: string;
};

type PaymentTransactionContextRow = {
  id: string;
  booking_id: string | null;
  course_registration_intent_id: string | null;
  subscription_contract_id: string | null;
};

type SubscriptionContractContextRow = {
  id: string;
  teacher_id: string;
  course_id: string;
  course_registration_intent_id: string | null;
};

type BookingContextRow = {
  id: string;
  course_id: string | null;
};

type CourseRegistrationIntentContextRow = {
  id: string;
  course_id: string | null;
};

type CourseTeacherRow = {
  id: string;
  teacher_id: string | null;
};

type ProviderBillingProfileFallbackRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
};

type ProviderPayoutMethodFallbackRow = {
  payout_method: string | null;
};

export type SimulatedPayoutIssue = {
  step: string;
  supabaseCode: string | null;
  supabaseMessage: string | null;
  rawErrorMessage: string;
};

type DocumentResult = {
  providerPayoutStatementDocumentId: string | null;
  providerPayoutStatementPdfPath: string | null;
  providerPayoutStatementPdfGenerated: boolean;
  providerPayoutStatementPdfWarning: string | null;
  providerPlatformFeeInvoiceDocumentId: string | null;
  providerPlatformFeeInvoicePdfPath: string | null;
  providerPlatformFeeInvoicePdfGenerated: boolean;
  providerPlatformFeeInvoicePdfWarning: string | null;
  platformRevenueStatementDocumentId: string | null;
  platformRevenueStatementPdfPath: string | null;
  platformRevenueStatementPdfGenerated: boolean;
  platformRevenueStatementPdfWarning: string | null;
  issue: SimulatedPayoutIssue | null;
};

type PayoutItemResult = {
  payoutItemId: string | null;
  issue: SimulatedPayoutIssue | null;
};

type ResolvedPayoutTarget = {
  providerPayoutProfileId: string | null;
  payoutProvider: string;
  sourcePayoutMethod: string;
  payoutMethod: string;
  usedFallbackPayoutProfile: boolean;
};

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
};

export class SimulatedPayoutError extends Error {
  readonly step: string;
  readonly supabaseCode: string | null;
  readonly supabaseMessage: string | null;
  readonly rawErrorMessage: string;

  constructor(step: string, message: string, error?: unknown) {
    super(message);
    this.name = "SimulatedPayoutError";
    this.step = step;
    this.supabaseCode = getSupabaseCode(error);
    this.supabaseMessage = getSupabaseMessage(error);
    this.rawErrorMessage = getRawErrorMessage(error);
  }
}

function normalizeCurrency(currency: string | null | undefined): string {
  return (currency ?? "EUR").trim().toUpperCase() || "EUR";
}

function normalizePayoutProvider(value: string | null | undefined): string {
  return String(value ?? "").trim() || INTERNAL_SIMULATION_PROVIDER;
}

function normalizePayoutMethod(value: string | null | undefined): string {
  return String(value ?? "").trim() || INTERNAL_SIMULATION_METHOD;
}

function normalizePayoutBatchMethod(value: string | null | undefined): (typeof PAYOUT_BATCH_ALLOWED_METHODS)[number] {
  const normalized = normalizePayoutMethod(value).toLowerCase();

  switch (normalized) {
    case "iban":
    case "sepa":
    case "bank_transfer":
      return "bank_transfer";
    case "paypal":
    case "stripe":
    case "manual":
    case "other":
    case INTERNAL_SIMULATION_METHOD:
      return normalized;
    default:
      return INTERNAL_SIMULATION_METHOD;
  }
}

function getSupabaseCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as SupabaseLikeError).code;
    return code ? String(code) : null;
  }

  return null;
}

function getSupabaseMessage(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as SupabaseLikeError).message;
    return message ? String(message) : null;
  }

  return null;
}

function getRawErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || "Unbekannter Fehler";
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as SupabaseLikeError).message ?? "Unbekannter Fehler");
  }

  return String(error ?? "Unbekannter Fehler");
}

function buildPayoutIssue(step: string, error: unknown): SimulatedPayoutIssue {
  return {
    step,
    supabaseCode: getSupabaseCode(error),
    supabaseMessage: getSupabaseMessage(error),
    rawErrorMessage: getRawErrorMessage(error),
  };
}

function toSimulatedPayoutError(step: string, message: string, error?: unknown): SimulatedPayoutError {
  return new SimulatedPayoutError(step, message, error);
}

function buildAccountHolderName(profile: ProviderBillingProfileFallbackRow | null): string {
  if (!profile) {
    return "Interne Simulation";
  }

  const organizationName = String(profile.organization_name ?? "").trim();
  if (organizationName) {
    return organizationName;
  }

  const fullName = [profile.first_name?.trim(), profile.last_name?.trim()].filter(Boolean).join(" ").trim();
  return fullName || "Interne Simulation";
}

function isPayableStatus(value: string | null | undefined): boolean {
  return value === "payable" || value === "available";
}

async function loadLedgerProviderContext(entry: {
  source_type: string;
  source_id: string;
  subscription_contract_id: string | null;
}): Promise<PayoutLedgerContext> {
  const admin = createSupabaseAdmin();

  const paymentTransaction =
    entry.source_type === "payment_transaction"
      ? (
          await admin
            .from("payment_transactions")
            .select("id,booking_id,course_registration_intent_id,subscription_contract_id")
            .eq("id", entry.source_id)
            .maybeSingle<PaymentTransactionContextRow>()
        ).data ?? null
      : null;

  const subscriptionContractId = entry.subscription_contract_id ?? paymentTransaction?.subscription_contract_id ?? null;
  const subscriptionContract =
    subscriptionContractId
      ? (
          await admin
            .from("subscription_contracts")
            .select("id,teacher_id,course_id,course_registration_intent_id")
            .eq("id", subscriptionContractId)
            .maybeSingle<SubscriptionContractContextRow>()
        ).data ?? null
      : null;

  const bookingId = paymentTransaction?.booking_id ?? null;
  const intentId =
    paymentTransaction?.course_registration_intent_id ??
    subscriptionContract?.course_registration_intent_id ??
    null;

  const [bookingResult, intentResult] = await Promise.all([
    bookingId
      ? admin.from("bookings").select("id,course_id").eq("id", bookingId).maybeSingle<BookingContextRow>()
      : Promise.resolve({ data: null as BookingContextRow | null, error: null }),
    intentId
      ? admin
          .from("course_registration_intents")
          .select("id,course_id")
          .eq("id", intentId)
          .maybeSingle<CourseRegistrationIntentContextRow>()
      : Promise.resolve({ data: null as CourseRegistrationIntentContextRow | null, error: null }),
  ]);

  if (bookingResult.error) {
    throw toSimulatedPayoutError("load_booking_context", "Buchungskontext konnte nicht geladen werden", bookingResult.error);
  }

  if (intentResult.error) {
    throw toSimulatedPayoutError("load_intent_context", "Intent-Kontext konnte nicht geladen werden", intentResult.error);
  }

  const courseId =
    subscriptionContract?.course_id ??
    bookingResult.data?.course_id ??
    intentResult.data?.course_id ??
    null;

  const course =
    courseId
      ? (
          await admin
            .from("courses")
            .select("id,teacher_id")
            .eq("id", courseId)
            .maybeSingle<CourseTeacherRow>()
        ).data ?? null
      : null;

  const providerId = subscriptionContract?.teacher_id ?? course?.teacher_id ?? null;
  const payoutProfile =
    providerId
      ? (
          await admin
            .from("provider_payout_profiles")
            .select("payout_method")
            .eq("teacher_id", providerId)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle<ProviderPayoutMethodFallbackRow>()
        ).data ?? null
      : null;

  return {
    providerId,
    payoutMethod: normalizePayoutMethod(payoutProfile?.payout_method),
  };
}

async function ensureSimulationProviderPayoutProfile(input: {
  providerId: string;
  payoutMethod: string;
}): Promise<ProviderPayoutProfileRow | null> {
  const admin = createSupabaseAdmin();
  const { data: existingProfile, error: existingProfileError } = await admin
    .from("provider_payout_profiles")
    .select("id,teacher_id,provider,payout_method")
    .eq("teacher_id", input.providerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<ProviderPayoutProfileRow>();

  if (existingProfileError) {
    throw toSimulatedPayoutError(
      "load_provider_payout_profile",
      "Provider-Payout-Profil konnte nicht geladen werden",
      existingProfileError
    );
  }

  if (existingProfile?.id) {
    return existingProfile;
  }

  const { data: billingProfile } = await admin
    .from("profiles")
    .select("id,first_name,last_name,organization_name")
    .eq("id", input.providerId)
    .maybeSingle<ProviderBillingProfileFallbackRow>();

  const { data: insertedProfile, error: insertProfileError } = await admin
    .from("provider_payout_profiles")
    .insert({
      teacher_id: input.providerId,
      payout_method: input.payoutMethod,
      account_holder_name: buildAccountHolderName(billingProfile ?? null),
      verification_status: "verified",
      provider: INTERNAL_SIMULATION_PROVIDER,
      provider_account_id: null,
    })
    .select("id,teacher_id,provider,payout_method")
    .maybeSingle<ProviderPayoutProfileRow>();

  if (insertedProfile?.id) {
    return insertedProfile;
  }

  if (!insertProfileError) {
    return null;
  }

  const { data: fallbackProfile, error: fallbackProfileError } = await admin
    .from("provider_payout_profiles")
    .select("id,teacher_id,provider,payout_method")
    .eq("teacher_id", input.providerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<ProviderPayoutProfileRow>();

  if (fallbackProfileError) {
    throw toSimulatedPayoutError(
      "fallback_provider_payout_profile",
      "Fallback fuer Provider-Payout-Profil konnte nicht geladen werden",
      fallbackProfileError
    );
  }

  return fallbackProfile ?? null;
}

async function resolvePayoutTarget(input: {
  providerPayoutProfileId: string | null;
  source_type: string;
  source_id: string;
  subscription_contract_id: string | null;
}): Promise<ResolvedPayoutTarget> {
  const admin = createSupabaseAdmin();

  if (input.providerPayoutProfileId) {
    const { data: profile, error } = await admin
      .from("provider_payout_profiles")
      .select("id,teacher_id,provider,payout_method")
      .eq("id", input.providerPayoutProfileId)
      .maybeSingle<ProviderPayoutProfileRow>();

    if (error) {
      throw toSimulatedPayoutError("load_payout_profile", "Provider-Payout-Profil konnte nicht geladen werden", error);
    }

    if (profile?.id) {
      const sourcePayoutMethod = normalizePayoutMethod(profile.payout_method);
      return {
        providerPayoutProfileId: profile.id,
        payoutProvider: normalizePayoutProvider(profile.provider),
        sourcePayoutMethod,
        payoutMethod: normalizePayoutBatchMethod(sourcePayoutMethod),
        usedFallbackPayoutProfile: false,
      };
    }
  }

  const context = await loadLedgerProviderContext(input);
  const ensuredProfile = context.providerId
    ? await ensureSimulationProviderPayoutProfile({
        providerId: context.providerId,
        payoutMethod: context.payoutMethod,
      })
    : null;

  return {
    providerPayoutProfileId: ensuredProfile?.id ?? null,
    payoutProvider: normalizePayoutProvider(ensuredProfile?.provider ?? INTERNAL_SIMULATION_PROVIDER),
    sourcePayoutMethod: normalizePayoutMethod(ensuredProfile?.payout_method ?? context.payoutMethod),
    payoutMethod: normalizePayoutBatchMethod(ensuredProfile?.payout_method ?? context.payoutMethod),
    usedFallbackPayoutProfile: true,
  };
}

async function createPayoutBatchRecord(input: {
  payoutProvider: string;
  sourcePayoutMethod: string;
  payoutMethod: string;
  totalAmountCents: number;
  currency: string;
  status: "simulated_pending" | "paid";
}): Promise<string> {
  const admin = createSupabaseAdmin();
  const timestamp = input.status === "paid" ? new Date().toISOString() : null;
  const payload = {
    payout_provider: input.payoutProvider,
    payout_method: input.payoutMethod,
    total_amount_cents: input.totalAmountCents,
    currency: input.currency,
    status: input.status,
    executed_at: timestamp,
  };

  console.info(
    "[simulate-payout] payout_batches insert payload",
    JSON.stringify({
      payload,
      source_payout_method: input.sourcePayoutMethod,
      allowed_payout_batch_methods: PAYOUT_BATCH_ALLOWED_METHODS,
    })
  );

  const { data: batch, error } = await admin
    .from("payout_batches")
    .insert(payload)
    .select("id")
    .maybeSingle<PayoutBatchRow>();

  if (error) {
    console.error(
      "[simulate-payout] payout_batches insert failed",
      JSON.stringify({
        payload,
        source_payout_method: input.sourcePayoutMethod,
        allowed_payout_batch_methods: PAYOUT_BATCH_ALLOWED_METHODS,
        supabase_code: getSupabaseCode(error),
        supabase_message: getSupabaseMessage(error),
      })
    );
    throw toSimulatedPayoutError(
      "create_payout_batch",
      `Simulations-Auszahlung konnte nicht angelegt werden. payload=${JSON.stringify(payload)} source_payout_method=${input.sourcePayoutMethod}`,
      error
    );
  }

  if (!batch?.id) {
    throw toSimulatedPayoutError("create_payout_batch", "Simulations-Auszahlung konnte nicht angelegt werden");
  }

  return batch.id;
}

async function ensurePayoutItemRecord(input: {
  batchId: string;
  ledgerEntryId: string;
  providerPayoutProfileId: string | null;
  amountCents: number;
  currency: string;
  status: "simulated_pending" | "paid";
}): Promise<PayoutItemResult> {
  const admin = createSupabaseAdmin();
  const { data: existingItem, error: existingItemError } = await admin
    .from("payout_items")
    .select("id")
    .eq("ledger_entry_id", input.ledgerEntryId)
    .maybeSingle<{ id: string }>();

  if (existingItemError) {
    return {
      payoutItemId: null,
      issue: buildPayoutIssue("load_payout_item", existingItemError),
    };
  }

  if (existingItem?.id) {
    if (input.status === "paid") {
      const { error: updateError } = await admin
        .from("payout_items")
        .update({
          status: "paid",
          executed_at: new Date().toISOString(),
        })
        .eq("id", existingItem.id);

      if (updateError) {
        return {
          payoutItemId: existingItem.id,
          issue: buildPayoutIssue("update_payout_item_paid", updateError),
        };
      }
    }

    return {
      payoutItemId: existingItem.id,
      issue: null,
    };
  }

  if (!input.providerPayoutProfileId) {
    return {
      payoutItemId: null,
      issue: buildPayoutIssue(
        "skip_payout_item_without_profile",
        new Error("Kein Provider-Payout-Profil vorhanden; payout_item wurde im Testmodus uebersprungen.")
      ),
    };
  }

  const { data: item, error } = await admin
    .from("payout_items")
    .insert({
      payout_batch_id: input.batchId,
      provider_payout_profile_id: input.providerPayoutProfileId,
      ledger_entry_id: input.ledgerEntryId,
      amount_cents: Math.max(0, input.amountCents),
      currency: input.currency,
      status: input.status,
      executed_at: input.status === "paid" ? new Date().toISOString() : null,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    return {
      payoutItemId: null,
      issue: buildPayoutIssue("create_payout_item", error),
    };
  }

  return {
    payoutItemId: item?.id ?? null,
    issue: null,
  };
}

async function updateLedgerForBatch(input: {
  ledgerEntryId: string;
  batchId: string;
  previousPayoutStatus?: string | null;
  markAsPaid: boolean;
}): Promise<void> {
  const admin = createSupabaseAdmin();
  let statement = admin
    .from("ledger_entries")
    .update({
      payout_batch_id: input.batchId,
      payout_status: input.markAsPaid ? "paid" : "batched",
    })
    .eq("id", input.ledgerEntryId);

  if (input.markAsPaid) {
    if (input.previousPayoutStatus) {
      statement = statement.eq("payout_status", input.previousPayoutStatus);
    }
    statement = statement.is("payout_batch_id", null);
  } else {
    statement = statement.eq("payout_status", "payable").is("payout_batch_id", null);
  }

  const { data: updatedLedger, error } = await statement.select("id").maybeSingle<{ id: string }>();

  if (error) {
    throw toSimulatedPayoutError(
      input.markAsPaid ? "finalize_ledger_paid" : "mark_ledger_batched",
      input.markAsPaid
        ? "Ledger-Auszahlungsstatus konnte nicht finalisiert werden"
        : "Ledger-Auszahlungsstatus konnte nicht auf batched gesetzt werden",
      error
    );
  }

  if (!updatedLedger?.id) {
    throw toSimulatedPayoutError(
      input.markAsPaid ? "finalize_ledger_paid" : "mark_ledger_batched",
      input.markAsPaid
        ? "Ledger-Auszahlungsstatus konnte nicht finalisiert werden"
        : "Ledger-Auszahlungsstatus konnte nicht auf batched gesetzt werden"
    );
  }
}

async function markExistingBatchAsPaid(input: {
  batchId: string;
  ledgerEntryId: string;
  previousPayoutStatus: string;
}): Promise<PayoutItemResult> {
  const admin = createSupabaseAdmin();
  const payoutItemResult = await ensurePayoutItemRecord({
    batchId: input.batchId,
    ledgerEntryId: input.ledgerEntryId,
    providerPayoutProfileId: null,
    amountCents: 0,
    currency: "EUR",
    status: "paid",
  });

  const { error: batchError } = await admin
    .from("payout_batches")
    .update({
      status: "paid",
      executed_at: new Date().toISOString(),
    })
    .eq("id", input.batchId);

  if (batchError) {
    throw toSimulatedPayoutError("mark_batch_paid", "Payout-Batch konnte nicht auf paid gesetzt werden", batchError);
  }

  await updateLedgerForBatch({
    ledgerEntryId: input.ledgerEntryId,
    batchId: input.batchId,
    previousPayoutStatus: input.previousPayoutStatus,
    markAsPaid: true,
  });

  return payoutItemResult;
}

async function ensurePayoutDocuments(ledgerEntryId: string): Promise<DocumentResult> {
  const admin = createSupabaseAdmin();

  try {
    const documents = await ensureProviderPayoutDocumentsForLedgerEntry({
      ledgerEntryId,
      supabase: admin,
    });

    return {
      providerPayoutStatementDocumentId: documents.providerPayoutStatementDocumentId,
      providerPayoutStatementPdfPath: documents.providerPayoutStatementPdfPath,
      providerPayoutStatementPdfGenerated: documents.providerPayoutStatementPdfGenerated,
      providerPayoutStatementPdfWarning: documents.providerPayoutStatementPdfWarning,
      providerPlatformFeeInvoiceDocumentId: documents.providerPlatformFeeInvoiceDocumentId,
      providerPlatformFeeInvoicePdfPath: documents.providerPlatformFeeInvoicePdfPath,
      providerPlatformFeeInvoicePdfGenerated: documents.providerPlatformFeeInvoicePdfGenerated,
      providerPlatformFeeInvoicePdfWarning: documents.providerPlatformFeeInvoicePdfWarning,
      platformRevenueStatementDocumentId: documents.platformRevenueStatementDocumentId,
      platformRevenueStatementPdfPath: documents.platformRevenueStatementPdfPath,
      platformRevenueStatementPdfGenerated: documents.platformRevenueStatementPdfGenerated,
      platformRevenueStatementPdfWarning: documents.platformRevenueStatementPdfWarning,
      issue: null,
    };
  } catch (error) {
    return {
      providerPayoutStatementDocumentId: null,
      providerPayoutStatementPdfPath: null,
      providerPayoutStatementPdfGenerated: false,
      providerPayoutStatementPdfWarning: null,
      providerPlatformFeeInvoiceDocumentId: null,
      providerPlatformFeeInvoicePdfPath: null,
      providerPlatformFeeInvoicePdfGenerated: false,
      providerPlatformFeeInvoicePdfWarning: null,
      platformRevenueStatementDocumentId: null,
      platformRevenueStatementPdfPath: null,
      platformRevenueStatementPdfGenerated: false,
      platformRevenueStatementPdfWarning: null,
      issue: buildPayoutIssue("create_financial_documents", error),
    };
  }
}

async function resolveProviderPayoutEmail(input: {
  providerPayoutProfileId: string | null;
  source_type: string;
  source_id: string;
  subscription_contract_id: string | null;
}): Promise<string | null> {
  const admin = createSupabaseAdmin();
  let providerId: string | null = null;

  if (input.providerPayoutProfileId) {
    const { data: profile, error } = await admin
      .from("provider_payout_profiles")
      .select("teacher_id")
      .eq("id", input.providerPayoutProfileId)
      .maybeSingle<{ teacher_id: string | null }>();

    if (error) {
      console.warn("[provider-payout-email] provider payout profile lookup failed", {
        providerPayoutProfileId: input.providerPayoutProfileId,
        error,
      });
    }

    providerId = profile?.teacher_id ?? null;
  }

  if (!providerId) {
    const context = await loadLedgerProviderContext(input);
    providerId = context.providerId;
  }

  if (!providerId) {
    console.warn("[provider-payout-email] missing provider id", {
      providerPayoutProfileId: input.providerPayoutProfileId,
      sourceType: input.source_type,
      sourceId: input.source_id,
    });
    return null;
  }

  const authResult = await admin.auth.admin.getUserById(providerId);
  const email = authResult.data.user?.email?.trim() ?? null;

  if (!email) {
    console.warn("[provider-payout-email] missing provider email", {
      providerId,
      providerPayoutProfileId: input.providerPayoutProfileId,
    });
  }

  return email;
}

async function sendProviderPayoutEmailAfterSuccess(input: {
  ledgerEntry: SelectedPayoutLedgerRow;
  batchId: string;
  payoutItemId: string | null;
  providerPayoutProfileId: string | null;
}) {
  try {
    const providerEmail = await resolveProviderPayoutEmail({
      providerPayoutProfileId: input.providerPayoutProfileId,
      source_type: input.ledgerEntry.source_type,
      source_id: input.ledgerEntry.source_id,
      subscription_contract_id: input.ledgerEntry.subscription_contract_id,
    });

    if (!providerEmail) return;

    const result = await sendProviderPayoutReceivedEmail({
      to: providerEmail,
      payoutAmountCents: Math.max(0, input.ledgerEntry.net_amount_cents),
      currency: normalizeCurrency(input.ledgerEntry.currency),
      payoutBatchId: input.batchId,
      payoutItemId: input.payoutItemId,
      ledgerEntryId: input.ledgerEntry.id,
    });

    if (result?.error) {
      console.warn("[provider-payout-email] send failed", {
        ledgerEntryId: input.ledgerEntry.id,
        batchId: input.batchId,
        recipient: providerEmail,
        error: result.error,
      });
    }
  } catch (error) {
    console.warn("[provider-payout-email] send failed", {
      ledgerEntryId: input.ledgerEntry.id,
      batchId: input.batchId,
      error,
    });
  }
}

export async function createSimulatedPayoutBatch(): Promise<{
  consideredCount: number;
  skippedCount: number;
  batchCount: number;
  itemCount: number;
  batchIds: string[];
}> {
  const admin = createSupabaseAdmin();
  const { data: payableEntries, error } = await admin
    .from("ledger_entries")
    .select("id,provider_payout_profile_id,source_type,source_id,subscription_contract_id,net_amount_cents,currency,payout_status,payout_batch_id")
    .eq("entry_type", "payment")
    .eq("payout_status", "payable")
    .is("payout_batch_id", null)
    .returns<PayableLedgerEntryRow[]>();

  if (error) {
    throw toSimulatedPayoutError("load_payable_ledger_entries", "Payable Ledger-Eintraege konnten nicht geladen werden", error);
  }

  const candidateEntries = payableEntries ?? [];
  if (candidateEntries.length === 0) {
    return {
      consideredCount: 0,
      skippedCount: 0,
      batchCount: 0,
      itemCount: 0,
      batchIds: [],
    };
  }

  const groups = new Map<string, SimulationGroup>();
  let skippedCount = 0;

  for (const entry of candidateEntries) {
    try {
      const target = await resolvePayoutTarget({
        providerPayoutProfileId: entry.provider_payout_profile_id,
        source_type: entry.source_type,
        source_id: entry.source_id,
        subscription_contract_id: entry.subscription_contract_id,
      });
      const groupKey = [
        target.providerPayoutProfileId ?? `fallback:${entry.id}`,
        target.payoutProvider,
        target.payoutMethod,
        normalizeCurrency(entry.currency),
      ].join("::");

      const existingGroup = groups.get(groupKey);
      if (existingGroup) {
        existingGroup.entries.push(entry);
        continue;
      }

      groups.set(groupKey, {
        providerPayoutProfileId: target.providerPayoutProfileId,
        payoutProvider: target.payoutProvider,
        sourcePayoutMethod: target.sourcePayoutMethod,
        payoutMethod: target.payoutMethod,
        currency: normalizeCurrency(entry.currency),
        entries: [entry],
      });
    } catch {
      skippedCount += 1;
    }
  }

  const createdBatchIds: string[] = [];
  let createdItemCount = 0;

  for (const group of groups.values()) {
    const eligibleEntryIds = group.entries.map((entry) => entry.id);
    const { data: lockedEntries, error: lockedEntriesError } = await admin
      .from("ledger_entries")
      .select("id,provider_payout_profile_id,source_type,source_id,subscription_contract_id,net_amount_cents,currency,payout_status,payout_batch_id")
      .in("id", eligibleEntryIds)
      .eq("payout_status", "payable")
      .is("payout_batch_id", null)
      .returns<PayableLedgerEntryRow[]>();

    if (lockedEntriesError) {
      throw toSimulatedPayoutError(
        "lock_payable_ledger_entries",
        "Payable Ledger-Eintraege konnten nicht gesperrt geladen werden",
        lockedEntriesError
      );
    }

    const finalEntries = lockedEntries ?? [];
    if (finalEntries.length === 0) {
      continue;
    }

    const batchId = await createPayoutBatchRecord({
      payoutProvider: group.payoutProvider,
      sourcePayoutMethod: group.sourcePayoutMethod,
      payoutMethod: group.payoutMethod,
      totalAmountCents: finalEntries.reduce((sum, entry) => sum + Math.max(0, entry.net_amount_cents), 0),
      currency: group.currency,
      status: "simulated_pending",
    });

    createdBatchIds.push(batchId);

    for (const entry of finalEntries) {
      const payoutItemResult = await ensurePayoutItemRecord({
        batchId,
        ledgerEntryId: entry.id,
        providerPayoutProfileId: group.providerPayoutProfileId,
        amountCents: entry.net_amount_cents,
        currency: group.currency,
        status: "simulated_pending",
      });

      if (payoutItemResult.payoutItemId) {
        createdItemCount += 1;
      }

      await updateLedgerForBatch({
        ledgerEntryId: entry.id,
        batchId,
        markAsPaid: false,
      });
    }
  }

  return {
    consideredCount: candidateEntries.length,
    skippedCount,
    batchCount: createdBatchIds.length,
    itemCount: createdItemCount,
    batchIds: createdBatchIds,
  };
}

export async function createSimulatedPaidPayoutForLedgerEntry(input: {
  ledgerEntryId: string;
}): Promise<{
  batchId: string;
  payoutItemId: string | null;
  ledgerEntryId: string;
  providerPayoutStatementDocumentId: string | null;
  providerPayoutStatementPdfPath: string | null;
  providerPayoutStatementPdfGenerated: boolean;
  providerPayoutStatementPdfWarning: string | null;
  providerPlatformFeeInvoiceDocumentId: string | null;
  providerPlatformFeeInvoicePdfPath: string | null;
  providerPlatformFeeInvoicePdfGenerated: boolean;
  providerPlatformFeeInvoicePdfWarning: string | null;
  platformRevenueStatementDocumentId: string | null;
  platformRevenueStatementPdfPath: string | null;
  platformRevenueStatementPdfGenerated: boolean;
  platformRevenueStatementPdfWarning: string | null;
  payoutProvider: string;
  payoutMethod: string;
  usedFallbackPayoutProfile: boolean;
  payoutItemIssue: SimulatedPayoutIssue | null;
  documentIssue: SimulatedPayoutIssue | null;
}> {
  const ledgerEntryId = input.ledgerEntryId.trim();
  if (!ledgerEntryId) {
    throw toSimulatedPayoutError("validate_ledger_entry_id", "Kein Ledger-Eintrag vorhanden");
  }

  const admin = createSupabaseAdmin();
  const { data: entry, error } = await admin
    .from("ledger_entries")
    .select("id,provider_payout_profile_id,source_type,source_id,subscription_contract_id,net_amount_cents,currency,payout_status,payout_batch_id")
    .eq("id", ledgerEntryId)
    .eq("entry_type", "payment")
    .eq("source_type", "payment_transaction")
    .maybeSingle<SelectedPayoutLedgerRow>();

  if (error) {
    throw toSimulatedPayoutError("load_ledger_entry", "Ledger-Eintrag konnte nicht geladen werden", error);
  }

  if (!entry?.id) {
    throw toSimulatedPayoutError("load_ledger_entry", "Kein Ledger-Eintrag vorhanden");
  }

  if (entry.payout_status === "cancelled" || entry.payout_status === "held") {
    throw toSimulatedPayoutError("validate_payout_state", "Bereits storniert oder gesperrt");
  }

  if (entry.payout_status === "paid") {
    throw toSimulatedPayoutError("validate_payout_state", "Bereits ausgezahlt");
  }

  const target = await resolvePayoutTarget({
    providerPayoutProfileId: entry.provider_payout_profile_id,
    source_type: entry.source_type,
    source_id: entry.source_id,
    subscription_contract_id: entry.subscription_contract_id,
  });

  if (entry.payout_batch_id) {
    const payoutItemResult = await markExistingBatchAsPaid({
      batchId: entry.payout_batch_id,
      ledgerEntryId: entry.id,
      previousPayoutStatus: entry.payout_status,
    });
    const documents = await ensurePayoutDocuments(entry.id);
    await sendProviderPayoutEmailAfterSuccess({
      ledgerEntry: entry,
      batchId: entry.payout_batch_id,
      payoutItemId: payoutItemResult.payoutItemId,
      providerPayoutProfileId: entry.provider_payout_profile_id ?? target.providerPayoutProfileId,
    });

    return {
      batchId: entry.payout_batch_id,
      payoutItemId: payoutItemResult.payoutItemId,
      ledgerEntryId: entry.id,
      providerPayoutStatementDocumentId: documents.providerPayoutStatementDocumentId,
      providerPayoutStatementPdfPath: documents.providerPayoutStatementPdfPath,
      providerPayoutStatementPdfGenerated: documents.providerPayoutStatementPdfGenerated,
      providerPayoutStatementPdfWarning: documents.providerPayoutStatementPdfWarning,
      providerPlatformFeeInvoiceDocumentId: documents.providerPlatformFeeInvoiceDocumentId,
      providerPlatformFeeInvoicePdfPath: documents.providerPlatformFeeInvoicePdfPath,
      providerPlatformFeeInvoicePdfGenerated: documents.providerPlatformFeeInvoicePdfGenerated,
      providerPlatformFeeInvoicePdfWarning: documents.providerPlatformFeeInvoicePdfWarning,
      platformRevenueStatementDocumentId: documents.platformRevenueStatementDocumentId,
      platformRevenueStatementPdfPath: documents.platformRevenueStatementPdfPath,
      platformRevenueStatementPdfGenerated: documents.platformRevenueStatementPdfGenerated,
      platformRevenueStatementPdfWarning: documents.platformRevenueStatementPdfWarning,
      payoutProvider: target.payoutProvider,
      payoutMethod: target.payoutMethod,
      usedFallbackPayoutProfile: target.usedFallbackPayoutProfile,
      payoutItemIssue: payoutItemResult.issue,
      documentIssue: documents.issue,
    };
  }

  if (!isPayableStatus(entry.payout_status)) {
    throw toSimulatedPayoutError("validate_payout_state", "Ledger-Eintrag ist noch nicht auszahlbar");
  }

  const batchId = await createPayoutBatchRecord({
    payoutProvider: target.payoutProvider,
    sourcePayoutMethod: target.sourcePayoutMethod,
    payoutMethod: target.payoutMethod,
    totalAmountCents: Math.max(0, entry.net_amount_cents),
    currency: normalizeCurrency(entry.currency),
    status: "paid",
  });

  const payoutItemResult = await ensurePayoutItemRecord({
    batchId,
    ledgerEntryId: entry.id,
    providerPayoutProfileId: target.providerPayoutProfileId,
    amountCents: entry.net_amount_cents,
    currency: normalizeCurrency(entry.currency),
    status: "paid",
  });

  await updateLedgerForBatch({
    ledgerEntryId: entry.id,
    batchId,
    previousPayoutStatus: entry.payout_status,
    markAsPaid: true,
  });

  const documents = await ensurePayoutDocuments(entry.id);
  await sendProviderPayoutEmailAfterSuccess({
    ledgerEntry: entry,
    batchId,
    payoutItemId: payoutItemResult.payoutItemId,
    providerPayoutProfileId: target.providerPayoutProfileId ?? entry.provider_payout_profile_id,
  });

  return {
    batchId,
    payoutItemId: payoutItemResult.payoutItemId,
    ledgerEntryId: entry.id,
    providerPayoutStatementDocumentId: documents.providerPayoutStatementDocumentId,
    providerPayoutStatementPdfPath: documents.providerPayoutStatementPdfPath,
    providerPayoutStatementPdfGenerated: documents.providerPayoutStatementPdfGenerated,
    providerPayoutStatementPdfWarning: documents.providerPayoutStatementPdfWarning,
    providerPlatformFeeInvoiceDocumentId: documents.providerPlatformFeeInvoiceDocumentId,
    providerPlatformFeeInvoicePdfPath: documents.providerPlatformFeeInvoicePdfPath,
    providerPlatformFeeInvoicePdfGenerated: documents.providerPlatformFeeInvoicePdfGenerated,
    providerPlatformFeeInvoicePdfWarning: documents.providerPlatformFeeInvoicePdfWarning,
    platformRevenueStatementDocumentId: documents.platformRevenueStatementDocumentId,
    platformRevenueStatementPdfPath: documents.platformRevenueStatementPdfPath,
    platformRevenueStatementPdfGenerated: documents.platformRevenueStatementPdfGenerated,
    platformRevenueStatementPdfWarning: documents.platformRevenueStatementPdfWarning,
    payoutProvider: target.payoutProvider,
    payoutMethod: target.payoutMethod,
    usedFallbackPayoutProfile: target.usedFallbackPayoutProfile,
    payoutItemIssue: payoutItemResult.issue,
    documentIssue: documents.issue,
  };
}

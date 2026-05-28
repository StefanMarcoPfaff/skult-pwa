import type { SupabaseClient } from "@supabase/supabase-js";
import { getProviderBillingProfile } from "@/lib/provider-billing-profile";
import type { Database } from "@/lib/supabase/types";
import type {
  DocumentType,
  FinancialDocumentMetadata,
  FinancialDocumentProviderSnapshot,
} from "@/lib/documents/types";
import { DEFAULT_PROVIDER_SHARE_PERCENT, getPlatformFeePercentForProvider } from "@/lib/platform-fees";

const RESER_ROLE_NOTICE =
  "Die Leistung wird durch den/die Anbieter*in erbracht. RESER stellt die Plattform zur Buchung und Zahlungsabwicklung bereit.";

export type BuildFinancialDocumentDataInput = {
  supabase: SupabaseClient<Database>;
  providerId?: string | null;
  customer?: {
    name?: string | null;
    email?: string | null;
  } | null;
  offer?: {
    courseId?: string | null;
    title?: string | null;
    kind?: string | null;
    instructorName?: string | null;
  } | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  bookingId?: string | null;
  courseId?: string | null;
  courseRegistrationIntentId?: string | null;
  subscriptionContractId?: string | null;
  payoutBatchId?: string | null;
  payoutItemId?: string | null;
  paymentTransactionId?: string | null;
  refundRecordId?: string | null;
  ledgerEntryId?: string | null;
  currency?: string | null;
  grossAmountCents: number;
  platformFeeCents?: number | null;
  providerPayoutCents?: number | null;
  taxAmountCents?: number | null;
  taxHint?: string | null;
  metadata?: Record<string, unknown>;
};

function normalizeCurrency(currency: string | null | undefined): string {
  return (currency ?? "EUR").trim().toUpperCase() || "EUR";
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function buildProviderSnapshot(
  profile: Awaited<ReturnType<typeof getProviderBillingProfile>>
): FinancialDocumentProviderSnapshot | null {
  if (!profile) {
    return null;
  }

  return {
    providerId: profile.providerId,
    providerType: profile.providerType,
    providerDisplayName: profile.providerDisplayName,
    documentRecipientName: profile.documentRecipientName,
    billingName: profile.billingName,
    billingCompanyName: profile.billingCompanyName,
    billingAddressLine1: profile.billingAddressLine1,
    billingAddressLine2: profile.billingAddressLine2,
    billingPostalCode: profile.billingPostalCode,
    billingCity: profile.billingCity,
    billingCountry: profile.billingCountry,
    billingAddressLines: profile.billingAddressLines,
    billingAddressFormatted: profile.billingAddressFormatted,
    taxNumber: profile.taxNumber,
    vatId: profile.vatId,
    vatStatus: profile.vatStatus,
    payoutMethod: profile.payoutMethod,
    payoutDestination: profile.payoutDestination,
  };
}

function buildTaxHint(
  providerSnapshot: FinancialDocumentProviderSnapshot | null,
  explicitTaxHint: string | null | undefined
): string | null {
  if (explicitTaxHint && explicitTaxHint.trim()) {
    return explicitTaxHint.trim();
  }

  switch (providerSnapshot?.vatStatus) {
    case "small_business":
      return "Anbieter*innenprofil mit Kleinunternehmerstatus hinterlegt; Steuerberechnung bleibt in dieser PR unveraendert.";
    case "vat_registered":
      return "Umsatzsteuerlich registriertes Anbieter*innenprofil hinterlegt; Steuerberechnung bleibt in dieser PR unveraendert.";
    case "tax_exempt":
      return "Steuerbefreites Anbieter*innenprofil hinterlegt; Steuerberechnung bleibt in dieser PR unveraendert.";
    default:
      return "Steuerberechnung bleibt unveraendert; das Dokument spiegelt nur die bereits vorhandenen Betraege.";
  }
}

async function buildFinancialDocumentData(
  documentType: DocumentType,
  input: BuildFinancialDocumentDataInput
): Promise<FinancialDocumentMetadata> {
  const providerProfile = input.providerId
    ? await getProviderBillingProfile(input.supabase, input.providerId)
    : null;
  const providerSnapshot = buildProviderSnapshot(providerProfile);
  const taxHint = buildTaxHint(providerSnapshot, input.taxHint);

  const notes = [
    documentType === "customer_receipt"
      ? "Kund*innen-Beleg als Teil der Buchungsbestaetigung vorbereitet."
      : null,
    documentType === "provider_payout_statement"
      ? "Anbieter*innen-Auszahlungsabrechnung fuer die Einnahmenseite vorbereitet."
      : null,
    documentType === "provider_platform_fee_invoice"
      ? "Plattformgebuehr-Beleg fuer die Ausgabenseite der Anbieter*innen vorbereitet."
      : null,
    documentType === "platform_revenue_statement"
      ? "Interner RESER-Provisionsbeleg vorbereitet."
      : null,
    taxHint,
  ].filter((value): value is string => Boolean(value));

  return {
    roleNotice: RESER_ROLE_NOTICE,
    taxHint,
    providerBillingProfile: providerSnapshot,
    offer: input.offer
      ? {
          courseId: input.offer.courseId ?? input.courseId ?? null,
          title: normalizeOptionalText(input.offer.title),
          kind: normalizeOptionalText(input.offer.kind),
          instructorName: normalizeOptionalText(input.offer.instructorName),
        }
      : null,
    customer: input.customer
      ? {
          name: normalizeOptionalText(input.customer.name),
          email: normalizeOptionalText(input.customer.email),
        }
      : null,
    period:
      input.periodStart || input.periodEnd
        ? {
            start: input.periodStart ?? null,
            end: input.periodEnd ?? null,
          }
        : null,
    amounts: {
      currency: normalizeCurrency(input.currency),
      grossAmountCents: input.grossAmountCents,
      platformFeeCents: input.platformFeeCents ?? 0,
      providerPayoutCents: input.providerPayoutCents ?? 0,
      platformFeePercent: getPlatformFeePercentForProvider(providerSnapshot?.providerType),
      providerSharePercent: DEFAULT_PROVIDER_SHARE_PERCENT,
      taxAmountCents: input.taxAmountCents ?? null,
    },
    notes,
    source: {
      bookingId: input.bookingId ?? null,
      courseId: input.courseId ?? input.offer?.courseId ?? null,
      courseRegistrationIntentId: input.courseRegistrationIntentId ?? null,
      subscriptionContractId: input.subscriptionContractId ?? null,
      payoutBatchId: input.payoutBatchId ?? null,
      payoutItemId: input.payoutItemId ?? null,
      paymentTransactionId: input.paymentTransactionId ?? null,
      refundRecordId: input.refundRecordId ?? null,
      ledgerEntryId: input.ledgerEntryId ?? null,
    },
    documentType,
    ...input.metadata,
  };
}

export async function buildCustomerReceiptDocumentData(
  input: BuildFinancialDocumentDataInput
): Promise<FinancialDocumentMetadata> {
  return buildFinancialDocumentData("customer_receipt", input);
}

export async function buildProviderPayoutStatementDocumentData(
  input: BuildFinancialDocumentDataInput
): Promise<FinancialDocumentMetadata> {
  return buildFinancialDocumentData("provider_payout_statement", input);
}

export async function buildProviderPlatformFeeInvoiceDocumentData(
  input: BuildFinancialDocumentDataInput
): Promise<FinancialDocumentMetadata> {
  return buildFinancialDocumentData("provider_platform_fee_invoice", input);
}

export async function buildPlatformRevenueStatementDocumentData(
  input: BuildFinancialDocumentDataInput
): Promise<FinancialDocumentMetadata> {
  return buildFinancialDocumentData("platform_revenue_statement", input);
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { getProviderBillingProfile } from "@/lib/provider-billing-profile";
import type { Database } from "@/lib/supabase/types";
import type {
  DocumentType,
  FinancialDocumentMetadata,
  FinancialDocumentProviderSnapshot,
} from "@/lib/documents/types";
import { getPlatformFeeConfigForProvider } from "@/lib/platform-fees";

const RESER_ROLE_NOTICE =
  "Die Leistung wird durch Anbietende erbracht. RESER stellt die Buchungs- und Abrechnungsdokumentation bereit.";

export type BuildFinancialDocumentDataInput = {
  supabase: SupabaseClient<Database>;
  providerId?: string | null;
  customer?: {
    name?: string | null;
    email?: string | null;
    billingName?: string | null;
    billingStreet?: string | null;
    billingHouseNumber?: string | null;
    billingPostalCode?: string | null;
    billingCity?: string | null;
    billingCountry?: string | null;
  } | null;
  offer?: {
    courseId?: string | null;
    title?: string | null;
    kind?: string | null;
    instructorName?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    location?: string | null;
    locationDetails?: string | null;
    seatCount?: number | null;
  } | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  bookingId?: string | null;
  bookingCreatedAt?: string | null;
  courseId?: string | null;
  courseRegistrationIntentId?: string | null;
  subscriptionContractId?: string | null;
  payoutBatchId?: string | null;
  payoutItemId?: string | null;
  paymentTransactionId?: string | null;
  payment?: {
    provider?: string | null;
    providerPaymentId?: string | null;
    providerCheckoutId?: string | null;
    stripeChargeId?: string | null;
    stripePaymentIntentId?: string | null;
    status?: string | null;
    paidAt?: string | null;
    createdAt?: string | null;
  } | null;
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

function buildCustomerBillingAddressLines(customer: BuildFinancialDocumentDataInput["customer"]): string[] {
  const streetLine = [
    normalizeOptionalText(customer?.billingStreet),
    normalizeOptionalText(customer?.billingHouseNumber),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  const cityLine = [
    normalizeOptionalText(customer?.billingPostalCode),
    normalizeOptionalText(customer?.billingCity),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return [streetLine, cityLine, normalizeOptionalText(customer?.billingCountry)].filter(
    (value): value is string => Boolean(value)
  );
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
      return "Profil der Anbietenden mit Kleinunternehmerstatus hinterlegt; Steuerberechnung bleibt in dieser PR unveraendert.";
    case "vat_registered":
      return "Umsatzsteuerpflichtiges Profil ohne konkreten Steuersatz hinterlegt; fuer neue kostenpflichtige Angebote muss 19% oder 7% ausgewaehlt werden.";
    case "vat_19":
      return "Umsatzsteuerpflichtiges Profil mit 19% Umsatzsteuer hinterlegt.";
    case "vat_7":
      return "Umsatzsteuerpflichtiges Profil mit 7% Umsatzsteuer hinterlegt.";
    case "tax_exempt":
      return "Steuerbefreites Profil der Anbietenden hinterlegt; es wird keine Umsatzsteuer ausgewiesen.";
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
  const platformFeeConfig = await getPlatformFeeConfigForProvider(input.supabase, input.providerId);
  const taxHint = buildTaxHint(providerSnapshot, input.taxHint);

  const notes = [
    documentType === "customer_receipt"
      ? "Beleg fuer Teilnehmende als Teil der Buchungsbestaetigung vorbereitet."
      : null,
    documentType === "provider_payout_statement"
      ? "Anteil fuer Anbietende fuer die Einnahmenseite dokumentiert."
      : null,
    documentType === "provider_platform_fee_invoice"
      ? "Plattformgebuehr-Beleg fuer die Ausgabenseite der Anbietenden vorbereitet."
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
          startsAt: input.offer.startsAt ?? null,
          endsAt: input.offer.endsAt ?? null,
          location: normalizeOptionalText(input.offer.location),
          locationDetails: normalizeOptionalText(input.offer.locationDetails),
          seatCount: input.offer.seatCount ?? null,
        }
      : null,
    customer: input.customer
      ? (() => {
          const billingAddressLines = buildCustomerBillingAddressLines(input.customer);
          return {
            name: normalizeOptionalText(input.customer.name),
            email: normalizeOptionalText(input.customer.email),
            billingName: normalizeOptionalText(input.customer.billingName),
            billingStreet: normalizeOptionalText(input.customer.billingStreet),
            billingHouseNumber: normalizeOptionalText(input.customer.billingHouseNumber),
            billingPostalCode: normalizeOptionalText(input.customer.billingPostalCode),
            billingCity: normalizeOptionalText(input.customer.billingCity),
            billingCountry: normalizeOptionalText(input.customer.billingCountry),
            billingAddressLines,
            billingAddressFormatted: billingAddressLines.length > 0 ? billingAddressLines.join("\n") : null,
          };
        })()
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
      platformFeePercent: platformFeeConfig.platformFeePercent,
      providerSharePercent: platformFeeConfig.providerSharePercent,
      taxAmountCents: input.taxAmountCents ?? null,
    },
    payment: input.payment
      ? {
          provider: normalizeOptionalText(input.payment.provider),
          paymentTransactionId: input.paymentTransactionId ?? null,
          providerPaymentId: normalizeOptionalText(input.payment.providerPaymentId),
          providerCheckoutId: normalizeOptionalText(input.payment.providerCheckoutId),
          stripeChargeId: normalizeOptionalText(input.payment.stripeChargeId),
          stripePaymentIntentId: normalizeOptionalText(input.payment.stripePaymentIntentId),
          status: normalizeOptionalText(input.payment.status),
          paidAt: input.payment.paidAt ?? null,
          createdAt: input.payment.createdAt ?? null,
        }
      : null,
    platformFeeOverrideApplied: platformFeeConfig.isOverride,
    platformFeeOverrideNote: platformFeeConfig.overrideNote,
    platformFeeOverrideUpdatedAt: platformFeeConfig.overrideUpdatedAt,
    notes,
    source: {
      bookingId: input.bookingId ?? null,
      bookingCreatedAt: input.bookingCreatedAt ?? null,
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

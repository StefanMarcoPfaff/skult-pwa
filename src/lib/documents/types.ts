import type { Database } from "@/lib/supabase/types";
import type {
  ProviderBillingPayoutMethod,
  ProviderBillingVatStatus,
} from "@/lib/provider-billing-profile";
import type { ProviderType } from "@/lib/provider-profiles";

export const DOCUMENT_TYPES = [
  "customer_receipt",
  "provider_payout_statement",
  "provider_platform_fee_invoice",
  "platform_revenue_statement",
  "refund_receipt",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = ["draft", "issued", "voided"] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export type FinancialDocumentRow = Database["public"]["Tables"]["financial_documents"]["Row"];
export type FinancialDocumentInsert = Database["public"]["Tables"]["financial_documents"]["Insert"];
export type FinancialDocumentUpdate = Database["public"]["Tables"]["financial_documents"]["Update"];
export type FinancialDocumentRecord = FinancialDocumentRow;

export type FinancialDocumentProviderSnapshot = {
  providerId: string;
  providerType: ProviderType | null;
  providerDisplayName: string;
  documentRecipientName: string;
  billingName: string | null;
  billingCompanyName: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingPostalCode: string | null;
  billingCity: string | null;
  billingCountry: string | null;
  billingAddressLines: string[];
  billingAddressFormatted: string | null;
  taxNumber: string | null;
  vatId: string | null;
  vatStatus: ProviderBillingVatStatus | null;
  payoutMethod: ProviderBillingPayoutMethod;
  payoutDestination: string | null;
};

export type FinancialDocumentOfferSnapshot = {
  courseId: string | null;
  title: string | null;
  kind: string | null;
  instructorName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  locationDetails: string | null;
  seatCount?: number | null;
};

export type FinancialDocumentCustomerSnapshot = {
  name: string | null;
  email: string | null;
  billingName: string | null;
  billingStreet: string | null;
  billingHouseNumber: string | null;
  billingPostalCode: string | null;
  billingCity: string | null;
  billingCountry: string | null;
  billingAddressLines: string[];
  billingAddressFormatted: string | null;
};

export type FinancialDocumentPeriodSnapshot = {
  start: string | null;
  end: string | null;
};

export type FinancialDocumentAmountsSnapshot = {
  currency: string;
  grossAmountCents: number;
  platformFeeCents: number;
  providerPayoutCents: number;
  platformFeePercent: number;
  providerSharePercent: number;
  taxAmountCents: number | null;
};

export type FinancialDocumentPaymentSnapshot = {
  provider: string | null;
  paymentTransactionId: string | null;
  providerPaymentId: string | null;
  providerCheckoutId: string | null;
  stripeChargeId: string | null;
  stripePaymentIntentId: string | null;
  status: string | null;
  paidAt: string | null;
  createdAt: string | null;
};

export type FinancialDocumentMetadata = {
  roleNotice: string;
  taxHint: string | null;
  providerBillingProfile: FinancialDocumentProviderSnapshot | null;
  offer: FinancialDocumentOfferSnapshot | null;
  customer: FinancialDocumentCustomerSnapshot | null;
  period: FinancialDocumentPeriodSnapshot | null;
  amounts: FinancialDocumentAmountsSnapshot;
  payment: FinancialDocumentPaymentSnapshot | null;
  notes: string[];
  source: {
    bookingId: string | null;
    bookingCreatedAt: string | null;
    courseId: string | null;
    courseRegistrationIntentId: string | null;
    subscriptionContractId: string | null;
    payoutBatchId: string | null;
    payoutItemId: string | null;
    paymentTransactionId: string | null;
    refundRecordId: string | null;
    ledgerEntryId: string | null;
  };
  [key: string]: unknown;
};

export type CreateFinancialDocumentInput = Omit<
  FinancialDocumentInsert,
  "id" | "created_at" | "updated_at" | "metadata"
> & {
  metadata?: FinancialDocumentMetadata;
  status?: DocumentStatus;
};

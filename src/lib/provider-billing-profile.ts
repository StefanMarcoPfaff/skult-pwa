import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  getProfileAccountName,
  getProviderDisplayName,
  type ProviderType,
} from "@/lib/provider-profiles";
import { PROVIDER_PAYOUT_PROFILE_PROVIDER } from "@/lib/payout-profile";

export const PROVIDER_BILLING_PAYOUT_METHODS = ["iban", "paypal"] as const;
export type ProviderBillingPayoutMethod = (typeof PROVIDER_BILLING_PAYOUT_METHODS)[number];

export const PROVIDER_BILLING_VAT_STATUSES = [
  "small_business",
  "vat_registered",
  "tax_exempt",
] as const;
export type ProviderBillingVatStatus = (typeof PROVIDER_BILLING_VAT_STATUSES)[number];

export type ProviderBillingProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  provider_type: ProviderType | null;
  organization_name: string | null;
  payout_method: string | null;
  billing_name: string | null;
  billing_company_name: string | null;
  billing_address_line_1: string | null;
  billing_address_line_2: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
  tax_number: string | null;
  vat_id: string | null;
  vat_status: string | null;
  payout_iban: string | null;
  payout_paypal_email: string | null;
};

type ProviderFinancialPayoutProfileRow = {
  id: string;
  teacher_id: string | null;
  payout_method: string | null;
  iban_last4: string | null;
  paypal_email: string | null;
  account_holder_name: string | null;
  address: string | null;
  tax_number: string | null;
  vat_id: string | null;
  vat_status: string | null;
  billing_name: string | null;
  billing_company_name: string | null;
  billing_address_line_1: string | null;
  billing_address_line_2: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
  provider_account_id: string | null;
  verification_status: string | null;
  platform_fee_percent_override: number | string | null;
};

export type ProviderBillingProfile = {
  providerId: string;
  providerType: ProviderType | null;
  providerDisplayName: string;
  billingName: string | null;
  billingCompanyName: string | null;
  documentRecipientName: string;
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
  payoutIban: string | null;
  payoutPaypalEmail: string | null;
  payoutDestination: string | null;
  providerPayoutProfileId: string | null;
  providerAccountId: string | null;
  verificationStatus: string | null;
  platformFeePercentOverride: number | string | null;
  usedLegacyProfileFallback: boolean;
};

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

export function isProviderBillingPayoutMethod(
  value: string | null | undefined
): value is ProviderBillingPayoutMethod {
  return value === "iban" || value === "paypal";
}

export function isProviderBillingVatStatus(
  value: string | null | undefined
): value is ProviderBillingVatStatus {
  return (
    value === "small_business" ||
    value === "vat_registered" ||
    value === "tax_exempt"
  );
}

export function getProviderBillingProfileFromRow(
  row: ProviderBillingProfileRow,
  payoutProfile?: ProviderFinancialPayoutProfileRow | null
): ProviderBillingProfile {
  const providerType = row.provider_type ?? null;
  const providerDisplayName = providerType
    ? getProviderDisplayName(providerType, row)
    : getProfileAccountName(row) || normalizeOptionalText(row.organization_name) || "Anbietende";
  const billingName = normalizeOptionalText(payoutProfile?.billing_name) ?? normalizeOptionalText(row.billing_name);
  const billingCompanyName =
    normalizeOptionalText(payoutProfile?.billing_company_name) ?? normalizeOptionalText(row.billing_company_name);
  const billingAddressLine1 =
    normalizeOptionalText(payoutProfile?.billing_address_line_1) ?? normalizeOptionalText(row.billing_address_line_1);
  const billingAddressLine2 =
    normalizeOptionalText(payoutProfile?.billing_address_line_2) ?? normalizeOptionalText(row.billing_address_line_2);
  const billingPostalCode =
    normalizeOptionalText(payoutProfile?.billing_postal_code) ?? normalizeOptionalText(row.billing_postal_code);
  const billingCity = normalizeOptionalText(payoutProfile?.billing_city) ?? normalizeOptionalText(row.billing_city);
  const billingCountry =
    normalizeOptionalText(payoutProfile?.billing_country) ?? normalizeOptionalText(row.billing_country);
  const fallbackAddressLines = normalizeOptionalText(payoutProfile?.address)
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean) ?? [];
  const cityLine = [billingPostalCode, billingCity].filter(Boolean).join(" ").trim() || null;
  const structuredBillingAddressLines = [
    billingAddressLine1,
    billingAddressLine2,
    cityLine,
    billingCountry,
  ].filter((value): value is string => Boolean(value));
  const billingAddressLines =
    structuredBillingAddressLines.length > 0 ? structuredBillingAddressLines : fallbackAddressLines;
  const payoutMethod = isProviderBillingPayoutMethod(payoutProfile?.payout_method)
    ? payoutProfile.payout_method
    : isProviderBillingPayoutMethod(row.payout_method)
      ? row.payout_method
      : "iban";
  const payoutIbanLast4 = normalizeOptionalText(payoutProfile?.iban_last4);
  const payoutIban = payoutIbanLast4 ? `IBAN ****${payoutIbanLast4}` : normalizeOptionalText(row.payout_iban);
  const payoutPaypalEmail =
    normalizeOptionalText(payoutProfile?.paypal_email)?.toLowerCase() ??
    normalizeOptionalText(row.payout_paypal_email)?.toLowerCase() ??
    null;
  const payoutDestination = payoutMethod === "paypal" ? payoutPaypalEmail : payoutIban;
  const taxNumber = normalizeOptionalText(payoutProfile?.tax_number) ?? normalizeOptionalText(row.tax_number);
  const vatId = normalizeOptionalText(payoutProfile?.vat_id) ?? normalizeOptionalText(row.vat_id);
  const vatStatusRaw = normalizeOptionalText(payoutProfile?.vat_status) ?? normalizeOptionalText(row.vat_status);
  const usedLegacyProfileFallback =
    !payoutProfile?.id ||
    !normalizeOptionalText(payoutProfile.billing_name) ||
    !normalizeOptionalText(payoutProfile.billing_company_name) ||
    structuredBillingAddressLines.length === 0 ||
    !normalizeOptionalText(payoutProfile.tax_number) ||
    !normalizeOptionalText(payoutProfile.vat_id) ||
    !normalizeOptionalText(payoutProfile.vat_status) ||
    !payoutDestination;

  return {
    providerId: row.id,
    providerType,
    providerDisplayName,
    billingName,
    billingCompanyName,
    documentRecipientName:
      billingCompanyName ||
      billingName ||
      providerDisplayName,
    billingAddressLine1,
    billingAddressLine2,
    billingPostalCode,
    billingCity,
    billingCountry,
    billingAddressLines,
    billingAddressFormatted: billingAddressLines.length > 0 ? billingAddressLines.join("\n") : null,
    taxNumber,
    vatId,
    vatStatus: isProviderBillingVatStatus(vatStatusRaw) ? vatStatusRaw : null,
    payoutMethod,
    payoutIban,
    payoutPaypalEmail,
    payoutDestination,
    providerPayoutProfileId: payoutProfile?.id ?? null,
    providerAccountId: normalizeOptionalText(payoutProfile?.provider_account_id),
    verificationStatus: normalizeOptionalText(payoutProfile?.verification_status),
    platformFeePercentOverride: payoutProfile?.platform_fee_percent_override ?? null,
    usedLegacyProfileFallback,
  };
}

export async function getProviderBillingProfile(
  supabase: SupabaseClient<Database>,
  providerId: string
): Promise<ProviderBillingProfile | null> {
  const [{ data, error }, { data: payoutProfile }] = await Promise.all([
    supabase
    .from("profiles")
    .select(
      [
        "id",
        "first_name",
        "last_name",
        "provider_type",
        "organization_name",
        "payout_method",
        "billing_name",
        "billing_company_name",
        "billing_address_line_1",
        "billing_address_line_2",
        "billing_postal_code",
        "billing_city",
        "billing_country",
        "tax_number",
        "vat_id",
        "vat_status",
        "payout_iban",
        "payout_paypal_email",
      ].join(",")
    )
    .eq("id", providerId)
      .maybeSingle<ProviderBillingProfileRow>(),
    supabase
      .from("provider_payout_profiles")
      .select(
        [
          "id",
          "teacher_id",
          "payout_method",
          "iban_last4",
          "paypal_email",
          "account_holder_name",
          "address",
          "tax_number",
          "vat_id",
          "vat_status",
          "billing_name",
          "billing_company_name",
          "billing_address_line_1",
          "billing_address_line_2",
          "billing_postal_code",
          "billing_city",
          "billing_country",
          "provider_account_id",
          "verification_status",
          "platform_fee_percent_override",
        ].join(",")
      )
      .eq("teacher_id", providerId)
      .eq("provider", PROVIDER_PAYOUT_PROFILE_PROVIDER)
      .maybeSingle<ProviderFinancialPayoutProfileRow>(),
  ]);

  if (error || !data) {
    return null;
  }

  return getProviderBillingProfileFromRow(data, payoutProfile ?? null);
}

export const getProviderFinancialProfile = getProviderBillingProfile;

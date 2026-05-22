import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  getProfileAccountName,
  getProviderDisplayName,
  type ProviderType,
} from "@/lib/provider-profiles";

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
  row: ProviderBillingProfileRow
): ProviderBillingProfile {
  const providerType = row.provider_type ?? null;
  const providerDisplayName = providerType
    ? getProviderDisplayName(providerType, row)
    : getProfileAccountName(row) || normalizeOptionalText(row.organization_name) || "Anbietende";
  const billingName = normalizeOptionalText(row.billing_name);
  const billingCompanyName = normalizeOptionalText(row.billing_company_name);
  const billingAddressLine1 = normalizeOptionalText(row.billing_address_line_1);
  const billingAddressLine2 = normalizeOptionalText(row.billing_address_line_2);
  const billingPostalCode = normalizeOptionalText(row.billing_postal_code);
  const billingCity = normalizeOptionalText(row.billing_city);
  const billingCountry = normalizeOptionalText(row.billing_country);
  const cityLine = [billingPostalCode, billingCity].filter(Boolean).join(" ").trim() || null;
  const billingAddressLines = [
    billingAddressLine1,
    billingAddressLine2,
    cityLine,
    billingCountry,
  ].filter((value): value is string => Boolean(value));
  const payoutMethod = isProviderBillingPayoutMethod(row.payout_method) ? row.payout_method : "iban";
  const payoutIban = normalizeOptionalText(row.payout_iban);
  const payoutPaypalEmail = normalizeOptionalText(row.payout_paypal_email)?.toLowerCase() ?? null;
  const payoutDestination = payoutMethod === "paypal" ? payoutPaypalEmail : payoutIban;

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
    taxNumber: normalizeOptionalText(row.tax_number),
    vatId: normalizeOptionalText(row.vat_id),
    vatStatus: isProviderBillingVatStatus(row.vat_status) ? row.vat_status : null,
    payoutMethod,
    payoutIban,
    payoutPaypalEmail,
    payoutDestination,
  };
}

export async function getProviderBillingProfile(
  supabase: SupabaseClient<Database>,
  providerId: string
): Promise<ProviderBillingProfile | null> {
  const { data, error } = await supabase
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
    .maybeSingle<ProviderBillingProfileRow>();

  if (error || !data) {
    return null;
  }

  return getProviderBillingProfileFromRow(data);
}

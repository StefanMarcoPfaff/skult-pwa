import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  getProfileAccountName,
  getProviderDisplayName,
  type ProviderType,
} from "@/lib/provider-profiles";
import { PROVIDER_PAYOUT_PROFILE_PROVIDER } from "@/lib/payout-profile";

export const PROVIDER_BILLING_PAYOUT_METHODS = ["iban"] as const;
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

export type ProviderLegalEntityType = "individual" | "company" | "nonprofit";

export type ProviderFinancialPayoutProfileRow = {
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
  stripe_account_type: string | null;
  stripe_verification_status: string | null;
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
  stripe_details_submitted: boolean | null;
  stripe_capability_card_payments: string | null;
  stripe_capability_transfers: string | null;
  stripe_requirements_currently_due: string[] | null;
  stripe_requirements_eventually_due: string[] | null;
  stripe_requirements_past_due: string[] | null;
  stripe_requirements_disabled_reason: string | null;
  stripe_last_sync_at: string | null;
  legal_entity_type: string | null;
  business_type: string | null;
  representative_first_name: string | null;
  representative_last_name: string | null;
  representative_birth_date: string | null;
  representative_email: string | null;
  representative_phone: string | null;
  legal_address_line1: string | null;
  legal_address_line2: string | null;
  legal_postal_code: string | null;
  legal_city: string | null;
  legal_country: string | null;
  stripe_terms_accepted_at: string | null;
  stripe_terms_accepted_ip: string | null;
  stripe_terms_accepted_user_agent: string | null;
  business_profile_url: string | null;
  business_profile_mcc: string | null;
  business_profile_product_description: string | null;
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
  accountHolderName: string | null;
  providerPayoutProfileId: string | null;
  providerAccountId: string | null;
  verificationStatus: string | null;
  platformFeePercentOverride: number | string | null;
  stripeAccountType: string | null;
  stripeVerificationStatus: string | null;
  stripeChargesEnabled: boolean | null;
  stripePayoutsEnabled: boolean | null;
  stripeDetailsSubmitted: boolean | null;
  stripeCapabilityCardPayments: string | null;
  stripeCapabilityTransfers: string | null;
  stripeRequirementsCurrentlyDue: string[];
  stripeRequirementsEventuallyDue: string[];
  stripeRequirementsPastDue: string[];
  stripeRequirementsDisabledReason: string | null;
  stripeLastSyncAt: string | null;
  legalEntityType: ProviderLegalEntityType | null;
  businessType: string | null;
  representativeFirstName: string | null;
  representativeLastName: string | null;
  representativeBirthDate: string | null;
  representativeEmail: string | null;
  representativePhone: string | null;
  legalAddressLine1: string | null;
  legalAddressLine2: string | null;
  legalPostalCode: string | null;
  legalCity: string | null;
  legalCountry: string | null;
  stripeTermsAcceptedAt: string | null;
  stripeTermsAcceptedIp: string | null;
  stripeTermsAcceptedUserAgent: string | null;
  businessProfileUrl: string | null;
  businessProfileMcc: string | null;
  businessProfileProductDescription: string | null;
  usedLegacyProfileFallback: boolean;
};

export type ProviderCustomConnectReadiness = {
  isReadyForCustomAccountCreation: boolean;
  missingFields: string[];
  warnings: string[];
  statusLabel: string;
};

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

export function isProviderBillingPayoutMethod(
  value: string | null | undefined
): value is ProviderBillingPayoutMethod {
  return value === "iban";
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

function isProviderLegalEntityType(
  value: string | null | undefined
): value is ProviderLegalEntityType {
  return value === "individual" || value === "company" || value === "nonprofit";
}

function normalizeStringArray(value: string[] | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((item) => Boolean(normalizeOptionalText(item))) : [];
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
  const payoutMethod: ProviderBillingPayoutMethod = "iban";
  const payoutIbanLast4 = normalizeOptionalText(payoutProfile?.iban_last4);
  const payoutIban = payoutIbanLast4 ? `IBAN ****${payoutIbanLast4}` : normalizeOptionalText(row.payout_iban);
  const payoutPaypalEmail = null;
  const payoutDestination = payoutIban;
  const accountHolderName = normalizeOptionalText(payoutProfile?.account_holder_name);
  const taxNumber = normalizeOptionalText(payoutProfile?.tax_number) ?? normalizeOptionalText(row.tax_number);
  const vatId = normalizeOptionalText(payoutProfile?.vat_id) ?? normalizeOptionalText(row.vat_id);
  const vatStatusRaw = normalizeOptionalText(payoutProfile?.vat_status) ?? normalizeOptionalText(row.vat_status);
  const representativeFirstName =
    normalizeOptionalText(payoutProfile?.representative_first_name) ?? normalizeOptionalText(row.first_name);
  const representativeLastName =
    normalizeOptionalText(payoutProfile?.representative_last_name) ?? normalizeOptionalText(row.last_name);
  const legalAddressLine1 =
    normalizeOptionalText(payoutProfile?.legal_address_line1) ?? billingAddressLine1;
  const legalAddressLine2 =
    normalizeOptionalText(payoutProfile?.legal_address_line2) ?? billingAddressLine2;
  const legalPostalCode =
    normalizeOptionalText(payoutProfile?.legal_postal_code) ?? billingPostalCode;
  const legalCity = normalizeOptionalText(payoutProfile?.legal_city) ?? billingCity;
  const legalCountry = normalizeOptionalText(payoutProfile?.legal_country) ?? billingCountry;
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
    accountHolderName,
    providerPayoutProfileId: payoutProfile?.id ?? null,
    providerAccountId: normalizeOptionalText(payoutProfile?.provider_account_id),
    verificationStatus: normalizeOptionalText(payoutProfile?.verification_status),
    platformFeePercentOverride: payoutProfile?.platform_fee_percent_override ?? null,
    stripeAccountType: normalizeOptionalText(payoutProfile?.stripe_account_type),
    stripeVerificationStatus: normalizeOptionalText(payoutProfile?.stripe_verification_status),
    stripeChargesEnabled: payoutProfile?.stripe_charges_enabled ?? null,
    stripePayoutsEnabled: payoutProfile?.stripe_payouts_enabled ?? null,
    stripeDetailsSubmitted: payoutProfile?.stripe_details_submitted ?? null,
    stripeCapabilityCardPayments: normalizeOptionalText(payoutProfile?.stripe_capability_card_payments),
    stripeCapabilityTransfers: normalizeOptionalText(payoutProfile?.stripe_capability_transfers),
    stripeRequirementsCurrentlyDue: normalizeStringArray(payoutProfile?.stripe_requirements_currently_due),
    stripeRequirementsEventuallyDue: normalizeStringArray(payoutProfile?.stripe_requirements_eventually_due),
    stripeRequirementsPastDue: normalizeStringArray(payoutProfile?.stripe_requirements_past_due),
    stripeRequirementsDisabledReason: normalizeOptionalText(payoutProfile?.stripe_requirements_disabled_reason),
    stripeLastSyncAt: payoutProfile?.stripe_last_sync_at ?? null,
    legalEntityType: isProviderLegalEntityType(payoutProfile?.legal_entity_type)
      ? payoutProfile.legal_entity_type
      : null,
    businessType: normalizeOptionalText(payoutProfile?.business_type),
    representativeFirstName,
    representativeLastName,
    representativeBirthDate: payoutProfile?.representative_birth_date ?? null,
    representativeEmail: normalizeOptionalText(payoutProfile?.representative_email),
    representativePhone: normalizeOptionalText(payoutProfile?.representative_phone),
    legalAddressLine1,
    legalAddressLine2,
    legalPostalCode,
    legalCity,
    legalCountry,
    stripeTermsAcceptedAt: payoutProfile?.stripe_terms_accepted_at ?? null,
    stripeTermsAcceptedIp: normalizeOptionalText(payoutProfile?.stripe_terms_accepted_ip),
    stripeTermsAcceptedUserAgent: normalizeOptionalText(payoutProfile?.stripe_terms_accepted_user_agent),
    businessProfileUrl: normalizeOptionalText(payoutProfile?.business_profile_url),
    businessProfileMcc: normalizeOptionalText(payoutProfile?.business_profile_mcc),
    businessProfileProductDescription: normalizeOptionalText(payoutProfile?.business_profile_product_description),
    usedLegacyProfileFallback,
  };
}

export function getProviderCustomConnectReadiness(
  profile: ProviderBillingProfile | null
): ProviderCustomConnectReadiness {
  const missingFields: string[] = [];
  const warnings: string[] = [];

  if (!profile?.providerPayoutProfileId) {
    missingFields.push("Auszahlungsangaben fehlen");
  }

  if (!profile?.payoutDestination || !profile.accountHolderName) {
    missingFields.push("Auszahlungskonto fehlt");
    warnings.push("Auszahlungskonto fehlt.");
  }

  if (!profile?.legalEntityType) {
    missingFields.push("Rechtsform fehlt");
  }

  if (!profile?.representativeFirstName || !profile.representativeLastName) {
    missingFields.push("Name fehlt");
  }

  if (!profile?.representativeBirthDate) {
    missingFields.push("Geburtsdatum fehlt");
  }

  if (!profile?.representativeEmail) {
    missingFields.push("E-Mail-Adresse fehlt");
  }

  if (
    !profile?.legalAddressLine1 ||
    !profile.legalPostalCode ||
    !profile.legalCity ||
    !profile.legalCountry
  ) {
    missingFields.push("Adresse fehlt");
  }

  if (!profile?.stripeTermsAcceptedAt) {
    missingFields.push("Zustimmung fehlt");
  }

  if (profile?.usedLegacyProfileFallback) {
    warnings.push("Einige Finanzdaten stammen noch aus Legacy-Profilfeldern.");
  }

  if (profile?.stripeRequirementsCurrentlyDue.length) {
    warnings.push("Der Zahlungsdienstleister benötigt weitere Angaben.");
  }

  if (profile?.stripeRequirementsPastDue.length) {
    warnings.push("Der Zahlungsdienstleister benötigt weitere Angaben.");
  }

  if (profile?.stripeRequirementsDisabledReason) {
    warnings.push("Auszahlungen sind vorübergehend nicht möglich.");
  }

  const hasCustomAccount = Boolean(profile?.providerAccountId);
  const isReadyForCustomAccountCreation = missingFields.length === 0 && !hasCustomAccount;
  let statusLabel = "Angaben fehlen noch";

  if (profile?.stripePayoutsEnabled && profile.stripeChargesEnabled) {
    statusLabel = "Auszahlungen möglich";
  } else if (profile?.stripeRequirementsDisabledReason) {
    statusLabel = "Auszahlungen pausiert";
  } else if (hasCustomAccount && profile?.stripeVerificationStatus !== "verified") {
    statusLabel = "Weitere Angaben erforderlich";
  } else if (hasCustomAccount) {
    statusLabel = "Angaben werden automatisch geprüft";
  } else if (isReadyForCustomAccountCreation) {
    statusLabel = "Angaben vollständig";
  } else if (!profile?.providerPayoutProfileId) {
    statusLabel = "Auszahlungsangaben fehlen";
  }

  return {
    isReadyForCustomAccountCreation,
    missingFields,
    warnings,
    statusLabel,
  };
}

export async function getProviderBillingProfile(
  supabase: SupabaseClient<Database>,
  providerId: string
): Promise<ProviderBillingProfile | null> {
  const [{ data, error }, payoutProfileResult] = await Promise.all([
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
          "stripe_account_type",
          "stripe_verification_status",
          "stripe_charges_enabled",
          "stripe_payouts_enabled",
          "stripe_details_submitted",
          "stripe_capability_card_payments",
          "stripe_capability_transfers",
          "stripe_requirements_currently_due",
          "stripe_requirements_eventually_due",
          "stripe_requirements_past_due",
          "stripe_requirements_disabled_reason",
          "stripe_last_sync_at",
          "legal_entity_type",
          "business_type",
          "representative_first_name",
          "representative_last_name",
          "representative_birth_date",
          "representative_email",
          "representative_phone",
          "legal_address_line1",
          "legal_address_line2",
          "legal_postal_code",
          "legal_city",
          "legal_country",
          "stripe_terms_accepted_at",
          "stripe_terms_accepted_ip",
          "stripe_terms_accepted_user_agent",
          "business_profile_url",
          "business_profile_mcc",
          "business_profile_product_description",
        ].join(",")
      )
      .eq("teacher_id", providerId)
      .eq("provider", PROVIDER_PAYOUT_PROFILE_PROVIDER)
      .order("updated_at", { ascending: false })
      .limit(1)
      .returns<ProviderFinancialPayoutProfileRow[]>(),
  ]);

  if (error || !data) {
    return null;
  }

  if (payoutProfileResult.error) {
    console.error("[provider-billing-profile]", {
      kind: "provider_payout_profile_load_error",
      providerId,
      provider: PROVIDER_PAYOUT_PROFILE_PROVIDER,
      message: payoutProfileResult.error.message,
      details: payoutProfileResult.error.details,
      hint: payoutProfileResult.error.hint,
      code: payoutProfileResult.error.code,
    });
  }

  const payoutProfile = payoutProfileResult.data?.[0] ?? null;

  return getProviderBillingProfileFromRow(data, payoutProfile ?? null);
}

export const getProviderFinancialProfile = getProviderBillingProfile;

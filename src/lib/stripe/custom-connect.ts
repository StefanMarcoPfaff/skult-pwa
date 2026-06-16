import "server-only";

import type Stripe from "stripe";
import {
  getProviderBillingProfile,
  getProviderCustomConnectReadiness,
  type ProviderBillingProfile,
} from "@/lib/provider-billing-profile";
import { PROVIDER_PAYOUT_PROFILE_PROVIDER } from "@/lib/payout-profile";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { normalizeGermanPhoneForStripe } from "@/lib/stripe/phone-normalization";

type StripeVerificationStatus =
  | "pending"
  | "requires_action"
  | "past_due"
  | "disabled"
  | "verified";

function optionalText(value: string | null | undefined): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : undefined;
}

function mapBusinessType(
  profile: ProviderBillingProfile
): Stripe.AccountCreateParams.BusinessType {
  if (profile.legalEntityType === "nonprofit") return "non_profit";
  if (profile.legalEntityType === "company") return "company";
  return "individual";
}

function parseBirthDate(value: string | null): Stripe.AccountCreateParams.Individual.Dob | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return undefined;
  return { year, month, day };
}

function mapAddress(profile: ProviderBillingProfile): Stripe.AddressParam | undefined {
  const line1 = optionalText(profile.legalAddressLine1);
  const postalCode = optionalText(profile.legalPostalCode);
  const city = optionalText(profile.legalCity);

  if (!line1 || !postalCode || !city) return undefined;

  return {
    line1,
    line2: optionalText(profile.legalAddressLine2),
    postal_code: postalCode,
    city,
    country: "DE",
  };
}

function mapTosAcceptance(
  profile: ProviderBillingProfile
): Stripe.AccountCreateParams.TosAcceptance | undefined {
  if (!profile.stripeTermsAcceptedAt) return undefined;
  const acceptedAt = Date.parse(profile.stripeTermsAcceptedAt);
  if (Number.isNaN(acceptedAt)) return undefined;

  return {
    date: Math.floor(acceptedAt / 1000),
    ip: optionalText(profile.stripeTermsAcceptedIp),
    user_agent: optionalText(profile.stripeTermsAcceptedUserAgent),
  };
}

function deriveStripeVerificationStatus(account: Stripe.Account): StripeVerificationStatus {
  const requirements = account.requirements;
  const cardPayments = account.capabilities?.card_payments ?? null;
  const transfers = account.capabilities?.transfers ?? null;

  if (requirements?.disabled_reason) return "disabled";
  if (requirements?.past_due?.length) return "past_due";
  if (requirements?.currently_due?.length) return "requires_action";
  if (
    account.details_submitted &&
    account.charges_enabled &&
    account.payouts_enabled &&
    cardPayments === "active" &&
    transfers === "active"
  ) {
    return "verified";
  }

  return "pending";
}

function mapStatusPayload(account: Stripe.Account) {
  const requirements = account.requirements;
  const capabilities = account.capabilities;

  return {
    provider_account_id: account.id,
    stripe_account_type: "custom",
    stripe_verification_status: deriveStripeVerificationStatus(account),
    stripe_charges_enabled: account.charges_enabled,
    stripe_payouts_enabled: account.payouts_enabled,
    stripe_details_submitted: account.details_submitted,
    stripe_capability_card_payments: capabilities?.card_payments ?? null,
    stripe_capability_transfers: capabilities?.transfers ?? null,
    stripe_requirements_currently_due: requirements?.currently_due ?? [],
    stripe_requirements_eventually_due: requirements?.eventually_due ?? [],
    stripe_requirements_past_due: requirements?.past_due ?? [],
    stripe_requirements_disabled_reason: requirements?.disabled_reason ?? null,
    stripe_last_sync_at: new Date().toISOString(),
  };
}

function toUpdateParams(
  params: Stripe.AccountCreateParams
): Stripe.AccountUpdateParams {
  const updateParams = stripBusinessProfileMcc({ ...params });
  delete updateParams.country;
  delete updateParams.controller;
  delete updateParams.type;
  return updateParams as Stripe.AccountUpdateParams;
}

function stripBusinessProfileMcc<T extends Stripe.AccountCreateParams | Stripe.AccountUpdateParams>(
  params: T
): T {
  if (params.business_profile && "mcc" in params.business_profile) {
    delete (params.business_profile as Stripe.AccountCreateParams.BusinessProfile & { mcc?: string }).mcc;
  }

  return params;
}

function getErrorProperty(error: unknown, key: string): unknown {
  return typeof error === "object" && error !== null && key in error
    ? (error as Record<string, unknown>)[key]
    : null;
}

function getStripeErrorLogPayload(error: unknown): Record<string, unknown> {
  const raw = getErrorProperty(error, "raw") as Record<string, unknown> | null;

  return {
    message: error instanceof Error ? error.message : String(error),
    type: getErrorProperty(error, "type"),
    code: getErrorProperty(error, "code"),
    param: getErrorProperty(error, "param"),
    docUrl: getErrorProperty(error, "doc_url"),
    requestId: getErrorProperty(error, "requestId"),
    statusCode: getErrorProperty(error, "statusCode"),
    rawMessage: raw?.message ?? null,
    rawType: raw?.type ?? null,
    rawCode: raw?.code ?? null,
    rawParam: raw?.param ?? null,
    rawRequestId: raw?.requestId ?? null,
  };
}

function getStripeAccountParamDiagnostics(
  params: Stripe.AccountCreateParams,
  profile: ProviderBillingProfile
) {
  const originalPhonePresent = Boolean(optionalText(profile.representativePhone));

  return {
    hasEmail: Boolean(params.email),
    businessType: params.business_type ?? null,
    mccOmitted: true,
    hasBusinessProfileUrl: Boolean(params.business_profile?.url),
    hasBusinessProfileProductDescription: Boolean(params.business_profile?.product_description),
    hasTosAcceptanceDate: Boolean(params.tos_acceptance?.date),
    hasTosAcceptanceIp: Boolean(params.tos_acceptance?.ip),
    hasTosAcceptanceUserAgent: Boolean(params.tos_acceptance?.user_agent),
    requestedCardPayments: Boolean(params.capabilities?.card_payments?.requested),
    requestedTransfers: Boolean(params.capabilities?.transfers?.requested),
    individual: params.business_type === "individual"
      ? {
          hasFirstName: Boolean(params.individual?.first_name),
          hasLastName: Boolean(params.individual?.last_name),
          hasEmail: Boolean(params.individual?.email),
          hasPhone: Boolean(params.individual?.phone),
          originalPhonePresent,
          normalizedPhonePresent: Boolean(params.individual?.phone),
          hasDob: Boolean(params.individual?.dob),
          hasAddressLine1: Boolean(params.individual?.address?.line1),
          hasAddressPostalCode: Boolean(params.individual?.address?.postal_code),
          hasAddressCity: Boolean(params.individual?.address?.city),
          addressCountry: params.individual?.address?.country ?? null,
        }
      : null,
    company: params.business_type !== "individual"
      ? {
          hasName: Boolean(params.company?.name),
          hasPhone: Boolean(params.company?.phone),
          originalPhonePresent,
          normalizedPhonePresent: Boolean(params.company?.phone),
          hasAddressLine1: Boolean(params.company?.address?.line1),
          hasAddressPostalCode: Boolean(params.company?.address?.postal_code),
          hasAddressCity: Boolean(params.company?.address?.city),
          addressCountry: params.company?.address?.country ?? null,
          hasTaxId: Boolean(params.company?.tax_id),
          hasVatId: Boolean(params.company?.vat_id),
        }
      : null,
  };
}

function logStripeCustomAccountSync(input: {
  kind: "create" | "update" | "retrieve";
  providerId: string;
  payoutProfileId: string;
  account: Stripe.Account;
}) {
  console.info("[stripe-custom-connect]", {
    kind: input.kind,
    providerId: input.providerId,
    providerPayoutProfileId: input.payoutProfileId,
    providerAccountId: input.account.id,
    chargesEnabled: input.account.charges_enabled,
    payoutsEnabled: input.account.payouts_enabled,
    detailsSubmitted: input.account.details_submitted,
    capabilityCardPayments: input.account.capabilities?.card_payments ?? null,
    capabilityTransfers: input.account.capabilities?.transfers ?? null,
    requirementsCurrentlyDue: input.account.requirements?.currently_due ?? [],
    requirementsEventuallyDue: input.account.requirements?.eventually_due ?? [],
    requirementsPastDue: input.account.requirements?.past_due ?? [],
    requirementsDisabledReason: input.account.requirements?.disabled_reason ?? null,
  });
}

async function persistStripeCustomAccountStatus(
  providerId: string,
  payoutProfileId: string,
  account: Stripe.Account
) {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("provider_payout_profiles")
    .update(mapStatusPayload(account))
    .eq("id", payoutProfileId)
    .eq("teacher_id", providerId)
    .eq("provider", PROVIDER_PAYOUT_PROFILE_PROVIDER)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    console.error("[stripe-custom-connect]", {
      kind: "persist_status_error",
      providerId,
      providerPayoutProfileId: payoutProfileId,
      provider: PROVIDER_PAYOUT_PROFILE_PROVIDER,
      providerAccountId: account.id,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(`Stripe Custom Account Status konnte nicht gespeichert werden: ${error.message}`);
  }

  if (!data) {
    console.error("[stripe-custom-connect]", {
      kind: "persist_status_no_row",
      providerId,
      providerPayoutProfileId: payoutProfileId,
      provider: PROVIDER_PAYOUT_PROFILE_PROVIDER,
      providerAccountId: account.id,
    });
    throw new Error("Stripe Custom Account Status konnte keiner Anbieter-Zeile zugeordnet werden.");
  }

  console.info("[stripe-custom-connect]", {
    kind: "persist_status_success",
    providerId,
    providerPayoutProfileId: payoutProfileId,
    provider: PROVIDER_PAYOUT_PROFILE_PROVIDER,
    providerAccountId: account.id,
  });
}

export function mapProviderPayoutProfileToStripeAccountParams(
  profile: ProviderBillingProfile
): Stripe.AccountCreateParams {
  const businessType = mapBusinessType(profile);
  const address = mapAddress(profile);
  const normalizedPhone = normalizeGermanPhoneForStripe(profile.representativePhone);
  const companyName =
    optionalText(profile.billingCompanyName) ||
    optionalText(profile.providerDisplayName) ||
    optionalText(profile.documentRecipientName);
  const businessProfile: Stripe.AccountCreateParams.BusinessProfile = {
    url: optionalText(profile.businessProfileUrl),
    product_description: optionalText(profile.businessProfileProductDescription),
  };

  const params: Stripe.AccountCreateParams = {
    type: "custom",
    country: "DE",
    default_currency: "eur",
    email: optionalText(profile.representativeEmail),
    business_type: businessType,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    controller: {
      fees: { payer: "application" },
      losses: { payments: "application" },
      requirement_collection: "application",
      stripe_dashboard: { type: "none" },
    },
    metadata: {
      provider_id: profile.providerId,
      provider_payout_profile_id: profile.providerPayoutProfileId ?? "",
      source: "reser_provider_payout_profiles",
    },
    business_profile: businessProfile,
    tos_acceptance: mapTosAcceptance(profile),
  };

  if (businessType === "individual") {
    params.individual = {
      first_name: optionalText(profile.representativeFirstName),
      last_name: optionalText(profile.representativeLastName),
      email: optionalText(profile.representativeEmail),
      phone: normalizedPhone,
      dob: parseBirthDate(profile.representativeBirthDate),
      address,
    };
  } else {
    params.company = {
      name: companyName,
      phone: normalizedPhone,
      address,
      tax_id: optionalText(profile.taxNumber),
      vat_id: optionalText(profile.vatId),
    };
  }

  return stripBusinessProfileMcc(params);
}

export async function createOrUpdateCustomAccountForProvider(providerId: string): Promise<Stripe.Account> {
  const supabase = createSupabaseAdmin();
  const profile = await getProviderBillingProfile(supabase, providerId);
  const readiness = getProviderCustomConnectReadiness(profile);

  if (!profile?.providerPayoutProfileId) {
    throw new Error("Auszahlungsprofil fehlt.");
  }

  console.info("[stripe-custom-connect]", {
    kind: "readiness_check",
    providerId,
    providerPayoutProfileId: profile.providerPayoutProfileId,
    provider: PROVIDER_PAYOUT_PROFILE_PROVIDER,
    providerAccountId: profile.providerAccountId,
    stripeAccountType: profile.stripeAccountType,
    customConnectReady: readiness.isReadyForCustomAccountCreation,
    missingFields: readiness.missingFields,
    missingFieldCount: readiness.missingFields.length,
    warnings: readiness.warnings,
    warningCount: readiness.warnings.length,
    willCallStripeAccountsCreate: !profile.providerAccountId && readiness.isReadyForCustomAccountCreation,
    willCallStripeAccountsUpdate: Boolean(profile.providerAccountId),
  });

  if (!profile.providerAccountId && !readiness.isReadyForCustomAccountCreation) {
    console.info("[stripe-custom-connect]", {
      kind: "stripe_write_skipped",
      providerId,
      providerPayoutProfileId: profile.providerPayoutProfileId,
      provider: PROVIDER_PAYOUT_PROFILE_PROVIDER,
      reason: "custom_connect_not_ready",
      missingFields: readiness.missingFields,
      warnings: readiness.warnings,
      stripeAccountsCreateCalled: false,
      stripeAccountsUpdateCalled: false,
    });
    throw new Error(`Auszahlungsabwicklung kann noch nicht vorbereitet werden: ${readiness.missingFields.join(", ")}`);
  }

  const stripe = getStripe();
  const params = stripBusinessProfileMcc(mapProviderPayoutProfileToStripeAccountParams(profile));
  const writeKind = profile.providerAccountId ? "update" : "create";
  let account: Stripe.Account;

  try {
    console.info("[stripe-custom-connect]", {
      kind: `${writeKind}_start`,
      providerId,
      providerPayoutProfileId: profile.providerPayoutProfileId,
      provider: PROVIDER_PAYOUT_PROFILE_PROVIDER,
      providerAccountId: profile.providerAccountId,
      stripeAccountsCreateCalled: false,
      stripeAccountsUpdateCalled: false,
      stripeAccountParamDiagnostics: getStripeAccountParamDiagnostics(params, profile),
    });
    let writtenAccount: Stripe.Account;

    if (profile.providerAccountId) {
      console.info("[stripe-custom-connect]", {
        kind: "stripe_accounts_update_call",
        providerId,
        providerPayoutProfileId: profile.providerPayoutProfileId,
        provider: PROVIDER_PAYOUT_PROFILE_PROVIDER,
        providerAccountId: profile.providerAccountId,
        stripeAccountsCreateCalled: false,
        stripeAccountsUpdateCalled: true,
      });
      writtenAccount = await stripe.accounts.update(profile.providerAccountId, toUpdateParams(params));
    } else {
      console.info("[stripe-custom-connect]", {
        kind: "stripe_accounts_create_call",
        providerId,
        providerPayoutProfileId: profile.providerPayoutProfileId,
        provider: PROVIDER_PAYOUT_PROFILE_PROVIDER,
        stripeAccountsCreateCalled: true,
        stripeAccountsUpdateCalled: false,
      });
      writtenAccount = await stripe.accounts.create(params);
    }

    console.info("[stripe-custom-connect]", {
      kind: `${writeKind}_success`,
      providerId,
      providerPayoutProfileId: profile.providerPayoutProfileId,
      provider: PROVIDER_PAYOUT_PROFILE_PROVIDER,
      providerAccountIdBefore: profile.providerAccountId,
      providerAccountId: writtenAccount.id,
      stripeAccountsCreateCalled: !profile.providerAccountId,
      stripeAccountsUpdateCalled: Boolean(profile.providerAccountId),
    });
    account = await stripe.accounts.retrieve(writtenAccount.id);
  } catch (error: unknown) {
    console.error("[stripe-custom-connect]", {
      kind: `${writeKind}_error`,
      providerId,
      providerPayoutProfileId: profile.providerPayoutProfileId,
      teacherId: providerId,
      provider: PROVIDER_PAYOUT_PROFILE_PROVIDER,
      providerAccountId: profile.providerAccountId,
      ...getStripeErrorLogPayload(error),
    });
    throw error;
  }

  logStripeCustomAccountSync({
    kind: "retrieve",
    providerId,
    payoutProfileId: profile.providerPayoutProfileId,
    account,
  });

  logStripeCustomAccountSync({
    kind: writeKind,
    providerId,
    payoutProfileId: profile.providerPayoutProfileId,
    account,
  });
  await persistStripeCustomAccountStatus(providerId, profile.providerPayoutProfileId, account);
  return account;
}

export async function syncCustomAccountStatus(providerId: string): Promise<Stripe.Account> {
  const supabase = createSupabaseAdmin();
  const profile = await getProviderBillingProfile(supabase, providerId);

  if (!profile?.providerAccountId || !profile.providerPayoutProfileId) {
    throw new Error("Noch kein Stripe Custom Account vorhanden.");
  }

  const stripe = getStripe();
  let account: Stripe.Account;

  try {
    account = await stripe.accounts.retrieve(profile.providerAccountId);
  } catch (error: unknown) {
    console.error("[stripe-custom-connect]", {
      kind: "retrieve_error",
      providerId,
      providerPayoutProfileId: profile.providerPayoutProfileId,
      teacherId: providerId,
      provider: PROVIDER_PAYOUT_PROFILE_PROVIDER,
      providerAccountId: profile.providerAccountId,
      ...getStripeErrorLogPayload(error),
    });
    throw error;
  }
  logStripeCustomAccountSync({
    kind: "retrieve",
    providerId,
    payoutProfileId: profile.providerPayoutProfileId,
    account,
  });
  await persistStripeCustomAccountStatus(providerId, profile.providerPayoutProfileId, account);
  return account;
}

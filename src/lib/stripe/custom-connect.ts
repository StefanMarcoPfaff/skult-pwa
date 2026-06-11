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

  if (requirements?.disabled_reason) return "disabled";
  if (requirements?.past_due?.length) return "past_due";
  if (requirements?.currently_due?.length) return "requires_action";
  if (account.details_submitted && account.charges_enabled && account.payouts_enabled) {
    return "verified";
  }

  return "pending";
}

function mapStatusPayload(account: Stripe.Account) {
  const requirements = account.requirements;

  return {
    provider_account_id: account.id,
    stripe_account_type: "custom",
    stripe_verification_status: deriveStripeVerificationStatus(account),
    stripe_charges_enabled: account.charges_enabled,
    stripe_payouts_enabled: account.payouts_enabled,
    stripe_details_submitted: account.details_submitted,
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
  const updateParams = { ...params };
  delete updateParams.country;
  delete updateParams.controller;
  delete updateParams.type;
  return updateParams as Stripe.AccountUpdateParams;
}

async function persistStripeCustomAccountStatus(providerId: string, account: Stripe.Account) {
  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("provider_payout_profiles")
    .update(mapStatusPayload(account))
    .eq("teacher_id", providerId)
    .eq("provider", PROVIDER_PAYOUT_PROFILE_PROVIDER);

  if (error) {
    throw new Error(`Stripe Custom Account Status konnte nicht gespeichert werden: ${error.message}`);
  }
}

export function mapProviderPayoutProfileToStripeAccountParams(
  profile: ProviderBillingProfile
): Stripe.AccountCreateParams {
  const businessType = mapBusinessType(profile);
  const address = mapAddress(profile);
  const companyName =
    optionalText(profile.billingCompanyName) ||
    optionalText(profile.providerDisplayName) ||
    optionalText(profile.documentRecipientName);
  const businessProfile: Stripe.AccountCreateParams.BusinessProfile = {
    mcc: optionalText(profile.businessProfileMcc),
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
      phone: optionalText(profile.representativePhone),
      dob: parseBirthDate(profile.representativeBirthDate),
      address,
    };
  } else {
    params.company = {
      name: companyName,
      phone: optionalText(profile.representativePhone),
      address,
      tax_id: optionalText(profile.taxNumber),
      vat_id: optionalText(profile.vatId),
    };
  }

  return params;
}

export async function createOrUpdateCustomAccountForProvider(providerId: string): Promise<Stripe.Account> {
  const supabase = createSupabaseAdmin();
  const profile = await getProviderBillingProfile(supabase, providerId);
  const readiness = getProviderCustomConnectReadiness(profile);

  if (!profile?.providerPayoutProfileId) {
    throw new Error("Auszahlungsprofil fehlt.");
  }

  if (!profile.providerAccountId && !readiness.isReadyForCustomAccountCreation) {
    throw new Error(`Auszahlungsabwicklung kann noch nicht vorbereitet werden: ${readiness.missingFields.join(", ")}`);
  }

  const stripe = getStripe();
  const params = mapProviderPayoutProfileToStripeAccountParams(profile);
  const account = profile.providerAccountId
    ? await stripe.accounts.update(profile.providerAccountId, toUpdateParams(params))
    : await stripe.accounts.create(params);

  await persistStripeCustomAccountStatus(providerId, account);
  return account;
}

export async function syncCustomAccountStatus(providerId: string): Promise<Stripe.Account> {
  const supabase = createSupabaseAdmin();
  const profile = await getProviderBillingProfile(supabase, providerId);

  if (!profile?.providerAccountId) {
    throw new Error("Noch kein Stripe Custom Account vorhanden.");
  }

  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(profile.providerAccountId);
  await persistStripeCustomAccountStatus(providerId, account);
  return account;
}

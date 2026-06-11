import Link from "next/link";
import { redirect } from "next/navigation";
import type {
  ProviderBillingProfile,
  ProviderBillingPayoutMethod,
  ProviderBillingVatStatus,
  ProviderLegalEntityType,
} from "@/lib/provider-billing-profile";
import {
  getProviderBillingProfile,
  getProviderCustomConnectReadiness,
} from "@/lib/provider-billing-profile";
import type { ProviderType } from "@/lib/provider-profiles";
import { PROVIDER_PAYOUT_PROFILE_PROVIDER } from "@/lib/payout-profile";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ProfileForm from "./ProfileForm";

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  photo_url: string | null;
  company_logo_url: string | null;
  intro_video_url: string | null;
  provider_type: ProviderType | null;
  organization_name: string | null;
};

type DirectPayoutProfileRow = {
  id: string;
  teacher_id: string | null;
  provider: string | null;
  payout_method: ProviderBillingPayoutMethod | string | null;
  iban_last4: string | null;
  paypal_email: string | null;
  billing_address_line_1: string | null;
  billing_address_line_2: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
  tax_number: string | null;
  vat_id: string | null;
  vat_status: ProviderBillingVatStatus | string | null;
  provider_account_id: string | null;
  legal_entity_type: ProviderLegalEntityType | string | null;
  representative_birth_date: string | null;
  representative_phone: string | null;
  stripe_terms_accepted_at: string | null;
  business_profile_url: string | null;
  business_profile_mcc: string | null;
  business_profile_product_description: string | null;
  stripe_payouts_enabled: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

function getCustomConnectStatusLabel(profile: ProviderBillingProfile | null): string {
  if (!profile?.providerAccountId) return "Noch nicht vorbereitet";
  if (profile.stripePayoutsEnabled) return "Auszahlungen moeglich";
  if (profile.stripeRequirementsCurrentlyDue.length > 0 || profile.stripeRequirementsPastDue.length > 0) {
    return "Weitere Angaben erforderlich";
  }
  if (profile.stripeDetailsSubmitted) return "Angaben werden geprueft";
  return "Auszahlungsabwicklung vorbereitet";
}

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

export default async function DashboardProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const onboardingParam = Array.isArray(sp.onboarding) ? sp.onboarding[0] : sp.onboarding;
  const onboarding = onboardingParam === "1";
  const sectionParam = Array.isArray(sp.section) ? sp.section[0] : sp.section;
  const section = sectionParam ?? "";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const supabaseAdmin = createSupabaseAdmin();
  const [{ data: profile }, financialProfile, directPayoutRowsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,first_name,last_name,bio,photo_url,company_logo_url,intro_video_url,provider_type,organization_name")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>(),
    getProviderBillingProfile(supabaseAdmin, user.id) as Promise<ProviderBillingProfile | null>,
    supabaseAdmin
      .from("provider_payout_profiles")
      .select("*")
      .eq("teacher_id", user.id)
      .eq("provider", PROVIDER_PAYOUT_PROFILE_PROVIDER)
      .order("updated_at", { ascending: false })
      .limit(5)
      .returns<DirectPayoutProfileRow[]>(),
  ]);
  const directPayoutRows = directPayoutRowsResult.data ?? [];
  const directPayoutProfile = directPayoutRows[0] ?? null;
  const effectiveFinancialProfile =
    directPayoutProfile && financialProfile
      ? {
          ...financialProfile,
          providerPayoutProfileId: directPayoutProfile.id,
          providerAccountId: directPayoutProfile.provider_account_id,
          payoutMethod: (directPayoutProfile.payout_method ?? financialProfile.payoutMethod) as ProviderBillingPayoutMethod,
          payoutIban: directPayoutProfile.iban_last4
            ? `IBAN ****${directPayoutProfile.iban_last4}`
            : financialProfile.payoutIban,
          payoutPaypalEmail: directPayoutProfile.paypal_email ?? financialProfile.payoutPaypalEmail,
          payoutDestination:
            directPayoutProfile.payout_method === "paypal"
              ? directPayoutProfile.paypal_email
              : directPayoutProfile.iban_last4
                ? `IBAN ****${directPayoutProfile.iban_last4}`
                : financialProfile.payoutDestination,
          legalEntityType: (directPayoutProfile.legal_entity_type ?? financialProfile.legalEntityType) as ProviderLegalEntityType | null,
          representativeBirthDate: directPayoutProfile.representative_birth_date ?? financialProfile.representativeBirthDate,
          representativePhone: directPayoutProfile.representative_phone ?? financialProfile.representativePhone,
          legalAddressLine1: directPayoutProfile.billing_address_line_1 ?? financialProfile.legalAddressLine1,
          legalAddressLine2: directPayoutProfile.billing_address_line_2 ?? financialProfile.legalAddressLine2,
          legalPostalCode: directPayoutProfile.billing_postal_code ?? financialProfile.legalPostalCode,
          legalCity: directPayoutProfile.billing_city ?? financialProfile.legalCity,
          legalCountry: directPayoutProfile.billing_country ?? financialProfile.legalCountry,
          businessProfileUrl: directPayoutProfile.business_profile_url ?? financialProfile.businessProfileUrl,
          businessProfileMcc: directPayoutProfile.business_profile_mcc ?? financialProfile.businessProfileMcc,
          businessProfileProductDescription:
            directPayoutProfile.business_profile_product_description ??
            financialProfile.businessProfileProductDescription,
          stripeTermsAcceptedAt:
            directPayoutProfile.stripe_terms_accepted_at ?? financialProfile.stripeTermsAcceptedAt,
          stripePayoutsEnabled:
            directPayoutProfile.stripe_payouts_enabled ?? financialProfile.stripePayoutsEnabled,
        }
      : financialProfile;
  const customConnectReadiness = getProviderCustomConnectReadiness(effectiveFinancialProfile);
  const customConnectAccountExists = Boolean(
    directPayoutProfile?.provider_account_id ?? effectiveFinancialProfile?.providerAccountId
  );
  const representativeBirthDate = toDateInputValue(
    directPayoutProfile?.representative_birth_date ?? effectiveFinancialProfile?.representativeBirthDate
  );
  const profileFormInitialValues = {
    first_name: profile?.first_name ?? "",
    last_name: profile?.last_name ?? "",
    auth_email: user.email ?? "",
    phone: directPayoutProfile?.representative_phone ?? effectiveFinancialProfile?.representativePhone ?? "",
    bio: profile?.bio ?? "",
    photo_url: profile?.photo_url ?? "",
    company_logo_url: profile?.company_logo_url ?? "",
    intro_video_url: profile?.intro_video_url ?? "",
    provider_type: profile?.provider_type ?? "independent_teacher",
    organization_name: profile?.organization_name ?? "",
    address_line_1:
      directPayoutProfile?.billing_address_line_1 ??
      effectiveFinancialProfile?.billingAddressLine1 ??
      effectiveFinancialProfile?.legalAddressLine1 ??
      "",
    address_line_2:
      directPayoutProfile?.billing_address_line_2 ??
      effectiveFinancialProfile?.billingAddressLine2 ??
      effectiveFinancialProfile?.legalAddressLine2 ??
      "",
    postal_code:
      directPayoutProfile?.billing_postal_code ??
      effectiveFinancialProfile?.billingPostalCode ??
      effectiveFinancialProfile?.legalPostalCode ??
      "",
    city: directPayoutProfile?.billing_city ?? effectiveFinancialProfile?.billingCity ?? effectiveFinancialProfile?.legalCity ?? "",
    country:
      directPayoutProfile?.billing_country ??
      effectiveFinancialProfile?.billingCountry ??
      effectiveFinancialProfile?.legalCountry ??
      "",
    payout_method: (directPayoutProfile?.payout_method ?? effectiveFinancialProfile?.payoutMethod ?? "iban") as ProviderBillingPayoutMethod,
    tax_number: directPayoutProfile?.tax_number ?? effectiveFinancialProfile?.taxNumber ?? "",
    vat_id: directPayoutProfile?.vat_id ?? effectiveFinancialProfile?.vatId ?? "",
    vat_status: (directPayoutProfile?.vat_status ?? effectiveFinancialProfile?.vatStatus ?? "") as ProviderBillingVatStatus | "",
    iban_last4: directPayoutProfile?.iban_last4 ?? effectiveFinancialProfile?.payoutIban?.replace(/^.*(\d{4})$/, "$1") ?? "",
    paypal_email: directPayoutProfile?.paypal_email ?? effectiveFinancialProfile?.payoutPaypalEmail ?? "",
    legal_entity_type: (directPayoutProfile?.legal_entity_type ?? effectiveFinancialProfile?.legalEntityType ?? "") as ProviderLegalEntityType | "",
    representative_birth_date: representativeBirthDate,
    business_profile_url: directPayoutProfile?.business_profile_url ?? effectiveFinancialProfile?.businessProfileUrl ?? "",
    business_profile_mcc: directPayoutProfile?.business_profile_mcc ?? effectiveFinancialProfile?.businessProfileMcc ?? "",
    business_profile_product_description:
      directPayoutProfile?.business_profile_product_description ??
      effectiveFinancialProfile?.businessProfileProductDescription ??
      "",
    consentAccepted: Boolean(directPayoutProfile?.stripe_terms_accepted_at ?? effectiveFinancialProfile?.stripeTermsAcceptedAt),
    payoutComplete: Boolean(
      directPayoutProfile?.provider_account_id ||
      directPayoutProfile?.iban_last4 ||
      directPayoutProfile?.paypal_email ||
      effectiveFinancialProfile?.payoutDestination
    ),
    customConnectAccountExists,
    customConnectReady: customConnectReadiness.isReadyForCustomAccountCreation,
    customConnectStatusLabel: getCustomConnectStatusLabel(effectiveFinancialProfile),
    customConnectMissingFields: customConnectReadiness.missingFields,
    customConnectWarnings: customConnectReadiness.warnings,
    stripeRequirementsCurrentlyDue: effectiveFinancialProfile?.stripeRequirementsCurrentlyDue ?? [],
    stripeRequirementsPastDue: effectiveFinancialProfile?.stripeRequirementsPastDue ?? [],
    stripePayoutsEnabled: Boolean(directPayoutProfile?.stripe_payouts_enabled ?? effectiveFinancialProfile?.stripePayoutsEnabled),
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <Link href="/dashboard" className="inline-flex text-sm font-medium underline underline-offset-4">
        Zurueck zum Dashboard
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Mein Profil</h1>
        <p className="text-sm text-muted-foreground">
          Diese Angaben bilden die Grundlage fuer dein Profil als Anbietende.
        </p>
      </header>

      {onboarding ? (
        <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          Willkommen. Bitte vervollstaendige jetzt dein Profil, damit du anschliessend Angebote anlegen kannst.
        </p>
      ) : null}

      <div className="rounded-2xl border p-6">
        <ProfileForm
          initialValues={profileFormInitialValues}
          pageDebug={{
            pageUserId: user.id,
            directPayoutRows,
            loadedProviderPayoutProfileId:
              directPayoutProfile?.id ?? financialProfile?.providerPayoutProfileId ?? null,
            providerAccountId: directPayoutProfile?.provider_account_id ?? financialProfile?.providerAccountId ?? null,
            legal_entity_type: profileFormInitialValues.legal_entity_type,
            representative_birth_date: profileFormInitialValues.representative_birth_date,
            business_profile_url: profileFormInitialValues.business_profile_url,
            business_profile_product_description: profileFormInitialValues.business_profile_product_description,
            consentAccepted: profileFormInitialValues.consentAccepted,
            payout_method: profileFormInitialValues.payout_method,
            customConnectMissingFields: customConnectReadiness.missingFields,
            customConnectReady: customConnectReadiness.isReadyForCustomAccountCreation,
          }}
          initialSection={section}
        />
      </div>
    </main>
  );
}
